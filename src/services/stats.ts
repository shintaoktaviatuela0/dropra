import { getDb } from '../db/index.js';

const today = (): string => new Date().toISOString().slice(0, 10);

/** Increment today's upload counter (real data, not synthetic). */
export const recordUpload = (bytes: number): void => {
	getDb()
		.prepare(
			`INSERT INTO stats_daily (day, uploads, downloads, bytes) VALUES (?, 1, 0, ?)
			 ON CONFLICT(day) DO UPDATE SET uploads = uploads + 1, bytes = bytes + excluded.bytes`
		)
		.run(today(), bytes);
};

/** Increment today's download counter. */
export const recordDownload = (): void => {
	getDb()
		.prepare(
			`INSERT INTO stats_daily (day, uploads, downloads, bytes) VALUES (?, 0, 1, 0)
			 ON CONFLICT(day) DO UPDATE SET downloads = downloads + 1`
		)
		.run(today());
};

export interface DashboardStats {
	totalFiles: number;
	totalStorage: number;
	totalDownloads: number;
	uploadsToday: number;
	downloadsToday: number;
	uploads24h: number;
	downloads24h: number;
	series: { day: string; uploads: number; downloads: number }[];
	recent: RecentFile[];
	largest: RecentFile[];
	mostDownloaded: RecentFile[];
}

export interface RecentFile {
	shortCode: string;
	name: string;
	size: number;
	downloadCount: number;
	createdAt: number;
}

export const getDashboardStats = (): DashboardStats => {
	const db = getDb();

	const totals = db
		.prepare(
			`SELECT COUNT(*) AS totalFiles,
			        COALESCE(SUM(size), 0) AS totalStorage,
			        COALESCE(SUM(downloadCount), 0) AS totalDownloads
			 FROM files`
		)
		.get() as { totalFiles: number; totalStorage: number; totalDownloads: number };

	const dayKey = today();
	const todayRow = db.prepare('SELECT uploads, downloads FROM stats_daily WHERE day = ?').get(dayKey) as
		| { uploads: number; downloads: number }
		| undefined;

	// Real 14-day series pulled from the daily counters table.
	const series: { day: string; uploads: number; downloads: number }[] = [];
	for (let i = 13; i >= 0; i--) {
		const date = new Date();
		date.setUTCDate(date.getUTCDate() - i);
		const key = date.toISOString().slice(0, 10);
		const row = db.prepare('SELECT uploads, downloads FROM stats_daily WHERE day = ?').get(key) as
			| { uploads: number; downloads: number }
			| undefined;
		series.push({ day: key, uploads: row?.uploads ?? 0, downloads: row?.downloads ?? 0 });
	}

	const last24 = series.slice(-2);
	const recent = db
		.prepare('SELECT shortCode, name, size, downloadCount, createdAt FROM files ORDER BY createdAt DESC LIMIT 8')
		.all() as RecentFile[];
	const largest = db
		.prepare('SELECT shortCode, name, size, downloadCount, createdAt FROM files ORDER BY size DESC LIMIT 8')
		.all() as RecentFile[];
	const mostDownloaded = db
		.prepare('SELECT shortCode, name, size, downloadCount, createdAt FROM files ORDER BY downloadCount DESC LIMIT 8')
		.all() as RecentFile[];

	const uploadsToday = todayRow?.uploads ?? 0;
	const downloadsToday = todayRow?.downloads ?? 0;

	return {
		totalFiles: totals.totalFiles,
		totalStorage: totals.totalStorage,
		totalDownloads: totals.totalDownloads,
		uploadsToday,
		downloadsToday,
		uploads24h: last24.reduce((sum, entry) => sum + entry.uploads, 0),
		downloads24h: last24.reduce((sum, entry) => sum + entry.downloads, 0),
		series,
		recent,
		largest,
		mostDownloaded
	};
};
