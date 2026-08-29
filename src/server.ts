import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fstatic from '@fastify/static';
import fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { config, resolveSessionSecret } from './config.js';
import { logger } from './logger.js';
import { isIpBanned } from './services/security.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerUploadRoutes } from './routes/upload.js';
import { ERROR_PAGES } from './views/error.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

const isApiPath = (url: string): boolean => url.startsWith('/api');

export const buildServer = async (): Promise<FastifyInstance> => {
	const options: FastifyServerOptions = {
		logger,
		trustProxy: config.trustProxy,
		bodyLimit: 1024 * 1024, // form bodies; file uploads use the multipart limit
		connectionTimeout: 0,
		disableRequestLogging: true
	};
	const app = fastify(options);

	await app.register(cookie, { secret: resolveSessionSecret() });

	await app.register(helmet, {
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", "'unsafe-inline'"],
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", 'data:', 'blob:'],
				mediaSrc: ["'self'", 'blob:'],
				objectSrc: ["'self'"],
				frameSrc: ["'self'"],
				connectSrc: ["'self'"],
				baseUri: ["'self'"],
				formAction: ["'self'"],
				frameAncestors: ["'self'"]
			}
		},
		crossOriginEmbedderPolicy: false
	});

	await app.register(formbody, { bodyLimit: 1024 * 1024 });

	await app.register(multipart, {
		limits: {
			fileSize: config.maxUploadSize,
			files: 1000,
			fields: 25,
			fieldSize: 1024 * 100
		}
	});

	await app.register(rateLimit, {
		global: false,
		errorResponseBuilder: (_req, context) => ({
			success: false,
			error: { code: 'RATE_LIMITED', message: `Too many requests. Retry in ${Math.ceil(context.ttl / 1000)}s.` }
		})
	});

	await app.register(fstatic, {
		root: publicDir,
		prefix: '/assets/',
		decorateReply: false,
		maxAge: config.isProduction ? '7d' : 0
	});

	// Block banned IPs from public/upload surfaces (admin & health stay reachable).
	app.addHook('onRequest', async (req, reply) => {
		if (req.url === '/health' || req.url.startsWith('/admin') || req.url.startsWith('/assets')) return;
		if (isIpBanned(req.ip)) {
			return reply.code(403).type('text/html; charset=utf-8').send(ERROR_PAGES.disabled());
		}
	});

	// Lightweight request logging (skip static assets in production).
	app.addHook('onResponse', (req, reply, done) => {
		if (!config.isProduction || !req.url.startsWith('/assets')) {
			req.log.info({ method: req.method, url: req.url, status: reply.statusCode, ip: req.ip });
		}

		done();
	});

	app.setNotFoundHandler((req, reply) => {
		if (isApiPath(req.url)) {
			return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found.' } });
		}

		return reply.code(404).type('text/html; charset=utf-8').send(ERROR_PAGES.notFound());
	});

	app.setErrorHandler((error, req, reply) => {
		const status = error.statusCode ?? 500;
		if (status >= 500) req.log.error({ err: error }, 'Request error');

		if (isApiPath(req.url)) {
			const code = status === 413 ? 'FILE_TOO_LARGE' : status === 429 ? 'RATE_LIMITED' : 'SERVER_ERROR';
			return reply.code(status).send({ success: false, error: { code, message: error.message || 'Server error.' } });
		}

		if (status === 413) return reply.code(413).type('text/html; charset=utf-8').send(ERROR_PAGES.tooLarge());
		if (status === 429) return reply.code(429).type('text/html; charset=utf-8').send(ERROR_PAGES.rateLimited());
		if (status === 404) return reply.code(404).type('text/html; charset=utf-8').send(ERROR_PAGES.notFound());
		return reply.code(status).type('text/html; charset=utf-8').send(ERROR_PAGES.server());
	});

	registerHealthRoutes(app);
	registerUploadRoutes(app);
	registerAdminRoutes(app);
	registerPublicRoutes(app);

	return app;
};
