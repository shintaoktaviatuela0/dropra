import { getDb } from '../db/index.js';

export interface Report {
	id: number;
	fileId: number | null;
	shortCode: string;
	reason: string;
	details: string | null;
	ip: string | null;
	status: string;
	createdAt: number;
}

export const REPORT_REASONS = ['copyright', 'malware', 'illegal', 'privacy', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const createReport = (input: {
	fileId: number | null;
	shortCode: string;
	reason: string;
	details?: string | null;
	ip?: string | null;
}): void => {
	getDb()
		.prepare(
			'INSERT INTO reports (fileId, shortCode, reason, details, ip, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.run(input.fileId, input.shortCode, input.reason, input.details ?? null, input.ip ?? null, 'open', Date.now());
};

export const listReports = (status?: string): Report[] => {
	const db = getDb();
	if (status) {
		return db.prepare('SELECT * FROM reports WHERE status = ? ORDER BY createdAt DESC').all(status) as Report[];
	}

	return db.prepare('SELECT * FROM reports ORDER BY createdAt DESC LIMIT 200').all() as Report[];
};

export const getReport = (id: number): Report | undefined =>
	getDb().prepare('SELECT * FROM reports WHERE id = ?').get(id) as Report | undefined;

export const setReportStatus = (id: number, status: 'open' | 'dismissed' | 'actioned'): void => {
	getDb().prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, id);
};

export const countOpenReports = (): number =>
	(getDb().prepare("SELECT COUNT(*) AS count FROM reports WHERE status = 'open'").get() as { count: number }).count;

/** Number of reports from an IP within a time window (report-spam protection). */
export const countReportsFromIpSince = (ip: string, since: number): number =>
	(
		getDb()
			.prepare('SELECT COUNT(*) AS count FROM reports WHERE ip = ? AND createdAt >= ?')
			.get(ip, since) as { count: number }
	).count;
