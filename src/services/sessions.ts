import { getDb } from '../db/index.js';
import { randomToken } from '../utils/crypto.js';
import type { User } from './users.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface Session {
	id: string;
	userId: number;
	ip: string | null;
	userAgent: string | null;
	createdAt: number;
	expiresAt: number;
}

/** Create a new session and return its opaque id (stored in a signed cookie). */
export const createSession = (userId: number, ip?: string, userAgent?: string): string => {
	const id = randomToken(32);
	const nowMs = Date.now();
	getDb()
		.prepare('INSERT INTO sessions (id, userId, ip, userAgent, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)')
		.run(id, userId, ip ?? null, userAgent ?? null, nowMs, nowMs + SESSION_TTL_MS);
	return id;
};

/** Resolve a session id to its user, deleting the session if it has expired. */
export const getSessionUser = (sessionId: string): User | null => {
	const db = getDb();
	const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Session | undefined;
	if (!session) return null;
	if (session.expiresAt < Date.now()) {
		db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
		return null;
	}

	const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.userId) as User | undefined;
	if (!user || !user.enabled) return null;
	return user;
};

export const destroySession = (sessionId: string): void => {
	getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
};

export const destroyUserSessions = (userId: number): void => {
	getDb().prepare('DELETE FROM sessions WHERE userId = ?').run(userId);
};

/** Remove expired sessions (called by the maintenance job). */
export const cleanupExpiredSessions = (): number => {
	const result = getDb().prepare('DELETE FROM sessions WHERE expiresAt < ?').run(Date.now());
	return result.changes;
};
