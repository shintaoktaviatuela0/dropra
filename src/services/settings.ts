import { config } from '../config.js';
import { getDb } from '../db/index.js';

export interface DopraSettings {
	// General
	siteName: string;
	siteDescription: string;
	publicBaseUrl: string;
	contactUrl: string;
	termsUrl: string;
	privacyUrl: string;
	// Uploads
	allowAnonymousUploads: boolean;
	maxFileSize: number;
	maxFilesPerUpload: number;
	allowedExtensions: string[];
	blockedExtensions: string[];
	allowedMimeTypes: string[];
	blockedMimeTypes: string[];
	defaultExpiration: string;
	maxExpiration: string;
	allowNeverExpiration: boolean;
	// Downloads
	enablePreviews: boolean;
	enableDirectLinks: boolean;
	enableDownloadCounters: boolean;
	// Reports
	reportsRetentionDays: number;
	autoDeleteReportsOnFileDelete: boolean;
	// Intelligence
	geoIpLookupEnabled: boolean;
	// Appearance
	theme: 'system' | 'light' | 'dark';
	accentColor: string;
	logoUrl: string;
	faviconUrl: string;
	// Security / rate limits (window in ms, max requests per window)
	anonUploadRateWindow: number;
	anonUploadRateMax: number;
	downloadRateWindow: number;
	downloadRateMax: number;
	loginRateWindow: number;
	loginRateMax: number;
	reportRateWindow: number;
	reportRateMax: number;
}

export const DEFAULTS: DopraSettings = {
	siteName: 'Dopra',
	siteDescription: 'Drop. Share. Done. Simple file sharing without the complexity.',
	publicBaseUrl: config.publicUrl,
	contactUrl: '',
	termsUrl: '',
	privacyUrl: '',
	allowAnonymousUploads: true,
	maxFileSize: config.maxUploadSize,
	maxFilesPerUpload: 20,
	allowedExtensions: [],
	blockedExtensions: ['.jar', '.exe', '.msi', '.com', '.bat', '.cmd', '.scr', '.ps1', '.sh', '.php'],
	allowedMimeTypes: [],
	blockedMimeTypes: [],
	defaultExpiration: 'never',
	maxExpiration: 'never',
	allowNeverExpiration: true,
	enablePreviews: true,
	enableDirectLinks: true,
	enableDownloadCounters: true,
	reportsRetentionDays: 90,
	autoDeleteReportsOnFileDelete: false,
	geoIpLookupEnabled: false,
	theme: 'system',
	accentColor: '#4f46e5',
	logoUrl: '',
	faviconUrl: '',
	anonUploadRateWindow: 60_000,
	anonUploadRateMax: 30,
	downloadRateWindow: 60_000,
	downloadRateMax: 120,
	loginRateWindow: 300_000,
	loginRateMax: 10,
	reportRateWindow: 3_600_000,
	reportRateMax: 5
};

let cache: DopraSettings | null = null;

/** Load settings from the database, layering overrides on top of defaults. */
export const loadSettings = (): DopraSettings => {
	const db = getDb();
	const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
	const overrides: Record<string, unknown> = {};
	for (const row of rows) {
		try {
			overrides[row.key] = JSON.parse(row.value);
		} catch {
			// skip malformed rows
		}
	}

	cache = { ...DEFAULTS, ...(overrides as Partial<DopraSettings>) };
	return cache;
};

export const getSettings = (): DopraSettings => cache ?? loadSettings();

export const getSetting = <K extends keyof DopraSettings>(key: K): DopraSettings[K] => getSettings()[key];

/** Persist and hot-update a single setting (no restart needed). */
export const setSetting = <K extends keyof DopraSettings>(key: K, value: DopraSettings[K]): void => {
	const db = getDb();
	db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
		key,
		JSON.stringify(value)
	);
	if (!cache) loadSettings();
	cache![key] = value;
};

export const setSettings = (values: Partial<DopraSettings>): void => {
	for (const [key, value] of Object.entries(values)) {
		setSetting(key as keyof DopraSettings, value as never);
	}
};
