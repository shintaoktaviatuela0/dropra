import { stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getDb } from '../db/index.js';
import { runCleanup } from '../services/cleanup.js';
import { expirationToTimestamp, isValidExpiration } from '../services/expiration.js';
import {
	deleteFile,
	getById,
	listFiles,
	renameFile,
	resetDownloadCount,
	setStatus,
	updateExpiration,
	type ListFilesOptions
} from '../services/files.js';
import { countOpenReports, getReport, listReports, setReportStatus } from '../services/reports.js';
import { banIp, listBannedIps, unbanIp } from '../services/security.js';
import { createSession, destroySession } from '../services/sessions.js';
import { getSettings, setSettings, type DropraSettings } from '../services/settings.js';
import { getDashboardStats } from '../services/stats.js';
import { getUserByUsername, verifyPassword } from '../services/users.js';
import { renderAdminDashboard } from '../views/admin/dashboard.js';
import { renderAdminFiles } from '../views/admin/files.js';
import { renderAdminLogin } from '../views/admin/login.js';
import { renderAdminReports } from '../views/admin/reports.js';
import { renderAdminSecurity } from '../views/admin/security.js';
import { renderAdminSettings } from '../views/admin/settings.js';
import { renderAdminStorage, type StorageStats } from '../views/admin/storage.js';
import { renderAdminSystem, type SystemInfo } from '../views/admin/system.js';
import { SESSION_COOKIE, clearSessionCookie, getAdminUser, setSessionCookie } from './helpers.js';

const html = (reply: FastifyReply, status: number, markup: string): FastifyReply =>
	reply.code(status).type('text/html; charset=utf-8').send(markup);

const asArray = (value: unknown): string[] => (Array.isArray(value) ? (value as string[]) : value ? [String(value)] : []);

const dirSize = async (dir: string): Promise<number> => {
	const { readdir } = await import('node:fs/promises');
	let total = 0;
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return 0;
	}

	for (const entry of entries) {
		const full = path.join(dir, entry);
		try {
			const info = await stat(full);
			total += info.isDirectory() ? await dirSize(full) : info.size;
		} catch {
			// ignore
		}
	}

	return total;
};

const fileSizeOrZero = async (file: string): Promise<number> => {
	try {
		return (await stat(file)).size;
	} catch {
		return 0;
	}
};

const normaliseExtension = (value: string): string => {
	const lower = value.trim().toLowerCase();
	if (!lower) return '';
	return lower.startsWith('.') ? lower : `.${lower}`;
};

const stripControlChars = (value: string): string =>
	[...value].filter(char => char.charCodeAt(0) > 31).join('');

const parseSettingsForm = (body: Record<string, string>, current: DropraSettings): Partial<DropraSettings> => {
	const list = (value: string | undefined): string[] =>
		(value ?? '')
			.split(',')
			.map(item => item.trim())
			.filter(Boolean);
	const num = (value: string | undefined, fallback: number): number => {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	};

	return {
		siteName: (body.siteName || current.siteName).slice(0, 100),
		siteDescription: (body.siteDescription ?? current.siteDescription).slice(0, 300),
		publicBaseUrl: (body.publicBaseUrl ?? '').trim().replace(/\/+$/, ''),
		contactUrl: (body.contactUrl ?? '').trim(),
		termsUrl: (body.termsUrl ?? '').trim(),
		privacyUrl: (body.privacyUrl ?? '').trim(),
		allowAnonymousUploads: body.allowAnonymousUploads === 'true',
		maxFileSize: Math.max(1, num(body.maxFileSizeMb, Math.round(current.maxFileSize / (1024 * 1024)))) * 1024 * 1024,
		maxFilesPerUpload: Math.max(1, num(body.maxFilesPerUpload, current.maxFilesPerUpload)),
		defaultExpiration: isValidExpiration(body.defaultExpiration ?? '') ? (body.defaultExpiration as string) : current.defaultExpiration,
		maxExpiration: isValidExpiration(body.maxExpiration ?? '') ? (body.maxExpiration as string) : current.maxExpiration,
		allowNeverExpiration: body.allowNeverExpiration === 'true',
		allowedExtensions: list(body.allowedExtensions).map(normaliseExtension).filter(Boolean),
		blockedExtensions: list(body.blockedExtensions).map(normaliseExtension).filter(Boolean),
		allowedMimeTypes: list(body.allowedMimeTypes).map(item => item.toLowerCase()),
		blockedMimeTypes: list(body.blockedMimeTypes).map(item => item.toLowerCase()),
		enablePreviews: body.enablePreviews === 'true',
		enableDirectLinks: body.enableDirectLinks === 'true',
		enableDownloadCounters: body.enableDownloadCounters === 'true',
		theme: (['system', 'light', 'dark'].includes(body.theme ?? '') ? (body.theme as DropraSettings['theme']) : current.theme),
		accentColor: /^#[0-9a-fA-F]{6}$/.test(body.accentColor ?? '') ? (body.accentColor as string) : current.accentColor,
		logoUrl: (body.logoUrl ?? '').trim(),
		faviconUrl: (body.faviconUrl ?? '').trim()
	};
};

