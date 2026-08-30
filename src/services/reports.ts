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
	resolvedAt: number | null;
	resolution: string | null;
}

/**
 * A report joined with the current state of its target. `fileExists` is false
 * once the file row is gone (the FK nulls `fileId`), which locks the report
 * into a read-only, terminal state.
 */
export interface ReportView extends Report {
	fileExists: boolean;
	fileStatus: string | null;
	fileName: string | null;
}

export const REPORT_REASONS = ['copyright', 'malware', 'illegal', 'privacy', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'dismissed', 'actioned', 'file_removed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Statuses that can no longer be acted on. */
const TERMINAL_STATUSES = new Set<string>(['dismissed', 'actioned', 'file_removed']);

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

const LIST_SQL = `
	SELECT r.*,
	       f.id IS NOT NULL AS fileExists,
	       f.status AS fileStatus,
	       f.name AS fileName
	FROM reports r
	LEFT JOIN files f ON f.id = r.fileId
`;

type ReportRow = Report & { fileExists: number; fileStatus: string | null; fileName: string | null };

export const listReports = (options: { status?: string; limit?: number } = {}): ReportView[] => {
	const db = getDb();
	const limit = Math.min(500, Math.max(1, options.limit ?? 200));
	const rows = (
		options.status
			? db.prepare(`${LIST_SQL} WHERE r.status = ? ORDER BY r.createdAt DESC LIMIT ?`).all(options.status, limit)
			: db.prepare(`${LIST_SQL} ORDER BY r.createdAt DESC LIMIT ?`).all(limit)
	) as ReportRow[];

	return rows.map(row => ({ ...row, fileExists: Boolean(row.fileExists) }));
};

export const getReport = (id: number): ReportView | undefined => {
	const row = getDb().prepare(`${LIST_SQL} WHERE r.id = ?`).get(id) as ReportRow | undefined;
	return row ? { ...row, fileExists: Boolean(row.fileExists) } : undefined;
};

/**
 * A report is editable only while it is still open AND its file still exists.
 * Once the file is deleted there is nothing left to moderate.
 */
export const isReportEditable = (report: ReportView): boolean =>
	report.fileExists && !TERMINAL_STATUSES.has(report.status);

export const setReportStatus = (id: number, status: ReportStatus, resolution?: string): void => {
	const terminal = TERMINAL_STATUSES.has(status);
	getDb()
		.prepare('UPDATE reports SET status = ?, resolvedAt = ?, resolution = ? WHERE id = ?')
		.run(status, terminal ? Date.now() : null, resolution ?? null, id);
};

/**
 * Close every open report whose file no longer exists. Called after any file
 * deletion so stale reports can never be acted on again.
 */
export const closeReportsForMissingFiles = (resolution = 'File deleted'): number =>
	getDb()
		.prepare(
			`UPDATE reports
			 SET status = 'file_removed', resolvedAt = ?, resolution = ?
			 WHERE status = 'open' AND (fileId IS NULL OR fileId NOT IN (SELECT id FROM files))`
		)
		.run(Date.now(), resolution).changes;

export const deleteReport = (id: number): boolean =>
	getDb().prepare('DELETE FROM reports WHERE id = ?').run(id).changes > 0;

/** Drop every report whose target file no longer exists. */
export const deleteReportsForMissingFiles = (): number =>
	getDb()
		.prepare('DELETE FROM reports WHERE fileId IS NULL OR fileId NOT IN (SELECT id FROM files)')
		.run().changes;

export const deleteReports = (ids: number[]): number => {
	if (!ids.length) return 0;
	const placeholders = ids.map(() => '?').join(', ');
	return getDb().prepare(`DELETE FROM reports WHERE id IN (${placeholders})`).run(...ids).changes;
};

export const deleteReportsByStatus = (status: ReportStatus): number =>
	getDb().prepare('DELETE FROM reports WHERE status = ?').run(status).changes;

/** Remove every report that is no longer open. */
export const deleteResolvedReports = (): number =>
	getDb().prepare("DELETE FROM reports WHERE status <> 'open'").run().changes;

export const deleteAllReports = (): number => getDb().prepare('DELETE FROM reports').run().changes;

/** Drop resolved reports older than `days`. A value of 0 disables retention. */
export const purgeReportsOlderThan = (days: number): number => {
	if (!Number.isFinite(days) || days <= 0) return 0;
	const cutoff = Date.now() - days * 86_400_000;
	return getDb()
		.prepare("DELETE FROM reports WHERE status <> 'open' AND COALESCE(resolvedAt, createdAt) < ?")
		.run(cutoff).changes;
};

export const countOpenReports = (): number =>
	(getDb().prepare("SELECT COUNT(*) AS count FROM reports WHERE status = 'open'").get() as { count: number }).count;

export const countReportsByStatus = (): Record<string, number> => {
	const rows = getDb().prepare('SELECT status, COUNT(*) AS count FROM reports GROUP BY status').all() as {
		status: string;
		count: number;
	}[];
	const counts: Record<string, number> = {};
	for (const row of rows) counts[row.status] = row.count;
	return counts;
};

/** Number of reports from an IP within a time window (report-spam protection). */
export const countReportsFromIpSince = (ip: string, since: number): number =>
	(
		getDb()
			.prepare('SELECT COUNT(*) AS count FROM reports WHERE ip = ? AND createdAt >= ?')
			.get(ip, since) as { count: number }
	).count;
