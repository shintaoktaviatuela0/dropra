import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { deleteFile, findExpiredFiles } from './files.js';
import { closeReportsForMissingFiles, purgeReportsOlderThan } from './reports.js';
import { cleanupExpiredSessions } from './sessions.js';
import { getSettings } from './settings.js';

const TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000; // stale chunk uploads older than 24h

export interface CleanupResult {
	expiredFiles: number;
	expiredSessions: number;
	staleTempEntries: number;
	purgedReports: number;
}

/** Delete expired files, prune sessions, purge old reports and stale chunks. */
export const runCleanup = async (): Promise<CleanupResult> => {
	let expiredFiles = 0;
	for (const file of findExpiredFiles()) {
		try {
			await deleteFile(file);
			expiredFiles++;
		} catch (error) {
			logger.error({ err: error, shortCode: file.shortCode }, 'Failed to delete expired file');
		}
	}

	closeReportsForMissingFiles('File expired or was removed');
	const purgedReports = purgeReportsOlderThan(getSettings().reportsRetentionDays);
	const expiredSessions = cleanupExpiredSessions();
	const staleTempEntries = await cleanupTemp();

	if (expiredFiles || expiredSessions || staleTempEntries || purgedReports) {
		logger.info({ expiredFiles, expiredSessions, staleTempEntries, purgedReports }, 'Cleanup job completed');
	}

	return { expiredFiles, expiredSessions, staleTempEntries, purgedReports };
};

/** Remove leftover chunk-upload artifacts that never got finalized. */
export const cleanupTemp = async (): Promise<number> => {
	let removed = 0;
	let entries: string[];
	try {
		entries = await readdir(config.paths.temp);
	} catch {
		return 0;
	}

	const cutoff = Date.now() - TEMP_MAX_AGE_MS;
	for (const entry of entries) {
		const full = path.join(config.paths.temp, entry);
		try {
			const info = await stat(full);
			if (info.mtimeMs < cutoff) {
				await rm(full, { recursive: true, force: true });
				removed++;
			}
		} catch {
			// ignore individual failures
		}
	}

	return removed;
};

let timer: NodeJS.Timeout | null = null;

/** Start the periodic maintenance job (runs immediately, then hourly). */
export const startCleanupJob = (intervalMs = 60 * 60 * 1000): void => {
	void runCleanup();
	timer = setInterval(() => void runCleanup(), intervalMs);
	timer.unref();
};

export const stopCleanupJob = (): void => {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
};
