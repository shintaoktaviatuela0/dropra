import { randomBytes } from 'node:crypto';

/**
 * Alphabet without ambiguous characters (0/O, 1/l/I) so codes are easy to read
 * and type. 56 characters.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DEFAULT_LENGTH = 7;

/**
 * Application paths that must never be produced as a short code, otherwise a
 * generated file could shadow a real route. Compared case-insensitively.
 */
export const RESERVED_CODES = new Set<string>([
	'admin',
	'api',
	'login',
	'logout',
	'health',
	'assets',
	'static',
	'public',
	'raw',
	'download',
	'preview',
	'report',
	'reports',
	'settings',
	'security',
	'storage',
	'dashboard',
	'files',
	'thumbs',
	'thumbnails',
	'avatars',
	'docs',
	'about',
	'terms',
	'privacy',
	'robots.txt',
	'favicon.ico',
	'sitemap.xml',
	'.well-known'
]);

/** True if `code` collides with a reserved application path. */
export const isReserved = (code: string): boolean => RESERVED_CODES.has(code.toLowerCase());

/** Generate a single random code using unbiased rejection sampling. */
export const generateCode = (length = DEFAULT_LENGTH): string => {
	let out = '';
	const max = 256 - (256 % ALPHABET.length);
	while (out.length < length) {
		for (const byte of randomBytes(length * 2)) {
			if (byte >= max) continue; // reject to avoid modulo bias
			out += ALPHABET[byte % ALPHABET.length];
			if (out.length === length) break;
		}
	}

	return out;
};

/**
 * Generate a unique, non-reserved short code. `exists` reports whether a code
 * is already taken. Length grows after repeated collisions so we never loop
 * forever on a saturated keyspace.
 */
export const generateUniqueCode = (exists: (code: string) => boolean, length = DEFAULT_LENGTH): string => {
	let currentLength = length;
	for (let attempt = 0; attempt < 50; attempt++) {
		const code = generateCode(currentLength);
		if (isReserved(code)) continue;
		if (!exists(code)) return code;
		if (attempt > 0 && attempt % 10 === 0) currentLength++;
	}

	throw new Error('Failed to allocate a unique short code');
};
