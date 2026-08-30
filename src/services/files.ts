import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import { getStorage } from '../storage/index.js';
import { randomToken } from '../utils/crypto.js';
import { closeReportsForMissingFiles, deleteReportsForMissingFiles } from './reports.js';
import { getSettings } from './settings.js';
import { generateUniqueCode } from './shortcode.js';
import { hashPassword, verifyPassword } from './users.js';
import { recordDownload } from './stats.js';

export interface FileRecord {
	id: number;
	uuid: string;
	shortCode: string;
	name: string;
	storageName: string;
	extension: string | null;
	mimeType: string | null;
	size: number;
	hash: string | null;
	userId: number | null;
	ip: string | null;
	country: string | null;
	passwordHash: string | null;
	deletionToken: string;
	ownerToken: string | null;
	downloadCount: number;
	lastDownloadAt: number | null;
	maxDownloads: number | null;
	downloadLimitAction: string;
	status: string;
	expiresAt: number | null;
	createdAt: number;
	editedAt: number | null;
}

export interface CreateFileInput {
	name: string;
	storageName: string;
	extension: string | null;
	mimeType: string | null;
	size: number;
	hash?: string | null;
	userId?: number | null;
	ip?: string | null;
	country?: string | null;
	password?: string | null;
	ownerToken?: string | null;
	maxDownloads?: number | null;
	downloadLimitAction?: 'disable' | 'delete';
	expiresAt?: number | null;
}

export type Availability = 'active' | 'disabled' | 'expired' | 'quarantined' | 'limit_reached';

export const shortCodeExists = (code: string): boolean =>
	Boolean(getDb().prepare('SELECT 1 FROM files WHERE shortCode = ?').get(code));

export const getByShortCode = (shortCode: string): FileRecord | undefined =>
	getDb().prepare('SELECT * FROM files WHERE shortCode = ?').get(shortCode) as FileRecord | undefined;

export const getById = (id: number): FileRecord | undefined =>
	getDb().prepare('SELECT * FROM files WHERE id = ?').get(id) as FileRecord | undefined;

export const getByUuid = (uuid: string): FileRecord | undefined =>
	getDb().prepare('SELECT * FROM files WHERE uuid = ?').get(uuid) as FileRecord | undefined;

export const getByDeletionToken = (token: string): FileRecord | undefined =>
	getDb().prepare('SELECT * FROM files WHERE deletionToken = ?').get(token) as FileRecord | undefined;

export const getRecentByOwnerToken = (ownerToken: string, limit = 50): FileRecord[] =>
	getDb()
		.prepare('SELECT * FROM files WHERE ownerToken = ? ORDER BY createdAt DESC LIMIT ?')
		.all(ownerToken, limit) as FileRecord[];

