import { getDb } from '../db/index.js';
import { UNKNOWN_CODE, countryFlag, countryName, lookupCountry } from './geo.js';

export interface CountryStat {
	code: string;
	name: string;
	flag: string;
	lat: number | null;
	lon: number | null;
	uploads: number;
	uploads24h: number;
	bytes: number;
	lastUploadAt: number;
}

export interface IntelEvent {
	shortCode: string;
	name: string;
	size: number;
	createdAt: number;
	code: string;
	country: string;
	flag: string;
	lat: number | null;
	lon: number | null;
}

export interface IntelSnapshot {
	generatedAt: number;
	totalUploads: number;
	uploads24h: number;
	uploads1h: number;
	countriesSeen: number;
	unknownUploads: number;
	countries: CountryStat[];
	events: IntelEvent[];
}

interface CountryRow {
	country: string | null;
	uploads: number;
	uploads24h: number;
	bytes: number;
	lastUploadAt: number;
}

interface EventRow {
	shortCode: string;
	name: string;
	size: number;
	createdAt: number;
	country: string | null;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Aggregated upload origins plus the most recent events, for the live map. */
export const getIntelSnapshot = (eventLimit = 40): IntelSnapshot => {
	const db = getDb();
	const now = Date.now();

	const rows = db
		.prepare(
			`SELECT country,
			        COUNT(*) AS uploads,
			        SUM(CASE WHEN createdAt >= ? THEN 1 ELSE 0 END) AS uploads24h,
			        COALESCE(SUM(size), 0) AS bytes,
			        MAX(createdAt) AS lastUploadAt
			 FROM files
			 GROUP BY country
			 ORDER BY uploads DESC`
		)
		.all(now - DAY) as CountryRow[];

	const countries: CountryStat[] = rows.map(row => {
		const code = row.country ?? UNKNOWN_CODE;
		const info = lookupCountry(row.country);
		return {
			code,
			name: row.country ? countryName(row.country) : 'Unknown',
			flag: countryFlag(row.country),
			lat: info?.lat ?? null,
			lon: info?.lon ?? null,
			uploads: row.uploads,
			uploads24h: row.uploads24h,
			bytes: row.bytes,
			lastUploadAt: row.lastUploadAt
		};
	});

	const eventRows = db
		.prepare('SELECT shortCode, name, size, createdAt, country FROM files ORDER BY createdAt DESC LIMIT ?')
		.all(Math.min(100, Math.max(1, eventLimit))) as EventRow[];

	const events: IntelEvent[] = eventRows.map(row => {
		const info = lookupCountry(row.country);
		return {
			shortCode: row.shortCode,
			name: row.name,
			size: row.size,
			createdAt: row.createdAt,
			code: row.country ?? UNKNOWN_CODE,
			country: row.country ? countryName(row.country) : 'Unknown',
			flag: countryFlag(row.country),
			lat: info?.lat ?? null,
			lon: info?.lon ?? null
		};
	});

	const totals = db
		.prepare(
			`SELECT COUNT(*) AS total,
			        SUM(CASE WHEN createdAt >= ? THEN 1 ELSE 0 END) AS day,
			        SUM(CASE WHEN createdAt >= ? THEN 1 ELSE 0 END) AS hour
			 FROM files`
		)
		.get(now - DAY, now - HOUR) as { total: number; day: number | null; hour: number | null };

	return {
		generatedAt: now,
		totalUploads: totals.total,
		uploads24h: totals.day ?? 0,
		uploads1h: totals.hour ?? 0,
		countriesSeen: countries.filter(entry => entry.lat !== null).length,
		unknownUploads: countries.filter(entry => entry.lat === null).reduce((sum, entry) => sum + entry.uploads, 0),
		countries,
		events
	};
};
