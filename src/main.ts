import 'dotenv/config';
import process from 'node:process';
import { config, ensureDirectories, isDataDirWritable } from './config.js';
import { closeDb, initDb } from './db/index.js';
import { logger } from './logger.js';
import { startCleanupJob, stopCleanupJob } from './services/cleanup.js';
import { loadSettings } from './services/settings.js';
import { createAdminUserIfNotExists } from './services/users.js';
import { buildServer } from './server.js';

const start = async (): Promise<void> => {
	logger.info('Dopra starting...');

	// 1. Ensure the persistent directory structure exists (runtime, not build).
	ensureDirectories();
	const writable = isDataDirWritable();

	logger.info(`Data directory: ${config.dataDir}`);
	logger.info(`Database: ${config.databaseFile}`);
	logger.info(`Storage: ${config.paths.uploads}`);
	logger.info(`Storage writable: ${writable ? 'yes' : 'no'}`);
	if (!writable) {
		logger.error('DATA_DIR is not writable. On Railway, attach a Volume mounted at /data.');
	}

	// 2. Open the database and apply migrations.
	initDb();

	// 3. Load settings (creates defaults lazily) and provision the admin.
	loadSettings();
	await createAdminUserIfNotExists();

	// 4. Build and start the HTTP server.
	const app = await buildServer();
	await app.listen({ port: config.port, host: config.host });
	logger.info(`Dopra listening on http://${config.host}:${config.port}`);

	// 5. Start background maintenance (expired files, sessions, temp chunks).
	startCleanupJob();

	const shutdown = async (signal: string): Promise<void> => {
		logger.info(`${signal} received, shutting down gracefully...`);
		stopCleanupJob();
		try {
			await app.close();
		} catch (error) {
			logger.error({ err: error }, 'Error while closing server');
		}

		closeDb();
		process.exit(0);
	};

	process.on('SIGTERM', () => void shutdown('SIGTERM'));
	process.on('SIGINT', () => void shutdown('SIGINT'));
};

process.on('uncaughtException', error => logger.error({ err: error }, 'Uncaught exception'));
process.on('unhandledRejection', error => logger.error({ err: error }, 'Unhandled rejection'));

start().catch(error => {
	logger.error({ err: error }, 'Fatal error during startup');
	process.exit(1);
});
