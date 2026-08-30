import type { DB } from './index.js';
import { logger } from '../logger.js';

interface Migration {
	version: number;
	name: string;
	up(db: DB): void;
}

const migrations: Migration[] = [
	{
		version: 1,
		name: 'initial schema',
		up(db) {
			db.exec(`
				CREATE TABLE users (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					uuid TEXT NOT NULL UNIQUE,
					username TEXT NOT NULL UNIQUE,
					password TEXT NOT NULL,
					role TEXT NOT NULL DEFAULT 'user',
					enabled INTEGER NOT NULL DEFAULT 1,
					createdAt INTEGER NOT NULL,
					editedAt INTEGER
				);

				CREATE TABLE sessions (
					id TEXT PRIMARY KEY,
					userId INTEGER NOT NULL,
					ip TEXT,
					userAgent TEXT,
					createdAt INTEGER NOT NULL,
					expiresAt INTEGER NOT NULL,
					FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
				);
				CREATE INDEX idx_sessions_expiresAt ON sessions(expiresAt);

				CREATE TABLE files (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					uuid TEXT NOT NULL UNIQUE,
					shortCode TEXT NOT NULL UNIQUE,
					name TEXT NOT NULL,
					storageName TEXT NOT NULL,
					extension TEXT,
					mimeType TEXT,
					size INTEGER NOT NULL DEFAULT 0,
					hash TEXT,
					userId INTEGER,
					ip TEXT,
					passwordHash TEXT,
					deletionToken TEXT NOT NULL,
					ownerToken TEXT,
					downloadCount INTEGER NOT NULL DEFAULT 0,
					lastDownloadAt INTEGER,
					maxDownloads INTEGER,
					downloadLimitAction TEXT NOT NULL DEFAULT 'disable',
					status TEXT NOT NULL DEFAULT 'active',
					expiresAt INTEGER,
					createdAt INTEGER NOT NULL,
					editedAt INTEGER,
					FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
				);
				CREATE INDEX idx_files_status ON files(status);
				CREATE INDEX idx_files_expiresAt ON files(expiresAt);
				CREATE INDEX idx_files_createdAt ON files(createdAt);
				CREATE INDEX idx_files_userId ON files(userId);
				CREATE INDEX idx_files_ownerToken ON files(ownerToken);

				CREATE TABLE settings (
					key TEXT PRIMARY KEY,
					value TEXT NOT NULL
				);

				CREATE TABLE reports (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					fileId INTEGER,
					shortCode TEXT NOT NULL,
					reason TEXT NOT NULL,
					details TEXT,
					ip TEXT,
					status TEXT NOT NULL DEFAULT 'open',
					createdAt INTEGER NOT NULL,
					FOREIGN KEY (fileId) REFERENCES files(id) ON DELETE SET NULL
				);
				CREATE INDEX idx_reports_status ON reports(status);
				CREATE INDEX idx_reports_fileId ON reports(fileId);

				CREATE TABLE banned_ips (
					ip TEXT PRIMARY KEY,
					reason TEXT,
					createdAt INTEGER NOT NULL
				);

				CREATE TABLE stats_daily (
					day TEXT PRIMARY KEY,
					uploads INTEGER NOT NULL DEFAULT 0,
					downloads INTEGER NOT NULL DEFAULT 0,
					bytes INTEGER NOT NULL DEFAULT 0
				);
			`);
		}
	},
	{
		version: 2,
		name: 'upload geography',
		up(db) {
			db.exec(`
				ALTER TABLE files ADD COLUMN country TEXT;
				CREATE INDEX idx_files_country ON files(country);

				CREATE TABLE geo_cache (
					ip TEXT PRIMARY KEY,
					country TEXT,
					resolvedAt INTEGER NOT NULL
				);
			`);
		}
	},
	{
		version: 3,
		name: 'report resolution metadata',
		up(db) {
			db.exec(`
				ALTER TABLE reports ADD COLUMN resolvedAt INTEGER;
				ALTER TABLE reports ADD COLUMN resolution TEXT;
			`);
		}
	}
];

/** Apply pending migrations inside a transaction, tracking applied versions. */
export const runMigrations = (db: DB): void => {
	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			appliedAt INTEGER NOT NULL
		);
	`);

	const applied = new Set<number>(
		db.prepare('SELECT version FROM schema_migrations').all().map((row: any) => row.version as number)
	);

	const record = db.prepare('INSERT INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)');

	for (const migration of migrations.sort((a, b) => a.version - b.version)) {
		if (applied.has(migration.version)) continue;
		logger.info({ version: migration.version, name: migration.name }, 'Applying migration');
		const apply = db.transaction(() => {
			migration.up(db);
			record.run(migration.version, migration.name, Date.now());
		});
		apply();
	}
};