export const registerAdminRoutes = (app: FastifyInstance): void => {
	// ── Authentication (unguarded) ────────────────────────────────────────
	app.get('/admin/login', async (req, reply) => {
		if (getAdminUser(req)) return reply.redirect('/admin');
		return html(reply, 200, renderAdminLogin());
	});

	app.post(
		'/admin/login',
		{ config: { rateLimit: { max: getSettings().loginRateMax, timeWindow: getSettings().loginRateWindow } } },
		async (req: FastifyRequest, reply: FastifyReply) => {
			const body = (req.body ?? {}) as Record<string, string>;
			const username = (body.username ?? '').trim();
			const user = getUserByUsername(username);
			const ok = user && user.role === 'admin' && user.enabled && (await verifyPassword(user.password, body.password ?? ''));

			if (!ok || !user) {
				logger.warn({ username, ip: req.ip }, 'Failed admin login attempt');
				return html(reply, 401, renderAdminLogin({ error: 'Invalid username or password.' }));
			}

			const sessionId = createSession(user.id, req.ip, req.headers['user-agent']);
			setSessionCookie(reply, sessionId);
			logger.info({ username: user.username }, 'Admin logged in');
			return reply.redirect('/admin');
		}
	);

	app.post('/admin/logout', async (req, reply) => {
		const raw = req.cookies[SESSION_COOKIE];
		if (raw) {
			const unsigned = req.unsignCookie(raw);
			if (unsigned.valid && unsigned.value) destroySession(unsigned.value);
		}

		clearSessionCookie(reply);
		return reply.redirect('/admin/login');
	});

	// ── Guarded admin area ────────────────────────────────────────────────
	app.register(async secure => {
		secure.addHook('preHandler', async (req, reply) => {
			if (!getAdminUser(req)) return reply.redirect('/admin/login');
		});

		secure.get('/admin', async (req, reply) => {
			const user = getAdminUser(req)!;
			return html(reply, 200, renderAdminDashboard(getDashboardStats(), user.username, countOpenReports()));
		});

		// ── Files ──────────────────────────────────────────────────────────
		secure.get('/admin/files', async (req, reply) => {
			const user = getAdminUser(req)!;
			const query = (req.query ?? {}) as Record<string, string>;
			const page = Math.max(1, Number(query.page) || 1);
			const pageSize = 25;
			const filters: ListFilesOptions = {
				search: query.search || undefined,
				status: query.status || undefined,
				category: query.category || undefined,
				expiration: (query.expiration as ListFilesOptions['expiration']) || undefined,
				sort: (query.sort as ListFilesOptions['sort']) || 'createdAt',
				page,
				pageSize
			};
			const result = listFiles(filters);
			return html(
				reply,
				200,
				renderAdminFiles({ result, filters, page, pageSize, username: user.username, openReports: countOpenReports() })
			);
		});

		secure.post('/admin/files/:id/action', async (req, reply) => {
			const id = Number((req.params as { id: string }).id);
			const body = (req.body ?? {}) as Record<string, string>;
			const file = getById(id);
			if (!file) return reply.redirect('/admin/files');

			switch (body.op) {
				case 'enable':
					setStatus(id, 'active');
					break;
				case 'disable':
					setStatus(id, 'disabled');
					break;
				case 'resetDownloads':
					resetDownloadCount(id);
					break;
				case 'rename':
					renameFile(id, stripControlChars(body.name ?? file.name).slice(0, 255));
					break;
				case 'expiration':
					updateExpiration(id, isValidExpiration(body.expiration ?? '') ? expirationToTimestamp(body.expiration) : file.expiresAt);
					break;
				case 'delete':
					await deleteFile(file);
					logger.info({ shortCode: file.shortCode }, 'File deleted by admin');
					break;
				default:
					break;
			}

			return reply.redirect('/admin/files');
		});

		secure.post('/admin/files/bulk', async (req, reply) => {
			const body = (req.body ?? {}) as Record<string, unknown>;
			const ids = asArray(body.ids).map(Number).filter(Number.isInteger);
			const op = String(body.op);

			for (const id of ids) {
				const file = getById(id);
				if (!file) continue;
				if (op === 'delete') await deleteFile(file);
				else if (op === 'disable') setStatus(id, 'disabled');
				else if (op === 'enable') setStatus(id, 'active');
			}

			logger.info({ count: ids.length, op }, 'Bulk file action');
			return reply.redirect('/admin/files');
		});

		// ── Storage ──────────────────────────────────────────────────────────
		secure.get('/admin/storage', async (req, reply) => {
			const user = getAdminUser(req)!;
			const stats = await computeStorageStats();
			const largest = getDb()
				.prepare('SELECT shortCode, name, size, downloadCount, createdAt FROM files ORDER BY size DESC LIMIT 10')
				.all() as never[];
			return html(
				reply,
				200,
				renderAdminStorage({ stats, largest, username: user.username, openReports: countOpenReports() })
			);
		});

		secure.post('/admin/storage/clear-temp', async (_req, reply) => {
			const { cleanupTemp } = await import('../services/cleanup.js');
			await cleanupTemp();
			return reply.redirect('/admin/storage');
		});

		secure.post('/admin/storage/clear-thumbs', async (_req, reply) => {
			const { rm } = await import('node:fs/promises');
			await rm(config.paths.thumbnails, { recursive: true, force: true });
			const { mkdir } = await import('node:fs/promises');
			await mkdir(config.paths.thumbnails, { recursive: true });
			return reply.redirect('/admin/storage');
		});

		secure.post('/admin/storage/scan', async (_req, reply) => {
			// Consistency scan is reported via logs; no destructive action.
			const { getStorage } = await import('../storage/index.js');
			const storage = getStorage();
			const rows = getDb().prepare('SELECT id, storageName, shortCode FROM files').all() as {
				id: number;
				storageName: string;
				shortCode: string;
			}[];
			let missing = 0;
			for (const row of rows) {
				if (!(await storage.exists(row.storageName))) missing++;
			}

			logger.warn({ missing, scanned: rows.length }, 'Storage consistency scan completed');
			return reply.redirect('/admin/storage');
		});

		// ── Settings ─────────────────────────────────────────────────────────
		secure.get('/admin/settings', async (req, reply) => {
			const user = getAdminUser(req)!;
			const saved = (req.query as Record<string, string>)?.saved === '1';
			return html(reply, 200, renderAdminSettings(getSettings(), user.username, countOpenReports(), saved));
		});

		secure.post('/admin/settings', async (req, reply) => {
			const body = (req.body ?? {}) as Record<string, string>;
			setSettings(parseSettingsForm(body, getSettings()));
			logger.info('Settings updated');
			return reply.redirect('/admin/settings?saved=1');
		});

		// ── Security ─────────────────────────────────────────────────────────
		secure.get('/admin/security', async (req, reply) => {
			const user = getAdminUser(req)!;
			const saved = (req.query as Record<string, string>)?.saved === '1';
			return html(
				reply,
				200,
				renderAdminSecurity({ settings: getSettings(), bannedIps: listBannedIps(), username: user.username, openReports: countOpenReports(), saved })
			);
		});

		secure.post('/admin/security', async (req, reply) => {
			const body = (req.body ?? {}) as Record<string, string>;
			const current = getSettings();
			const num = (value: string | undefined, fallback: number): number => {
				const parsed = Number(value);
				return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
			};
			setSettings({
				anonUploadRateWindow: num(body.anonUploadRateWindow, current.anonUploadRateWindow),
				anonUploadRateMax: num(body.anonUploadRateMax, current.anonUploadRateMax),
				downloadRateWindow: num(body.downloadRateWindow, current.downloadRateWindow),
				downloadRateMax: num(body.downloadRateMax, current.downloadRateMax),
				loginRateWindow: num(body.loginRateWindow, current.loginRateWindow),
				loginRateMax: num(body.loginRateMax, current.loginRateMax),
				reportRateWindow: num(body.reportRateWindow, current.reportRateWindow),
				reportRateMax: num(body.reportRateMax, current.reportRateMax)
			});
			logger.info('Security settings updated');
			return reply.redirect('/admin/security?saved=1');
		});

		secure.post('/admin/security/ban', async (req, reply) => {
			const body = (req.body ?? {}) as Record<string, string>;
			const ip = (body.ip ?? '').trim();
			if (ip) banIp(ip, (body.reason ?? '').trim() || undefined);
			return reply.redirect('/admin/security');
		});

		secure.post('/admin/security/unban', async (req, reply) => {
			const body = (req.body ?? {}) as Record<string, string>;
			if (body.ip) unbanIp(body.ip.trim());
			return reply.redirect('/admin/security');
		});

		// ── Reports ──────────────────────────────────────────────────────────
		secure.get('/admin/reports', async (req, reply) => {
			const user = getAdminUser(req)!;
			return html(reply, 200, renderAdminReports({ reports: listReports(), username: user.username, openReports: countOpenReports() }));
		});

		secure.post('/admin/reports/:id/action', async (req, reply) => {
			const id = Number((req.params as { id: string }).id);
			const op = String((req.body as Record<string, string>)?.op);
			const report = getReport(id);
			if (!report) return reply.redirect('/admin/reports');

			if (op === 'dismiss') {
				setReportStatus(id, 'dismissed');
			} else if (op === 'disableFile' || op === 'deleteFile') {
				const file = report.fileId ? getById(report.fileId) : undefined;
				if (file) {
					if (op === 'deleteFile') await deleteFile(file);
					else setStatus(file.id, 'quarantined');
				}

				setReportStatus(id, 'actioned');
			}

			return reply.redirect('/admin/reports');
		});

		// ── System ───────────────────────────────────────────────────────────
		secure.get('/admin/system', async (req, reply) => {
			const user = getAdminUser(req)!;
			const info = buildSystemInfo();
			return html(reply, 200, renderAdminSystem(info, user.username, countOpenReports()));
		});

		secure.post('/admin/system/cleanup', async (_req, reply) => {
			await runCleanup();
			return reply.redirect('/admin/system');
		});
	});
};

