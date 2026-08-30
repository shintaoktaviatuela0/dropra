import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { finished, pipeline } from 'node:stream/promises';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { clampExpiration } from '../services/expiration.js';
import { deleteFile, getByShortCode, getRecentByOwnerToken, setFileCountry } from '../services/files.js';
import { countryFromHeaders, resolveCountry } from '../services/geo.js';
import { getSettings } from '../services/settings.js';
import { finalizeUpload, UploadError } from '../services/upload.js';
import { randomToken, safeEqual } from '../utils/crypto.js';
import { apiError, apiOk } from '../utils/api.js';
import { getAdminUser, getBaseUrl } from './helpers.js';

const UPLOAD_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Fill in the origin country after the response is sent. Header-based countries
 * are already resolved inline; this only covers the optional remote lookup.
 */
const backfillCountry = (fileId: number, req: FastifyRequest): void => {
	void resolveCountry(req.ip, req.headers as Record<string, unknown>)
		.then(code => {
			if (code) setFileCountry(fileId, code);
		})
		.catch(error => logger.debug({ err: error }, 'Country resolution failed'));
};

const parseMaxDownloads = (value: unknown): number | null => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normaliseOwnerToken = (value: unknown): string =>
	typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : randomToken(16);

const uploadResponse = (req: FastifyRequest, record: Awaited<ReturnType<typeof finalizeUpload>>, ownerToken: string) => {
	const baseUrl = getBaseUrl(req);
	return {
		shortCode: record.shortCode,
		name: record.name,
		size: record.size,
		mimeType: record.mimeType,
		url: `${baseUrl}/${record.shortCode}`,
		directUrl: `${baseUrl}/raw/${record.shortCode}`,
		pageUrl: `${baseUrl}/${record.shortCode}`,
		deletionToken: record.deletionToken,
		expiresAt: record.expiresAt,
		ownerToken
	};
};

const canUpload = (req: FastifyRequest): boolean => getSettings().allowAnonymousUploads || getAdminUser(req) !== null;

