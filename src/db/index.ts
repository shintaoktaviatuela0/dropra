import Database from 'better-sqlite3';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { runMigrations } from './migrations.js';

export type DB = Database.Database;

let db: DB | null = null;

/** Open (or reuse) the SQLite connection with sane concurrency pragmas. */
export const getDb = (): DB => {
	if (db) return db;

	db = new Database(config.databaseFile);
	// WAL greatly improves read/write concurrency for a single-process server.
	db.pragma('journal_mode = WAL');
	db.pragma('synchronous = NORMAL');
	db.pragma('foreign_keys = ON');
	// Wait up to 5s if the database is momentarily locked instead of throwing.
	db.pragma('busy_timeout = 5000');
	return db;
};

/** Open the database and apply all pending migrations. */
export const initDb = (): DB => {
	const connection = getDb();
	runMigrations(connection);
	logger.info({ database: config.databaseFile }, 'Database ready');
	return connection;
};

/** Flush WAL and close cleanly on shutdown. */
export const closeDb = (): void => {
	if (!db) return;
	try {
		db.pragma('wal_checkpoint(TRUNCATE)');
		db.close();
	} catch {
		// ignore — best effort during shutdown
	}

	db = null;
};
