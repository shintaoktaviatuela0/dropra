import type { DashboardStats, RecentFile } from '../../services/stats.js';
import { escapeHtml, formatBytes } from '../../utils/format.js';
import { adminShell } from './shell.js';

const card = (label: string, value: string, sub?: string): string =>
	`<div class="stat-card"><span class="stat-label">${escapeHtml(label)}</span><span class="stat-value">${escapeHtml(value)}</span>${sub ? `<span class="stat-sub">${escapeHtml(sub)}</span>` : ''}</div>`;

const barChart = (series: { day: string; uploads: number; downloads: number }[]): string => {
	const max = Math.max(1, ...series.map(entry => Math.max(entry.uploads, entry.downloads)));
	const bars = series
		.map(entry => {
			const up = Math.round((entry.uploads / max) * 100);
			const down = Math.round((entry.downloads / max) * 100);
			return `<div class="chart-col" title="${escapeHtml(entry.day)} · ${entry.uploads} up / ${entry.downloads} down">
				<div class="chart-bars">
					<span class="chart-bar up" style="height:${up}%"></span>
					<span class="chart-bar down" style="height:${down}%"></span>
				</div>
				<span class="chart-x">${escapeHtml(entry.day.slice(5))}</span>
			</div>`;
		})
		.join('');
	return `<div class="chart"><div class="chart-legend"><span class="dot up"></span>Uploads <span class="dot down"></span>Downloads</div><div class="chart-cols">${bars}</div></div>`;
};

const fileList = (title: string, files: RecentFile[]): string => {
	const rows = files.length
		? files
				.map(
					file =>
						`<li><a href="/${escapeHtml(file.shortCode)}" target="_blank" rel="noopener">${escapeHtml(file.name)}</a><span class="muted">${escapeHtml(formatBytes(file.size))} · ${file.downloadCount} dl</span></li>`
				)
				.join('')
		: '<li class="muted">No files yet</li>';
	return `<div class="panel"><h2>${escapeHtml(title)}</h2><ul class="mini-list">${rows}</ul></div>`;
};

export const renderAdminDashboard = (stats: DashboardStats, username: string, openReports: number): string => {
	const body = `
		<div class="stat-grid">
			${card('Total files', String(stats.totalFiles))}
			${card('Storage used', formatBytes(stats.totalStorage))}
			${card('Total downloads', String(stats.totalDownloads))}
			${card('Uploads today', String(stats.uploadsToday))}
		</div>
		<div class="panel">
			<h2>Last 14 days</h2>
			${barChart(stats.series)}
			<div class="chart-summary">
				<span>Uploads (24h): <strong>${stats.uploads24h}</strong></span>
				<span>Downloads (24h): <strong>${stats.downloads24h}</strong></span>
			</div>
		</div>
		<div class="panel-grid">
			${fileList('Recently uploaded', stats.recent)}
			${fileList('Largest files', stats.largest)}
			${fileList('Most downloaded', stats.mostDownloaded)}
		</div>`;
	return adminShell({ active: 'dashboard', title: 'Dashboard', body, username, openReports });
};
