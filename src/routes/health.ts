import type { FastifyInstance } from 'fastify';
import { config, isDataDirWritable } from '../config.js';
import { getDb } from '../db/index.js';

export const registerHealthRoutes = (app: FastifyInstance): void => {
	app.get('/health', async (_req, reply) => {
		let database = 'ok';
		try {
			getDb().prepare('SELECT 1').get();
		} catch {
			database = 'error';
		}

		const storage = isDataDirWritable() ? 'ok' : 'error';
		const healthy = database === 'ok' && storage === 'ok';

		return reply.code(healthy ? 200 : 503).send({
			status: healthy ? 'ok' : 'degraded',
			service: 'dropra',
			database,
			storage,
			version: config.isProduction ? undefined : '1.0.0'
		});
	});
};
