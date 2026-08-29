import { randomBytes, timingSafeEqual } from 'node:crypto';

/** Cryptographically strong URL-safe token (hex). */
export const randomToken = (bytes = 24): string => randomBytes(bytes).toString('hex');

/** Constant-time string comparison to avoid timing attacks. */
export const safeEqual = (a: string, b: string): boolean => {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
};
