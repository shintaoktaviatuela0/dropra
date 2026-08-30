import { getDb } from '../db/index.js';
import { logger } from '../logger.js';
import { getSettings } from './settings.js';

export interface CountryInfo {
	code: string;
	name: string;
	lat: number;
	lon: number;
}

/**
 * ISO 3166-1 alpha-2 code → display name and an approximate geographic centre,
 * used to plot upload origins on the intelligence map.
 */
const COUNTRY_TABLE: Record<string, [string, number, number]> = {
	AD: ['Andorra', 42.5, 1.5],
	AE: ['United Arab Emirates', 24.0, 54.0],
	AF: ['Afghanistan', 33.0, 65.0],
	AG: ['Antigua and Barbuda', 17.05, -61.8],
	AL: ['Albania', 41.0, 20.0],
	AM: ['Armenia', 40.0, 45.0],
	AO: ['Angola', -12.5, 18.5],
	AR: ['Argentina', -34.0, -64.0],
	AT: ['Austria', 47.33, 13.33],
	AU: ['Australia', -27.0, 133.0],
	AZ: ['Azerbaijan', 40.5, 47.5],
	BA: ['Bosnia and Herzegovina', 44.0, 18.0],
	BB: ['Barbados', 13.17, -59.53],
	BD: ['Bangladesh', 24.0, 90.0],
	BE: ['Belgium', 50.83, 4.0],
	BF: ['Burkina Faso', 13.0, -2.0],
	BG: ['Bulgaria', 43.0, 25.0],
	BH: ['Bahrain', 26.0, 50.55],
	BI: ['Burundi', -3.5, 30.0],
	BJ: ['Benin', 9.5, 2.25],
	BN: ['Brunei', 4.5, 114.67],
	BO: ['Bolivia', -17.0, -65.0],
	BR: ['Brazil', -10.0, -55.0],
	BS: ['Bahamas', 24.25, -76.0],
	BT: ['Bhutan', 27.5, 90.5],
	BW: ['Botswana', -22.0, 24.0],
	BY: ['Belarus', 53.0, 28.0],
	BZ: ['Belize', 17.25, -88.75],
	CA: ['Canada', 60.0, -96.0],
	CD: ['DR Congo', 0.0, 25.0],
	CF: ['Central African Republic', 7.0, 21.0],
	CG: ['Congo', -1.0, 15.0],
	CH: ['Switzerland', 47.0, 8.0],
	CI: ["Côte d'Ivoire", 8.0, -5.0],
	CL: ['Chile', -30.0, -71.0],
	CM: ['Cameroon', 6.0, 12.0],
	CN: ['China', 35.0, 105.0],
	CO: ['Colombia', 4.0, -72.0],
	CR: ['Costa Rica', 10.0, -84.0],
	CU: ['Cuba', 21.5, -80.0],
	CV: ['Cabo Verde', 16.0, -24.0],
	CY: ['Cyprus', 35.0, 33.0],
	CZ: ['Czechia', 49.75, 15.5],
	DE: ['Germany', 51.0, 9.0],
	DJ: ['Djibouti', 11.5, 43.0],
	DK: ['Denmark', 56.0, 10.0],
	DM: ['Dominica', 15.42, -61.33],
	DO: ['Dominican Republic', 19.0, -70.67],
	DZ: ['Algeria', 28.0, 3.0],
	EC: ['Ecuador', -2.0, -77.5],
	EE: ['Estonia', 59.0, 26.0],
	EG: ['Egypt', 27.0, 30.0],
	ER: ['Eritrea', 15.0, 39.0],
	ES: ['Spain', 40.0, -4.0],
	ET: ['Ethiopia', 8.0, 38.0],
	FI: ['Finland', 64.0, 26.0],
	FJ: ['Fiji', -18.0, 178.0],
	FR: ['France', 46.0, 2.0],
	GA: ['Gabon', -1.0, 11.75],
	GB: ['United Kingdom', 54.0, -2.0],
	GD: ['Grenada', 12.12, -61.67],
	GE: ['Georgia', 42.0, 43.5],
	GH: ['Ghana', 8.0, -2.0],
	GL: ['Greenland', 72.0, -40.0],
	GM: ['Gambia', 13.47, -16.57],
	GN: ['Guinea', 11.0, -10.0],
	GQ: ['Equatorial Guinea', 2.0, 10.0],
	GR: ['Greece', 39.0, 22.0],
	GT: ['Guatemala', 15.5, -90.25],
	GW: ['Guinea-Bissau', 12.0, -15.0],
	GY: ['Guyana', 5.0, -59.0],
	HK: ['Hong Kong', 22.25, 114.17],
	HN: ['Honduras', 15.0, -86.5],
	HR: ['Croatia', 45.17, 15.5],
	HT: ['Haiti', 19.0, -72.42],
	HU: ['Hungary', 47.0, 20.0],
	ID: ['Indonesia', -5.0, 120.0],
	IE: ['Ireland', 53.0, -8.0],
	IL: ['Israel', 31.5, 34.75],
	IN: ['India', 20.0, 77.0],
	IQ: ['Iraq', 33.0, 44.0],
	IR: ['Iran', 32.0, 53.0],
	IS: ['Iceland', 65.0, -18.0],
	IT: ['Italy', 42.83, 12.83],
	JM: ['Jamaica', 18.25, -77.5],
	JO: ['Jordan', 31.0, 36.0],
	JP: ['Japan', 36.0, 138.0],
	KE: ['Kenya', 1.0, 38.0],
	KG: ['Kyrgyzstan', 41.0, 75.0],
	KH: ['Cambodia', 13.0, 105.0],
	KR: ['South Korea', 37.0, 127.5],
	KW: ['Kuwait', 29.34, 47.66],
	KZ: ['Kazakhstan', 48.0, 68.0],
	LA: ['Laos', 18.0, 105.0],
	LB: ['Lebanon', 33.83, 35.83],
	LK: ['Sri Lanka', 7.0, 81.0],
	LR: ['Liberia', 6.5, -9.5],
	LS: ['Lesotho', -29.5, 28.5],
	LT: ['Lithuania', 56.0, 24.0],
	LU: ['Luxembourg', 49.75, 6.17],
	LV: ['Latvia', 57.0, 25.0],
	LY: ['Libya', 25.0, 17.0],
	MA: ['Morocco', 32.0, -5.0],
	MC: ['Monaco', 43.73, 7.4],
	MD: ['Moldova', 47.0, 29.0],
	ME: ['Montenegro', 42.5, 19.3],
	MG: ['Madagascar', -20.0, 47.0],
	MK: ['North Macedonia', 41.83, 22.0],
	ML: ['Mali', 17.0, -4.0],
	MM: ['Myanmar', 22.0, 98.0],
	MN: ['Mongolia', 46.0, 105.0],
	MO: ['Macao', 22.17, 113.55],
	MR: ['Mauritania', 20.0, -12.0],
	MT: ['Malta', 35.83, 14.58],
	MU: ['Mauritius', -20.28, 57.55],
	MV: ['Maldives', 3.25, 73.0],
	MW: ['Malawi', -13.5, 34.0],
	MX: ['Mexico', 23.0, -102.0],
	MY: ['Malaysia', 2.5, 112.5],
	MZ: ['Mozambique', -18.25, 35.0],
	NA: ['Namibia', -22.0, 17.0],
	NE: ['Niger', 16.0, 8.0],
	NG: ['Nigeria', 10.0, 8.0],
	NI: ['Nicaragua', 13.0, -85.0],
	NL: ['Netherlands', 52.5, 5.75],
	NO: ['Norway', 62.0, 10.0],
	NP: ['Nepal', 28.0, 84.0],
	NZ: ['New Zealand', -41.0, 174.0],
	OM: ['Oman', 21.0, 57.0],
	PA: ['Panama', 9.0, -80.0],
	PE: ['Peru', -10.0, -76.0],
	PG: ['Papua New Guinea', -6.0, 147.0],
	PH: ['Philippines', 13.0, 122.0],
	PK: ['Pakistan', 30.0, 70.0],
	PL: ['Poland', 52.0, 20.0],
	PR: ['Puerto Rico', 18.25, -66.5],
	PS: ['Palestine', 32.0, 35.25],
	PT: ['Portugal', 39.5, -8.0],
	PY: ['Paraguay', -23.0, -58.0],
	QA: ['Qatar', 25.5, 51.25],
	RO: ['Romania', 46.0, 25.0],
	RS: ['Serbia', 44.0, 21.0],
	RU: ['Russia', 60.0, 100.0],
	RW: ['Rwanda', -2.0, 30.0],
	SA: ['Saudi Arabia', 25.0, 45.0],
	SD: ['Sudan', 15.0, 30.0],
	SE: ['Sweden', 62.0, 15.0],
	SG: ['Singapore', 1.37, 103.8],
	SI: ['Slovenia', 46.12, 14.82],
	SK: ['Slovakia', 48.67, 19.5],
	SL: ['Sierra Leone', 8.5, -11.5],
	SN: ['Senegal', 14.0, -14.0],
	SO: ['Somalia', 6.0, 46.0],
	SR: ['Suriname', 4.0, -56.0],
	SS: ['South Sudan', 7.0, 30.0],
	SV: ['El Salvador', 13.83, -88.92],
	SY: ['Syria', 35.0, 38.0],
	SZ: ['Eswatini', -26.5, 31.5],
	TD: ['Chad', 15.0, 19.0],
	TG: ['Togo', 8.0, 1.17],
	TH: ['Thailand', 15.0, 100.0],
	TJ: ['Tajikistan', 39.0, 71.0],
	TL: ['Timor-Leste', -8.83, 125.92],
	TM: ['Turkmenistan', 40.0, 60.0],
	TN: ['Tunisia', 34.0, 9.0],
	TR: ['Türkiye', 39.0, 35.0],
	TT: ['Trinidad and Tobago', 11.0, -61.0],
	TW: ['Taiwan', 23.5, 121.0],
	TZ: ['Tanzania', -6.0, 35.0],
	UA: ['Ukraine', 49.0, 32.0],
	UG: ['Uganda', 1.0, 32.0],
	US: ['United States', 38.0, -97.0],
	UY: ['Uruguay', -33.0, -56.0],
	UZ: ['Uzbekistan', 41.0, 64.0],
	VE: ['Venezuela', 8.0, -66.0],
	VN: ['Vietnam', 16.0, 106.0],
	YE: ['Yemen', 15.5, 47.5],
	ZA: ['South Africa', -29.0, 24.0],
	ZM: ['Zambia', -15.0, 30.0],
	ZW: ['Zimbabwe', -19.0, 30.0]
};

