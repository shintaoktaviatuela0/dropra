import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../logger.js';
import {
	availability,
	checkPassword,
	getByShortCode,
	registerDownload,
	requiresPassword,
	type FileRecord
} from '../services/files.js';
import { categorize, isActiveContent } from '../services/filetype.js';
import { countReportsFromIpSince, createReport, REPORT_REASONS } from '../services/reports.js';
import { getSettings } from '../services/settings.js';
import { getStorage } from '../storage/index.js';
import { ERROR_PAGES } from '../views/error.js';
import { renderFilePage } from '../views/file.js';
import { renderHome } from '../views/home.js';
import { renderPasswordPage } from '../views/password.js';
import { renderReportPage } from '../views/report.js';
import { getBaseUrl, hasUnlock, setUnlockCookie } from './helpers.js';

const html = (reply: FastifyReply, status: number, markup: string): FastifyReply =>
	reply.code(status).type('text/html; charset=utf-8').send(markup);

/** Route a file's availability to the right error page; null if it is fine. */
const availabilityError = (reply: FastifyReply, file: FileRecord): FastifyReply | null => {
	switch (availability(file)) {
		case 'expired':
			return html(reply, 410, ERROR_PAGES.expired());
		case 'disabled':
		case 'quarantined':
			return html(reply, 403, ERROR_PAGES.disabled());
		case 'limit_reached':
			return html(reply, 410, ERROR_PAGES.limitReached());
		default:
			return null;
	}
};

const readTextPreview = async (file: FileRecord): Promise<string | null> => {
	try {
		const chunks: Buffer[] = [];
		let total = 0;
		const stream = getStorage().stream(file.storageName, { start: 0, end: 100_000 });
		for await (const chunk of stream as AsyncIterable<Buffer>) {
			chunks.push(chunk);
			total += chunk.length;
			if (total >= 100_000) break;
		}

		return Buffer.concat(chunks).toString('utf8').slice(0, 50_000);
	} catch {
		return null;
	}
};

