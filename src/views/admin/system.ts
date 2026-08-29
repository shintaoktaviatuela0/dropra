import { escapeHtml, formatBytes } from '../../utils/format.js';
import { adminShell } from './shell.js';

export interface SystemInfo {
	version: string;
	nodeVersion: string;
	platform: string;
	uptimeSeconds: number;
	dataDir: string;
	databaseFile: string;
	storageWritable: boolean;
	totalFiles: number;
	totalStorage: number;
	memoryRss: number;
}

const humanUptime = (seconds: number): string => {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${days}d ${hours}h ${minutes}m`;
};

export const renderAdminSystem = (info: SystemInfo, username: string, openReports: number): string => {
	const rows: [string, string][] = [
		['Version', info.version],
		['Node.js', info.nodeVersion],
		['Platform', info.platform],
		['Uptime', humanUptime(info.uptimeSeconds)],
		['Memory (RSS)', formatBytes(info.memoryRss)],
		['Data directory', info.dataDir],
		['Database file', info.databaseFile],
		['Storage writable', info.storageWritable ? 'Yes' : 'No'],
		['Total files', String(info.totalFiles)],
		['Total storage', formatBytes(info.totalStorage)]
	];

	const body = `
		<div class="panel">
			<h2>System information</h2>
			<table class="data-table info-table">
				<tbody>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td><code>${escapeHtml(value)}</code></td></tr>`).join('')}</tbody>
			</table>
		</div>
		<div class="panel">
			<h2>Maintenance</h2>
			<form method="post" action="/admin/system/cleanup"><button type="submit" class="btn btn-small">Run cleanup now</button></form>
			<p class="muted">Runs expired-file deletion, session pruning and temp cleanup immediately.</p>
		</div>`;

	return adminShell({ active: 'system', title: 'System', body, username, openReports });
};