export const registerUploadRoutes = (app: FastifyInstance): void => {
	// ── Single-request upload (streamed straight to disk) ──────────────────
	app.post(
		'/api/upload',
		{ config: { rateLimit: rateLimitFor('upload') } },
		async (req: FastifyRequest, reply: FastifyReply) => {
			if (!canUpload(req)) return apiError(reply, 403, 'UPLOADS_DISABLED', 'Anonymous uploads are disabled.');

			let tempPath: string | null = null;
			let originalName = 'file';
			const fields: Record<string, string> = {};

			try {
				for await (const part of req.parts()) {
					if (part.type === 'file') {
						if (tempPath) {
							part.file.resume(); // ignore extra files, keep the stream flowing
							continue;
						}

						originalName = part.filename || 'file';
						tempPath = path.join(config.paths.temp, `up_${randomToken(16)}`);
						await pipeline(part.file, createWriteStream(tempPath));
						if (part.file.truncated) {
							await rm(tempPath, { force: true });
							return apiError(reply, 413, 'FILE_TOO_LARGE', 'The file exceeds the maximum allowed size.');
						}
					} else {
						fields[part.fieldname] = part.value as string;
					}
				}

				if (!tempPath) return apiError(reply, 400, 'NO_FILE', 'No file was provided.');

				const settings = getSettings();
				const ownerToken = normaliseOwnerToken(fields.ownerToken);
				const record = await finalizeUpload({
					tempPath,
					name: originalName,
					ip: req.ip,
					country: countryFromHeaders(req.headers as Record<string, unknown>),
					userId: getAdminUser(req)?.id ?? null,
					ownerToken,
					password: fields.password || null,
					maxDownloads: parseMaxDownloads(fields.maxDownloads),
					expiresAt: clampExpiration(fields.expiration, settings.maxExpiration, settings.allowNeverExpiration)
				});

				if (!record.country) backfillCountry(record.id, req);
				logger.info({ shortCode: record.shortCode, size: record.size }, 'Upload completed');
				return apiOk(reply, uploadResponse(req, record, ownerToken));
			} catch (error) {
				if (tempPath) await rm(tempPath, { force: true });
				return handleUploadError(reply, error);
			}
		}
	);

	// ── Chunked upload: receive one chunk ─────────────────────────────────
	app.post(
		'/api/upload/chunk',
		{ config: { rateLimit: rateLimitFor('upload') } },
		async (req: FastifyRequest, reply: FastifyReply) => {
			if (!canUpload(req)) return apiError(reply, 403, 'UPLOADS_DISABLED', 'Anonymous uploads are disabled.');

			const fields: Record<string, string> = {};
			let chunkWritten = false;

			try {
				for await (const part of req.parts()) {
					if (part.type === 'file') {
						const uploadId = (fields.uploadId ?? '').trim();
						const index = Number(fields.index);
						if (!UPLOAD_ID_RE.test(uploadId) || !Number.isInteger(index) || index < 0) {
							part.file.resume();
							return apiError(reply, 400, 'BAD_CHUNK', 'Invalid chunk metadata.');
						}

						const chunkDir = path.join(config.paths.temp, uploadId);
						await mkdir(chunkDir, { recursive: true });
						await pipeline(part.file, createWriteStream(path.join(chunkDir, String(index))));
						chunkWritten = true;
					} else {
						fields[part.fieldname] = part.value as string;
					}
				}

				if (!chunkWritten) return apiError(reply, 400, 'NO_CHUNK', 'No chunk data received.');
				return apiOk(reply, { received: true });
			} catch (error) {
				return handleUploadError(reply, error);
			}
		}
	);

	// ── Chunked upload: assemble and finalize ─────────────────────────────
	app.post(
		'/api/upload/finalize',
		{ config: { rateLimit: rateLimitFor('upload') } },
		async (req: FastifyRequest, reply: FastifyReply) => {
			if (!canUpload(req)) return apiError(reply, 403, 'UPLOADS_DISABLED', 'Anonymous uploads are disabled.');

			const body = (req.body ?? {}) as Record<string, string>;
			const uploadId = (body.uploadId ?? '').trim();
			const total = Number(body.total);
			const name = body.name || 'file';

			if (!UPLOAD_ID_RE.test(uploadId) || !Number.isInteger(total) || total <= 0) {
				return apiError(reply, 400, 'BAD_FINALIZE', 'Invalid finalize request.');
			}

			const chunkDir = path.join(config.paths.temp, uploadId);
			const assembled = path.join(config.paths.temp, `${uploadId}.assembled`);

			try {
				for (let i = 0; i < total; i++) {
					await stat(path.join(chunkDir, String(i))); // throws if a chunk is missing
				}

				const output = createWriteStream(assembled);
				for (let i = 0; i < total; i++) {
					await pipeline(createReadStream(path.join(chunkDir, String(i))), output, { end: false });
				}

				output.end();
				await finished(output);

				const settings = getSettings();
				const ownerToken = normaliseOwnerToken(body.ownerToken);
				const record = await finalizeUpload({
					tempPath: assembled,
					name,
					ip: req.ip,
					country: countryFromHeaders(req.headers as Record<string, unknown>),
					userId: getAdminUser(req)?.id ?? null,
					ownerToken,
					password: body.password || null,
					maxDownloads: parseMaxDownloads(body.maxDownloads),
					expiresAt: clampExpiration(body.expiration, settings.maxExpiration, settings.allowNeverExpiration)
				});

				logger.info({ shortCode: record.shortCode, size: record.size }, 'Chunked upload completed');
				if (!record.country) backfillCountry(record.id, req);
				return apiOk(reply, uploadResponse(req, record, ownerToken));
			} catch (error) {
				return handleUploadError(reply, error);
			} finally {
				await rm(chunkDir, { recursive: true, force: true });
				await rm(assembled, { force: true });
			}
		}
	);

	// ── Delete an upload with its deletion token ──────────────────────────
	app.post('/api/file/:code/delete', async (req, reply) => {
		const { code } = req.params as { code: string };
		const token = ((req.body as Record<string, string>)?.token ?? '').trim();
		const file = getByShortCode(code);
		if (!file) return apiError(reply, 404, 'FILE_NOT_FOUND', 'The requested file does not exist.');
		if (!token || !safeEqual(token, file.deletionToken)) {
			return apiError(reply, 403, 'INVALID_TOKEN', 'Invalid deletion token.');
		}

		await deleteFile(file);
		logger.info({ shortCode: file.shortCode }, 'File deleted via deletion token');
		return apiOk(reply, { deleted: true });
	});

	// ── List a browser's own recent uploads (no secrets exposed) ──────────
	app.get('/api/my-files', async (req, reply) => {
		const ownerToken = (req.query as Record<string, string>)?.ownerToken ?? '';
		if (!/^[A-Za-z0-9_-]{8,64}$/.test(ownerToken)) return apiOk(reply, { files: [] });
		const baseUrl = getBaseUrl(req);
		const files = getRecentByOwnerToken(ownerToken).map(file => ({
			shortCode: file.shortCode,
			name: file.name,
			size: file.size,
			createdAt: file.createdAt,
			url: `${baseUrl}/${file.shortCode}`
		}));
		return apiOk(reply, { files });
	});
};

const handleUploadError = (reply: FastifyReply, error: unknown): FastifyReply => {
	if (error instanceof UploadError) return apiError(reply, error.status, error.code, error.message);
	logger.error({ err: error }, 'Upload failed');
	return apiError(reply, 500, 'UPLOAD_FAILED', 'The upload could not be processed.');
};

const rateLimitFor = (kind: 'upload') => {
	const settings = getSettings();
	if (kind === 'upload') return { max: settings.anonUploadRateMax, timeWindow: settings.anonUploadRateWindow };
	return undefined;
};
