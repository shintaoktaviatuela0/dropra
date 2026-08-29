export interface ExpirationOption {
	key: string;
	label: string;
	ms: number | null; // null = never
}

export const EXPIRATION_OPTIONS: ExpirationOption[] = [
	{ key: 'never', label: 'Never', ms: null },
	{ key: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
	{ key: '6h', label: '6 hours', ms: 6 * 60 * 60 * 1000 },
	{ key: '12h', label: '12 hours', ms: 12 * 60 * 60 * 1000 },
	{ key: '1d', label: '1 day', ms: 24 * 60 * 60 * 1000 },
	{ key: '3d', label: '3 days', ms: 3 * 24 * 60 * 60 * 1000 },
	{ key: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
	{ key: '30d', label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 }
];

const byKey = new Map(EXPIRATION_OPTIONS.map(option => [option.key, option]));

/** Convert an expiration option key to an absolute epoch (ms), or null. */
export const expirationToTimestamp = (key: string | undefined, from = Date.now()): number | null => {
	if (!key) return null;
	const option = byKey.get(key);
	if (!option || option.ms === null) return null;
	return from + option.ms;
};

export const isValidExpiration = (key: string): boolean => byKey.has(key);

/**
 * Clamp a requested expiration against the configured maximum. Returns the
 * effective absolute timestamp (or null for never).
 */
export const clampExpiration = (
	requested: string | undefined,
	maxKey: string,
	allowNever: boolean,
	from = Date.now()
): number | null => {
	const maxOption = byKey.get(maxKey);
	const maxMs = maxOption?.ms ?? null;

	let requestedMs: number | null;
	if (requested === undefined || requested === '') {
		requestedMs = null;
	} else {
		const option = byKey.get(requested);
		requestedMs = option ? option.ms : null;
	}

	// If "never" is not allowed, force the maximum (or 30d fallback).
	if (requestedMs === null && !allowNever) {
		requestedMs = maxMs ?? 30 * 24 * 60 * 60 * 1000;
	}

	// Respect the configured maximum expiration when one is set.
	if (maxMs !== null) {
		if (requestedMs === null || requestedMs > maxMs) requestedMs = maxMs;
	}

	return requestedMs === null ? null : from + requestedMs;
};