const CODE_RE = /^[A-Z]{2}$/;

/** Pseudo-codes used when a real country cannot be determined. */
export const LOCAL_CODE = 'LO';
export const UNKNOWN_CODE = 'ZZ';

export const lookupCountry = (code: string | null | undefined): CountryInfo | null => {
	if (!code) return null;
	const upper = code.toUpperCase();
	if (upper === LOCAL_CODE) return { code: LOCAL_CODE, name: 'Local network', lat: 0, lon: 0 };
	const entry = COUNTRY_TABLE[upper];
	return entry ? { code: upper, name: entry[0], lat: entry[1], lon: entry[2] } : null;
};

export const countryName = (code: string | null | undefined): string => {
	if (!code) return 'Unknown';
	if (code === LOCAL_CODE) return 'Local network';
	return lookupCountry(code)?.name ?? code;
};

/** Regional-indicator flag emoji for a real ISO code. */
export const countryFlag = (code: string | null | undefined): string => {
	if (!code || !CODE_RE.test(code) || !COUNTRY_TABLE[code]) return '🌐';
	return String.fromCodePoint(...[...code].map(char => 0x1f1e6 + char.charCodeAt(0) - 65));
};

/** Headers set by common CDNs and platforms that already resolve the country. */
const COUNTRY_HEADERS = [
	'cf-ipcountry',
	'x-vercel-ip-country',
	'x-country-code',
	'x-geo-country',
	'x-appengine-country',
	'fastly-client-country-code',
	'cloudfront-viewer-country'
];

