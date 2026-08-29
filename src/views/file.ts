import type { FileRecord } from '../services/files.js';
import type { FileCategory } from '../services/filetype.js';
import { getSettings } from '../services/settings.js';
import { escapeHtml, formatBytes, formatDate } from '../utils/format.js';
import { layout } from './layout.js';

export interface FilePageData {
	file: FileRecord;
	baseUrl: string;
	category: FileCategory;
	textPreview?: string | null;
}

const previewBlock = (data: FilePageData): string => {
	const settings = getSettings();
	if (!settings.enablePreviews) return fileIcon(data.category);
	const raw = `/raw/${encodeURIComponent(data.file.shortCode)}`;

	switch (data.category) {
		case 'image':
			return `<div class="preview preview-image"><img src="${raw}" alt="${escapeHtml(data.file.name)}" loading="lazy" /></div>`;
		case 'video':
			return `<div class="preview preview-video"><video controls preload="metadata" playsinline><source src="${raw}" type="${escapeHtml(data.file.mimeType ?? '')}" />Your browser cannot play this video.</video></div>`;
		case 'audio':
			return `<div class="preview preview-audio"><audio controls preload="metadata"><source src="${raw}" type="${escapeHtml(data.file.mimeType ?? '')}" />Your browser cannot play this audio.</audio></div>`;
		case 'pdf':
			return `<div class="preview preview-pdf"><object data="${raw}#toolbar=0" type="application/pdf"><p class="muted">PDF preview unavailable. <a href="${raw}">Open the file</a>.</p></object></div>`;
		case 'text':
			return data.textPreview
				? `<div class="preview preview-text"><pre>${escapeHtml(data.textPreview)}</pre></div>`
				: fileIcon(data.category);
		default:
			return fileIcon(data.category);
	}
};

const fileIcon = (_category: FileCategory): string =>
	`<div class="preview preview-generic"><svg viewBox="0 0 24 24" width="64" height="64" fill="none" aria-hidden="true"><path d="M6 2h8l4 4v16a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0V2Z" stroke="currentColor" stroke-width="1.4"/><path d="M14 2v4h4" stroke="currentColor" stroke-width="1.4"/></svg></div>`;

export const renderFilePage = (data: FilePageData): string => {
	const { file, baseUrl } = data;
	const settings = getSettings();
	const pageUrl = `${baseUrl}/${file.shortCode}`;
	const directUrl = `${baseUrl}/raw/${file.shortCode}`;
	const download = `/download/${encodeURIComponent(file.shortCode)}`;

	const meta = [
		['Type', escapeHtml(file.mimeType || 'Unknown')],
		['Size', escapeHtml(formatBytes(file.size))],
		['Uploaded', escapeHtml(formatDate(file.createdAt))],
		['Expires', file.expiresAt ? escapeHtml(formatDate(file.expiresAt)) : 'Never'],
		...(settings.enableDownloadCounters ? [['Downloads', String(file.downloadCount)]] : [])
	]
		.map(([label, value]) => `<div class="meta-row"><span>${label}</span><strong>${value}</strong></div>`)
		.join('');

	const directButton = settings.enableDirectLinks
		? `<button type="button" class="btn btn-ghost" data-copy-path="/raw/${encodeURIComponent(file.shortCode)}">Copy direct link</button>`
		: '';

	const body = `
		<section class="file-card">
			${previewBlock(data)}
			<div class="file-info">
				<h1 class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</h1>
				<div class="file-meta">${meta}</div>
				<div class="file-actions">
					<a class="btn btn-primary" href="${download}">Download</a>
					<button type="button" class="btn btn-ghost" data-copy-path="/${encodeURIComponent(file.shortCode)}">Copy link</button>
					${directButton}
					<button type="button" class="btn btn-ghost" data-share-path="/${encodeURIComponent(file.shortCode)}" data-share-title="${escapeHtml(file.name)}">Share</button>
				</div>
				<a class="report-link" href="/report/${encodeURIComponent(file.shortCode)}">Report this file</a>
			</div>
		</section>`;

	return layout({
		title: file.name,
		description: `${file.name} · ${formatBytes(file.size)}`,
		extraHead: `<link rel="canonical" href="${escapeHtml(pageUrl)}" /><meta property="og:url" content="${escapeHtml(pageUrl)}" />${data.category === 'image' ? `<meta property="og:image" content="${escapeHtml(directUrl)}" />` : ''}`,
		body,
		bodyClass: 'page-file',
		extraScripts: '<script src="/assets/js/file.js" defer></script>'
	});
};
