import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomToken } from '../utils/crypto.js';
import { getStorage } from '../storage/index.js';
import { createFile, type FileRecord } from './files.js';
import { mimeFromExtension, sniffMimeType } from './filetype.js';
import { getSettings } from './settings.js';
import { recordUpload } from './stats.js';

export class UploadError extends Error {
	public constructor(
		public readonly status: number,
		public readonly code: string,
		message: string
	) {
		super(message);
	}
}

export interface FinalizeInput {
	tempPath: string;
	name: string;
	ip?: string | null;
	country?: string | null;
	userId?: number | null;
	ownerToken?: string | null;
	password?: string | null;
	expiresAt?: number | null;
	maxDownloads?: number | null;
	downloadLimitAction?: 'disable' | 'delete';
}

const cleanExtension = (name: string): string => {
	const ext = path.extname(name).toLowerCase();
	// Guard against absurd/hostile extensions.
	return /^\.[a-z0-9]{1,12}$/.test(ext) ? ext : '';
};

/** Validate a candidate upload against the configured policy. */
export const validateUpload = (input: { name: string; size: number; mimeType: string | null }): void => {
	const settings = getSettings();

	if (input.size <= 0) throw new UploadError(400, 'EMPTY_FILE', 'The uploaded file is empty.');
	if (input.size > settings.maxFileSize) {
		throw new UploadError(413, 'FILE_TOO_LARGE', 'The file exceeds the maximum allowed size.');
	}

	const ext = cleanExtension(input.name);
	if (settings.allowedExtensions.length && (!ext || !settings.allowedExtensions.includes(ext))) {
		throw new UploadError(415, 'EXTENSION_NOT_ALLOWED', 'This file extension is not allowed.');
	}

	if (ext && settings.blockedExtensions.includes(ext)) {
		throw new UploadError(415, 'EXTENSION_BLOCKED', 'This file extension is blocked.');
	}

	const mime = (input.mimeType ?? '').toLowerCase();
	if (settings.allowedMimeTypes.length && (!mime || !settings.allowedMimeTypes.includes(mime))) {
		throw new UploadError(415, 'MIME_NOT_ALLOWED', 'This file type is not allowed.');
	}

	if (mime && settings.blockedMimeTypes.includes(mime)) {
		throw new UploadError(415, 'MIME_BLOCKED', 'This file type is blocked.');
	}
};

/** Sniff the real MIME type from the file's leading bytes. */
export const detectMimeType = async (tempPath: string, name: string): Promise<string> => {
	const handle = await open(tempPath, 'r');
	try {
		const buffer = Buffer.alloc(4100);
		const { bytesRead } = await handle.read(buffer, 0, 4100, 0);
		const sniffed = sniffMimeType(buffer.subarray(0, bytesRead));
		return sniffed ?? mimeFromExtension(path.extname(name));
	} finally {
		await handle.close();
	}
};

/**
 * Validate, store and register an uploaded file that already lives at
 * `tempPath`. The physical filename is generated — the original name is kept
 * only as metadata — so untrusted input never touches the filesystem path.
 */
export const finalizeUpload = async (input: FinalizeInput): Promise<FileRecord> => {
	const info = await stat(input.tempPath);
	const mimeType = await detectMimeType(input.tempPath, input.name);
	const extension = cleanExtension(input.name);

	validateUpload({ name: input.name, size: info.size, mimeType });

	const storageId = randomToken(16);
	const storage = getStorage();
	const key = storage.keyFor(storageId);
	await storage.putFromFile(key, input.tempPath);

	const record = await createFile({
		name: input.name.slice(0, 255),
		storageName: key,
		extension,
		mimeType,
		size: info.size,
		ip: input.ip ?? null,
		country: input.country ?? null,
		userId: input.userId ?? null,
		ownerToken: input.ownerToken ?? null,
		password: input.password ?? null,
		expiresAt: input.expiresAt ?? null,
		maxDownloads: input.maxDownloads ?? null,
		downloadLimitAction: input.downloadLimitAction ?? 'disable'
	});

	recordUpload(info.size);
	return record;
};