export const countryFromHeaders = (headers: Record<string, unknown>): string | null => {
	for (const header of COUNTRY_HEADERS) {
		const raw = headers[header];
		const value = Array.isArray(raw) ? raw[0] : raw;
		if (typeof value !== 'string') continue;
		const code = value.trim().toUpperCase();
		if (CODE_RE.test(code) && COUNTRY_TABLE[code]) return code;
	}

	return null;
};

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Loopback, link-local and RFC1918 ranges never have a public geolocation. */
export const isPrivateIp = (ip: string): boolean => {
	const value = ip.replace(/^::ffff:/i, '').trim();
	if (!value || value === '::1' || value === 'localhost') return true;
	if (value.includes(':')) return /^(fc|fd|fe80)/i.test(value);

	const match = IPV4_RE.exec(value);
	if (!match) return true;
	const [a, b] = [Number(match[1]), Number(match[2])];
	if ([a, Number(match[2]), Number(match[3]), Number(match[4])].some(part => part > 255)) return true;
	if (a === 10 || a === 127 || a === 0) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 169 && b === 254) return true;
	if (a === 100 && b >= 64 && b <= 127) return true;
	return false;
};

const CACHE_TTL_MS = 30 * 86_400_000;

const readCache = (ip: string): string | null | undefined => {
	const row = getDb().prepare('SELECT country, resolvedAt FROM geo_cache WHERE ip = ?').get(ip) as
		| { country: string | null; resolvedAt: number }
		| undefined;
	if (!row || Date.now() - row.resolvedAt > CACHE_TTL_MS) return undefined;
	return row.country;
};

