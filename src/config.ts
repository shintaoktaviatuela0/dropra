import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

const bool = (value: string | undefined, fallback: boolean): boolean => {
	if (value === undefined) return fallback;
	return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const int = (value: string | undefined, fallback: number): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const dataDir = path.resolve(process.env.DATA_DIR ?? './data');

export const config = {
	nodeEnv: process.env.NODE_ENV ?? 'development',
	isProduction: process.env.NODE_ENV === 'production',
	/** Railway (and most PaaS) inject PORT. Only fall back for local dev. */
	port: int(process.env.PORT, 3000),
	host: '0.0.0.0',
	/** Public base URL used to build shareable links. Empty = auto-detect. */
	publicUrl: (process.env.PUBLIC_URL ?? '').replace(/\/+$/, ''),
	dataDir,
	paths: {
		uploads: path.join(dataDir, 'uploads'),
		database: path.join(dataDir, 'database'),
		thumbnails: path.join(dataDir, 'thumbnails'),
		temp: path.join(dataDir, 'temp'),
		avatars: path.join(dataDir, 'avatars'),
		system: path.join(dataDir, 'system')
	},
	get databaseFile() {
		return path.join(this.paths.database, 'dropra.sqlite');
	},
	admin: {
		username: process.env.ADMIN_USERNAME ?? 'admin',
		password: process.env.ADMIN_PASSWORD ?? ''
	},
	maxUploadSize: int(process.env.MAX_UPLOAD_SIZE, 2 * 1024 * 1024 * 1024),
	/** Chunk size for chunked uploads (defaults to 90 MB, mirrors upstream). */
	chunkSize: int(process.env.CHUNK_SIZE, 90 * 1024 * 1024),
	trustProxy: bool(process.env.TRUST_PROXY, true)
};

/** Create every persistent directory. Safe to call repeatedly (idempotent). */
export const ensureDirectories = (): void => {
	mkdirSync(config.dataDir, { recursive: true });
	for (const dir of Object.values(config.paths)) {
		mkdirSync(dir, { recursive: true });
	}
};

/** Verify DATA_DIR is writable by attempting a temp write. */
export const isDataDirWritable = (): boolean => {
	try {
		const probe = path.join(config.dataDir, '.write-test');
		writeFileSync(probe, 'ok');
		return true;
	} catch {
		return false;
	}
};

/**
 * Resolve the session secret. Priority:
 *   1. SESSION_SECRET env var
 *   2. persisted secret under DATA_DIR/system/session.secret
 *   3. freshly generated secret (persisted for future boots)
 */
export const resolveSessionSecret = (): string => {
	const fromEnv = process.env.SESSION_SECRET?.trim();
	if (fromEnv && fromEnv.length >= 16) return fromEnv;

	const secretFile = path.join(config.paths.system, 'session.secret');
	if (existsSync(secretFile)) {
		const existing = readFileSync(secretFile, 'utf8').trim();
		if (existing.length >= 16) return existing;
	}

	const generated = randomBytes(48).toString('hex');
	writeFileSync(secretFile, generated, { mode: 0o600 });
	return generated;
};