const computeStorageStats = async (): Promise<StorageStats> => {
	const db = getDb();
	const totals = db.prepare('SELECT COUNT(*) AS fileCount, COALESCE(SUM(size), 0) AS totalStorage FROM files').get() as {
		fileCount: number;
		totalStorage: number;
	};
	const dbSize =
		(await fileSizeOrZero(config.databaseFile)) +
		(await fileSizeOrZero(`${config.databaseFile}-wal`)) +
		(await fileSizeOrZero(`${config.databaseFile}-shm`));
	const thumbSize = await dirSize(config.paths.thumbnails);
	const tempSize = await dirSize(config.paths.temp);
	return { totalStorage: totals.totalStorage, fileCount: totals.fileCount, dbSize, thumbSize, tempSize };
};

const buildSystemInfo = (): SystemInfo => {
	const totals = getDb()
		.prepare('SELECT COUNT(*) AS totalFiles, COALESCE(SUM(size), 0) AS totalStorage FROM files')
		.get() as { totalFiles: number; totalStorage: number };
	return {
		version: '1.0.0',
		nodeVersion: process.version,
		platform: `${process.platform} ${process.arch}`,
		uptimeSeconds: Math.round(process.uptime()),
		dataDir: config.dataDir,
		databaseFile: config.databaseFile,
		storageWritable: true,
		totalFiles: totals.totalFiles,
		totalStorage: totals.totalStorage,
		memoryRss: process.memoryUsage().rss
	};
};
