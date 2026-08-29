import { getDb } from '../db/index.js';

export const isIpBanned = (ip: string): boolean =>
	Boolean(getDb().prepare('SELECT 1 FROM banned_ips WHERE ip = ?').get(ip));

export const banIp = (ip: string, reason?: string): void => {
	getDb()
		.prepare('INSERT INTO banned_ips (ip, reason, createdAt) VALUES (?, ?, ?) ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason')
		.run(ip, reason ?? null, Date.now());
};

export const unbanIp = (ip: string): void => {
	getDb().prepare('DELETE FROM banned_ips WHERE ip = ?').run(ip);
};

export const listBannedIps = (): { ip: string; reason: string | null; createdAt: number }[] =>
	getDb().prepare('SELECT ip, reason, createdAt FROM banned_ips ORDER BY createdAt DESC').all() as {
		ip: string;
		reason: string | null;
		createdAt: number;
	}[];
