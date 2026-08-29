import { randomUUID } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { logger } from '../logger.js';

export interface User {
	id: number;
	uuid: string;
	username: string;
	password: string;
	role: string;
	enabled: number;
	createdAt: number;
	editedAt: number | null;
}

const ARGON_OPTIONS = {
	// Argon2id parameters — a sensible balance of security and speed.
	memoryCost: 19_456,
	timeCost: 2,
	parallelism: 1
};

export const hashPassword = (password: string): Promise<string> => argonHash(password, ARGON_OPTIONS);

export const verifyPassword = async (hash: string, password: string): Promise<boolean> => {
	try {
		return await argonVerify(hash, password);
	} catch {
		return false;
	}
};

export const getUserByUsername = (username: string): User | undefined =>
	getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;

export const getUserById = (id: number): User | undefined =>
	getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;

export const adminExists = (): boolean =>
	((getDb().prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as { count: number }).count) > 0;

/**
 * Create the administrator from ADMIN_USERNAME / ADMIN_PASSWORD on first boot.
 * Idempotent: if an admin already exists it is never recreated or reset, so
 * redeploys keep the existing account and password.
 */
export const createAdminUserIfNotExists = async (): Promise<void> => {
	if (adminExists()) {
		logger.info('Administrator account already present — skipping creation');
		return;
	}

	if (!config.admin.password) {
		logger.warn(
			'No administrator exists and ADMIN_PASSWORD is not set. Set ADMIN_USERNAME and ADMIN_PASSWORD, then restart.'
		);
		return;
	}

	const password = await hashPassword(config.admin.password);
	getDb()
		.prepare(
			'INSERT INTO users (uuid, username, password, role, enabled, createdAt) VALUES (?, ?, ?, ?, 1, ?)'
		)
		.run(randomUUID(), config.admin.username, password, 'admin', Date.now());

	// Never log the plaintext password — only the username.
	logger.info({ username: config.admin.username }, 'Administrator account created');
};