export const createFile = async (input: CreateFileInput): Promise<FileRecord> => {
	const db = getDb();
	const uuid = randomUUID();
	const shortCode = generateUniqueCode(shortCodeExists);
	const deletionToken = randomToken(24);
	const passwordHash = input.password ? await hashPassword(input.password) : null;

	db.prepare(
		`INSERT INTO files
			(uuid, shortCode, name, storageName, extension, mimeType, size, hash, userId, ip, country,
			 passwordHash, deletionToken, ownerToken, maxDownloads, downloadLimitAction, status, expiresAt, createdAt)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
	).run(
		uuid,
		shortCode,
		input.name,
		input.storageName,
		input.extension,
		input.mimeType,
		input.size,
		input.hash ?? null,
		input.userId ?? null,
		input.ip ?? null,
		input.country ?? null,
		passwordHash,
		deletionToken,
		input.ownerToken ?? null,
		input.maxDownloads ?? null,
		input.downloadLimitAction ?? 'disable',
		input.expiresAt ?? null,
		Date.now()
	);

	return getByShortCode(shortCode)!;
};

/** Determine whether a file can currently be served, and why not. */
export const availability = (file: FileRecord): Availability => {
	if (file.status === 'disabled') return 'disabled';
	if (file.status === 'quarantined') return 'quarantined';
	if (file.status === 'expired') return 'expired';
	if (file.expiresAt && file.expiresAt < Date.now()) return 'expired';
	if (file.maxDownloads !== null && file.downloadCount >= file.maxDownloads) return 'limit_reached';
	return 'active';
};

export const requiresPassword = (file: FileRecord): boolean => Boolean(file.passwordHash);

export const checkPassword = async (file: FileRecord, password: string): Promise<boolean> => {
	if (!file.passwordHash) return true;
	return verifyPassword(file.passwordHash, password);
};

/**
 * Record a download and enforce any per-file download limit. The delete action
 * marks the file expired (rather than unlinking immediately) so it can never
 * interrupt the in-flight response; the cleanup job removes it shortly after.
 */
export const registerDownload = (file: FileRecord): void => {
	const db = getDb();
	db.prepare('UPDATE files SET downloadCount = downloadCount + 1, lastDownloadAt = ? WHERE id = ?').run(
		Date.now(),
		file.id
	);
	recordDownload();

	if (file.maxDownloads !== null && file.downloadCount + 1 >= file.maxDownloads) {
		if (file.downloadLimitAction === 'delete') {
			// Expire now; the cleanup job deletes the row and physical file safely.
			db.prepare('UPDATE files SET expiresAt = ? WHERE id = ?').run(Date.now() - 1000, file.id);
		} else {
			db.prepare("UPDATE files SET status = 'disabled' WHERE id = ?").run(file.id);
		}
	}
};

export const deleteFile = async (file: FileRecord): Promise<void> => {
	await getStorage().delete(file.storageName);
	getDb().prepare('DELETE FROM files WHERE id = ?').run(file.id);
	// The report's target is gone, so it can never be acted on again.
	if (getSettings().autoDeleteReportsOnFileDelete) deleteReportsForMissingFiles();
	else closeReportsForMissingFiles();
};

export const setStatus = (id: number, status: 'active' | 'disabled' | 'quarantined' | 'expired'): void => {
	getDb().prepare('UPDATE files SET status = ?, editedAt = ? WHERE id = ?').run(status, Date.now(), id);
};

export const setFileCountry = (id: number, country: string | null): void => {
	getDb().prepare('UPDATE files SET country = ? WHERE id = ?').run(country, id);
};

export const renameFile = (id: number, name: string): void => {
	getDb().prepare('UPDATE files SET name = ?, editedAt = ? WHERE id = ?').run(name, Date.now(), id);
};

export const resetDownloadCount = (id: number): void => {
	getDb().prepare('UPDATE files SET downloadCount = 0, editedAt = ? WHERE id = ?').run(Date.now(), id);
};

export const updateExpiration = (id: number, expiresAt: number | null): void => {
	getDb().prepare('UPDATE files SET expiresAt = ?, editedAt = ? WHERE id = ?').run(expiresAt, Date.now(), id);
};

export const setFilePassword = async (id: number, password: string | null): Promise<void> => {
	const passwordHash = password ? await hashPassword(password) : null;
	getDb().prepare('UPDATE files SET passwordHash = ?, editedAt = ? WHERE id = ?').run(passwordHash, Date.now(), id);
};

export interface ListFilesOptions {
	search?: string;
	status?: string;
	category?: string;
	expiration?: 'never' | 'expiring' | 'expired';
	sort?: 'createdAt' | 'size' | 'downloadCount' | 'name';
	direction?: 'asc' | 'desc';
	page?: number;
	pageSize?: number;
}

const categoryCondition = (category: string): { clause: string; params: unknown[] } | null => {
	switch (category) {
		case 'image':
			return { clause: "mimeType LIKE 'image/%'", params: [] };
		case 'video':
			return { clause: "mimeType LIKE 'video/%'", params: [] };
		case 'audio':
			return { clause: "mimeType LIKE 'audio/%'", params: [] };
		case 'pdf':
			return { clause: 'mimeType = ?', params: ['application/pdf'] };
		case 'archive':
			return {
				clause: 'mimeType IN (?, ?, ?, ?, ?)',
				params: [
					'application/zip',
					'application/gzip',
					'application/x-tar',
					'application/vnd.rar',
					'application/x-7z-compressed'
				]
			};
		default:
			return null;
	}
};

export const listFiles = (options: ListFilesOptions = {}): { rows: FileRecord[]; total: number } => {
	const db = getDb();
	const where: string[] = [];
	const params: unknown[] = [];

	if (options.search) {
		where.push('(name LIKE ? OR shortCode LIKE ?)');
		params.push(`%${options.search}%`, `%${options.search}%`);
	}

	if (options.status) {
		where.push('status = ?');
		params.push(options.status);
	}

	if (options.category) {
		const condition = categoryCondition(options.category);
		if (condition) {
			where.push(condition.clause);
			params.push(...condition.params);
		}
	}

	if (options.expiration === 'never') where.push('expiresAt IS NULL');
	else if (options.expiration === 'expiring') where.push('expiresAt IS NOT NULL');
	else if (options.expiration === 'expired') {
		where.push('expiresAt IS NOT NULL AND expiresAt < ?');
		params.push(Date.now());
	}

	const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

	const sortColumn = ['createdAt', 'size', 'downloadCount', 'name'].includes(options.sort ?? '')
		? options.sort
		: 'createdAt';
	const direction = options.direction === 'asc' ? 'ASC' : 'DESC';

	const page = Math.max(1, options.page ?? 1);
	const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
	const offset = (page - 1) * pageSize;

	const total = (db.prepare(`SELECT COUNT(*) AS count FROM files ${whereClause}`).get(...params) as { count: number })
		.count;

	const rows = db
		.prepare(`SELECT * FROM files ${whereClause} ORDER BY ${sortColumn} ${direction} LIMIT ? OFFSET ?`)
		.all(...params, pageSize, offset) as FileRecord[];

	return { rows, total };
};

/** Files whose expiry has passed — used by the cleanup job. */
export const findExpiredFiles = (limit = 200): FileRecord[] =>
	getDb()
		.prepare('SELECT * FROM files WHERE expiresAt IS NOT NULL AND expiresAt < ? LIMIT ?')
		.all(Date.now(), limit) as FileRecord[];