const writeCache = (ip: string, country: string | null): void => {
	getDb()
		.prepare(
			`INSERT INTO geo_cache (ip, country, resolvedAt) VALUES (?, ?, ?)
			 ON CONFLICT(ip) DO UPDATE SET country = excluded.country, resolvedAt = excluded.resolvedAt`
		)
		.run(ip, country, Date.now());
};

const LOOKUP_TIMEOUT_MS = 4000;

/**
 * Resolve a public IP to a country using the configured third-party provider.
 * Only called when `geoIpLookupEnabled` is on, and results are cached.
 */
const lookupRemote = async (ip: string): Promise<string | null> => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
	try {
		const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`, {
			signal: controller.signal,
			headers: { accept: 'application/json' }
		});
		if (!response.ok) return null;
		const payload = (await response.json()) as { success?: boolean; country_code?: string };
		const code = (payload.country_code ?? '').toUpperCase();
		return payload.success && CODE_RE.test(code) && COUNTRY_TABLE[code] ? code : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
};

/**
 * Best-effort country for a request. Platform headers are free and instant;
 * the remote provider is opt-in because it discloses the visitor IP.
 */
export const resolveCountry = async (ip: string | null | undefined, headers: Record<string, unknown> = {}): Promise<string | null> => {
	const fromHeader = countryFromHeaders(headers);
	if (fromHeader) return fromHeader;
	if (!ip) return null;
	if (isPrivateIp(ip)) return LOCAL_CODE;
	if (!getSettings().geoIpLookupEnabled) return null;

	const cached = readCache(ip);
	if (cached !== undefined) return cached;

	const resolved = await lookupRemote(ip);
	try {
		writeCache(ip, resolved);
	} catch (error) {
		logger.debug({ err: error }, 'Failed to cache geo lookup');
	}

	return resolved;
};

export const clearGeoCache = (): number => getDb().prepare('DELETE FROM geo_cache').run().changes;
