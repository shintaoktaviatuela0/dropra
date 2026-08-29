/** Escape a string for safe interpolation into HTML text/attributes. */
export const escapeHtml = (value: unknown): string => {
	if (value === null || value === undefined) return '';
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
};

/** Human-readable byte size, e.g. 1536 -> "1.5 KB". */
export const formatBytes = (bytes: number | string): string => {
	const value = typeof bytes === 'string' ? Number(bytes) : bytes;
	if (!Number.isFinite(value) || value <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
	const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
	const size = value / 1024 ** exponent;
	return `${size.toFixed(exponent === 0 ? 0 : size >= 100 ? 0 : 1)} ${units[exponent]}`;
};

/** ISO timestamp -> readable UTC date. */
export const formatDate = (value: string | number | Date | null | undefined): string => {
	if (!value) return '—';
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return '—';
	return date.toLocaleString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'UTC',
		hour12: false
	});
};

/** Current unix epoch in milliseconds. */
export const now = (): number => Date.now();
