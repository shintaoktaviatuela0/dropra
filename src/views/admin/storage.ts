import type { RecentFile } from '../../services/stats.js';
import { escapeHtml, formatBytes } from '../../utils/format.js';
import { adminShell } from './shell.js';

export interface StorageStats {
	totalStorage: number;
	fileCount: number;
	dbSize: number;
	thumbSize: number;
	tempSize: number;
}

export const renderAdminStorage = (params: {
	stats: StorageStats;
	largest: RecentFile[];
	username: string;
	openReports: number;
	message?: string;
}): string => {
	const { stats, largest } = params;

	const largestRows = largest.length
		? largest
				.map(
					file =>
						`<tr><td><a href="/${escapeHtml(file.shortCode)}" target="_blank" rel="noopener">${escapeHtml(file.name)}</a></td><td>${escapeHtml(formatBytes(file.size))}</td><td>${file.downloadCount}</td></tr>`
				)
				.join('')
		: '<tr><td colspan="3" class="muted center">No files</td></tr>';

	const body = `
		${params.message ? `<div class="notice">${escapeHtml(params.message)}</div>` : ''}
		<div class="stat-grid">
			<div class="stat-card"><span class="stat-label">Used by uploads</span><span class="stat-value">${escapeHtml(formatBytes(stats.totalStorage))}</span></div>
			<div class="stat-card"><span class="stat-label">Files</span><span class="stat-value">${stats.fileCount}</span></div>
			<div class="stat-card"><span class="stat-label">Database</span><span class="stat-value">${escapeHtml(formatBytes(stats.dbSize))}</span></div>
			<div class="stat-card"><span class="stat-label">Thumbnails</span><span class="stat-value">${escapeHtml(formatBytes(stats.thumbSize))}</span></div>
			<div class="stat-card"><span class="stat-label">Temp uploads</span><span class="stat-value">${escapeHtml(formatBytes(stats.tempSize))}</span></div>
		</div>

		<div class="panel">
			<h2>Maintenance</h2>
			<div class="button-row">
				<form method="post" action="/admin/storage/clear-temp"><button type="submit" class="btn btn-small">Clear orphaned temp chunks</button></form>
				<form method="post" action="/admin/storage/clear-thumbs"><button type="submit" class="btn btn-small">Clear thumbnail cache</button></form>
				<form method="post" action="/admin/storage/scan"><button type="submit" class="btn btn-small">Run consistency scan</button></form>
			</div>
			<p class="muted">The consistency scan reports database rows whose stored file is missing on disk. It never deletes uploads automatically.</p>
		</div>

		<div class="panel">
			<h2>Largest files</h2>
			<div class="table-wrap"><table class="data-table"><thead><tr><th>Filename</th><th>Size</th><th>Downloads</th></tr></thead><tbody>${largestRows}</tbody></table></div>
		</div>`;

	return adminShell({ active: 'storage', title: 'Storage', body, username: params.username, openReports: params.openReports });
};