const sanitizeHeaderValue = (value: string): string => value.replace(/["\r\n]/g, '');

interface ServeOptions {
	countable: boolean;
	forceAttachment: boolean;
}

/** Stream a stored file with Range/HEAD/conditional-request support. */
const serveFile = async (
	req: FastifyRequest,
	reply: FastifyReply,
	file: FileRecord,
	options: ServeOptions
): Promise<FastifyReply> => {
	const storage = getStorage();
	const info = await storage.stat(file.storageName);
	if (!info) return html(reply, 404, ERROR_PAGES.fileNotFound());

	const etag = `W/"${info.size}-${Math.round(info.mtimeMs)}"`;
	const lastModified = new Date(info.mtimeMs).toUTCString();
	const active = isActiveContent(file.mimeType, file.extension ?? '');
	const contentType = active ? 'application/octet-stream' : file.mimeType || 'application/octet-stream';
	const dispositionType = options.forceAttachment || active ? 'attachment' : 'inline';
	const safeName = sanitizeHeaderValue(file.name);

	reply.header('Accept-Ranges', 'bytes');
	reply.header('ETag', etag);
	reply.header('Last-Modified', lastModified);
	reply.header('Cache-Control', 'public, max-age=0, must-revalidate');
	reply.header('X-Content-Type-Options', 'nosniff');
	reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
	reply.header('Content-Type', contentType);
	reply.header(
		'Content-Disposition',
		`${dispositionType}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`
	);

	// Conditional request handling (304).
	const ifNoneMatch = req.headers['if-none-match'];
	if (ifNoneMatch && ifNoneMatch === etag) return reply.code(304).send();

	const rangeHeader = req.headers.range;
	if (rangeHeader) {
		const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
		if (!match) return reply.code(416).header('Content-Range', `bytes */${info.size}`).send();

		let start = match[1] === '' ? undefined : Number(match[1]);
		let end = match[2] === '' ? undefined : Number(match[2]);
		if (start === undefined && end === undefined) {
			return reply.code(416).header('Content-Range', `bytes */${info.size}`).send();
		}

		if (start === undefined) {
			start = Math.max(0, info.size - (end as number));
			end = info.size - 1;
		} else if (end === undefined || end >= info.size) {
			end = info.size - 1;
		}

		if (start > end || start >= info.size) {
			return reply.code(416).header('Content-Range', `bytes */${info.size}`).send();
		}

		reply.code(206);
		reply.header('Content-Range', `bytes ${start}-${end}/${info.size}`);
		reply.header('Content-Length', end - start + 1);
		if (req.method === 'HEAD') return reply.send();
		return reply.send(storage.stream(file.storageName, { start, end }));
	}

	reply.header('Content-Length', info.size);
	if (req.method === 'HEAD') return reply.send();

	// Count only full GET responses (never HEAD, 304 or Range requests).
	if (options.countable) registerDownload(file);
	return reply.send(storage.stream(file.storageName));
};

export const registerPublicRoutes = (app: FastifyInstance): void => {
	app.get('/', async (_req, reply) => html(reply, 200, renderHome()));

	app.get('/robots.txt', async (_req, reply) =>
		reply.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /api\n')
	);

	app.get('/favicon.ico', async (_req, reply) => reply.redirect('/assets/favicon.svg'));

	// ── Report a file ─────────────────────────────────────────────────────
	app.get('/report/:code', async (req, reply) => {
		const { code } = req.params as { code: string };
		if (!getByShortCode(code)) return html(reply, 404, ERROR_PAGES.fileNotFound());
		return html(reply, 200, renderReportPage(code));
	});

	app.post('/report/:code', async (req, reply) => {
		const { code } = req.params as { code: string };
		const file = getByShortCode(code);
		if (!file) return html(reply, 404, ERROR_PAGES.fileNotFound());

		const settings = getSettings();
		const since = Date.now() - settings.reportRateWindow;
		if (countReportsFromIpSince(req.ip, since) >= settings.reportRateMax) {
			return html(reply, 429, renderReportPage(code, { error: 'You have submitted too many reports. Try again later.' }));
		}

		const body = (req.body ?? {}) as Record<string, string>;
		const reason = (body.reason ?? '').toLowerCase();
		if (!REPORT_REASONS.includes(reason as never)) {
			return html(reply, 400, renderReportPage(code, { error: 'Please choose a valid reason.' }));
		}

		createReport({ fileId: file.id, shortCode: code, reason, details: (body.details ?? '').slice(0, 1000), ip: req.ip });
		logger.info({ shortCode: code, reason }, 'File reported');
		return html(reply, 200, renderReportPage(code, { success: true }));
	});

	// ── Direct/raw stream (not counted; used for previews & embeds) ───────
	app.route({
		method: ['GET', 'HEAD'],
		url: '/raw/:code',
		handler: async (req, reply) => {
			const { code } = req.params as { code: string };
			const file = getByShortCode(code);
			if (!file) return html(reply, 404, ERROR_PAGES.fileNotFound());
			const unavailable = availabilityError(reply, file);
			if (unavailable) return unavailable;
			if (requiresPassword(file) && !hasUnlock(req, file)) return reply.redirect(`/${encodeURIComponent(code)}`);
			return serveFile(req, reply, file, { countable: false, forceAttachment: false });
		}
	});

	// ── Download (counted, always attachment) ─────────────────────────────
	app.route({
		method: ['GET', 'HEAD'],
		url: '/download/:code',
		config: { rateLimit: { max: getSettings().downloadRateMax, timeWindow: getSettings().downloadRateWindow } },
		handler: async (req, reply) => {
			const { code } = req.params as { code: string };
			const file = getByShortCode(code);
			if (!file) return html(reply, 404, ERROR_PAGES.fileNotFound());
			const unavailable = availabilityError(reply, file);
			if (unavailable) return unavailable;
			if (requiresPassword(file) && !hasUnlock(req, file)) return reply.redirect(`/${encodeURIComponent(code)}`);
			return serveFile(req, reply, file, { countable: true, forceAttachment: true });
		}
	});

	// ── Public file page ──────────────────────────────────────────────────
	app.get('/:code', async (req, reply) => {
		const { code } = req.params as { code: string };
		const file = getByShortCode(code);
		if (!file) return html(reply, 404, ERROR_PAGES.fileNotFound());
		const unavailable = availabilityError(reply, file);
		if (unavailable) return unavailable;

		if (requiresPassword(file) && !hasUnlock(req, file)) {
			return html(reply, 200, renderPasswordPage(code));
		}

		const category = categorize(file.mimeType, file.extension ?? '');
		const textPreview = category === 'text' && getSettings().enablePreviews ? await readTextPreview(file) : null;
		return html(reply, 200, renderFilePage({ file, baseUrl: getBaseUrl(req), category, textPreview }));
	});

	// ── Password submission for a protected file ──────────────────────────
	app.post('/:code', async (req, reply) => {
		const { code } = req.params as { code: string };
		const file = getByShortCode(code);
		if (!file) return html(reply, 404, ERROR_PAGES.fileNotFound());
		const unavailable = availabilityError(reply, file);
		if (unavailable) return unavailable;

		const password = ((req.body as Record<string, string>)?.password ?? '').toString();
		if (await checkPassword(file, password)) {
			setUnlockCookie(reply, file);
			return reply.redirect(`/${encodeURIComponent(code)}`);
		}

		return html(reply, 401, renderPasswordPage(code, 'Incorrect password. Please try again.'));
	});
};
