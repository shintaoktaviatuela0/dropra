export type FileCategory = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'archive' | 'other';

const EXTENSION_MIME: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.bmp': 'image/bmp',
	'.ico': 'image/x-icon',
	'.svg': 'image/svg+xml',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.mov': 'video/quicktime',
	'.mkv': 'video/x-matroska',
	'.avi': 'video/x-msvideo',
	'.mp3': 'audio/mpeg',
	'.wav': 'audio/wav',
	'.ogg': 'audio/ogg',
	'.flac': 'audio/flac',
	'.m4a': 'audio/mp4',
	'.pdf': 'application/pdf',
	'.txt': 'text/plain',
	'.md': 'text/markdown',
	'.json': 'application/json',
	'.csv': 'text/csv',
	'.log': 'text/plain',
	'.zip': 'application/zip',
	'.gz': 'application/gzip',
	'.tar': 'application/x-tar',
	'.rar': 'application/vnd.rar',
	'.7z': 'application/x-7z-compressed',
	'.html': 'text/html',
	'.htm': 'text/html'
};

/** Best-effort content sniffing from the first bytes (magic numbers). */
export const sniffMimeType = (buffer: Buffer): string | null => {
	const b = buffer;
	const startsWith = (...bytes: number[]) => bytes.every((byte, index) => b[index] === byte);
	const ascii = (offset: number, text: string) =>
		[...text].every((char, index) => b[offset + index] === char.charCodeAt(0));

	if (startsWith(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
	if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
	if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
	if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
	if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return 'audio/wav';
	if (startsWith(0x25, 0x50, 0x44, 0x46)) return 'application/pdf';
	if (ascii(4, 'ftyp')) return 'video/mp4';
	if (startsWith(0x1a, 0x45, 0xdf, 0xa3)) return 'video/webm';
	if (ascii(0, 'ID3') || startsWith(0xff, 0xfb)) return 'audio/mpeg';
	if (ascii(0, 'OggS')) return 'audio/ogg';
	if (ascii(0, 'fLaC')) return 'audio/flac';
	if (startsWith(0x1f, 0x8b)) return 'application/gzip';
	if (startsWith(0x50, 0x4b, 0x03, 0x04)) return 'application/zip';
	if (ascii(0, 'Rar!')) return 'application/vnd.rar';
	if (startsWith(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return 'application/x-7z-compressed';
	return null;
};

export const mimeFromExtension = (extension: string): string =>
	EXTENSION_MIME[extension.toLowerCase()] ?? 'application/octet-stream';

/** Classify a file for preview/UI purposes. SVG/HTML are deliberately "other". */
export const categorize = (mimeType: string | null, extension: string): FileCategory => {
	const mime = (mimeType ?? '').toLowerCase();
	const ext = extension.toLowerCase();

	// Never treat active-content formats as previewable inline.
	if (mime === 'image/svg+xml' || mime === 'text/html' || ext === '.svg' || ext === '.html' || ext === '.htm') {
		return 'other';
	}

	if (mime.startsWith('image/')) return 'image';
	if (mime.startsWith('video/')) return 'video';
	if (mime.startsWith('audio/')) return 'audio';
	if (mime === 'application/pdf') return 'pdf';
	if (mime.startsWith('text/') || mime === 'application/json') return 'text';
	if (['application/zip', 'application/gzip', 'application/x-tar', 'application/vnd.rar', 'application/x-7z-compressed'].includes(mime)) {
		return 'archive';
	}

	return 'other';
};

/** Formats whose active content must never render in our origin. */
export const isActiveContent = (mimeType: string | null, extension: string): boolean => {
	const mime = (mimeType ?? '').toLowerCase();
	const ext = extension.toLowerCase();
	return (
		mime === 'image/svg+xml' ||
		mime === 'text/html' ||
		mime === 'application/xhtml+xml' ||
		['.svg', '.html', '.htm', '.xhtml', '.js', '.mjs'].includes(ext)
	);
};
