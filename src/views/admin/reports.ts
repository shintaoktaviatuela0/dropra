import type { ReportView } from '../../services/reports.js';
import { isReportEditable } from '../../services/reports.js';
import { escapeHtml, formatDate } from '../../utils/format.js';
import { adminShell } from './shell.js';

const REASON_LABELS: Record<string, string> = {
	copyright: 'Copyright',
	malware: 'Malware',
	illegal: 'Illegal content',
	privacy: 'Privacy',
	other: 'Other'
};

const STATUS_LABELS: Record<string, string> = {
	open: 'Open',
	dismissed: 'Dismissed',
	actioned: 'Actioned',
	file_removed: 'File removed'
};

const STATUS_FILTERS: [string, string][] = [
	['', 'All statuses'],
	['open', 'Open'],
	['dismissed', 'Dismissed'],
	['actioned', 'Actioned'],
	['file_removed', 'File removed']
];

const statusBadge = (status: string): string =>
	`<span class="badge badge-${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status] ?? status)}</span>`;

const targetCell = (report: ReportView): string => {
	if (!report.fileExists) {
		return `<span class="target-gone" title="The reported file no longer exists"><code>${escapeHtml(report.shortCode)}</code> <span class="tag tag-gone">deleted</span></span>`;
	}

	return `<a href="/${encodeURIComponent(report.shortCode)}" target="_blank" rel="noopener"><code>${escapeHtml(report.shortCode)}</code></a>${
		report.fileName
			? `<div class="cell-sub muted" title="${escapeHtml(report.fileName)}">${escapeHtml(report.fileName)}</div>`
			: ''
	}`;
};

const actionsCell = (report: ReportView): string => {
	const moderation = isReportEditable(report)
		? `<form method="post" action="/admin/reports/${report.id}/action"><input type="hidden" name="op" value="dismiss" /><button class="menu-link" type="submit">Dismiss report</button></form>
			<form method="post" action="/admin/reports/${report.id}/action"><input type="hidden" name="op" value="disableFile" /><button class="menu-link" type="submit">Quarantine file</button></form>
			<form method="post" action="/admin/reports/${report.id}/action" data-confirm="Delete the reported file permanently? The report becomes read-only."><input type="hidden" name="op" value="deleteFile" /><button class="menu-link danger" type="submit">Delete file</button></form>`
		: `<p class="menu-note">${report.fileExists ? 'Already resolved — no further moderation is possible.' : 'The reported file was deleted, so moderation is locked.'}</p>`;

	return `<details class="row-menu">
		<summary class="btn btn-small">Actions</summary>
		<div class="row-menu-panel">
			${moderation}
			<div class="menu-sep"></div>
			<form method="post" action="/admin/reports/${report.id}/action" data-confirm="Delete this report entry?"><input type="hidden" name="op" value="deleteReport" /><button class="menu-link danger" type="submit">Delete report</button></form>
		</div>
	</details>`;
};

export const renderAdminReports = (params: {
	reports: ReportView[];
	counts: Record<string, number>;
	status: string;
	username: string;
	openReports: number;
	retentionDays: number;
}): string => {
	const rows = params.reports.length
		? params.reports
				.map(
					report => `<tr class="${report.fileExists ? '' : 'row-locked'}">
				<td><input type="checkbox" name="ids" value="${report.id}" form="reports-bulk" /></td>
				<td class="cell-target">${targetCell(report)}</td>
				<td>${escapeHtml(REASON_LABELS[report.reason] ?? report.reason)}</td>
				<td class="muted cell-details" title="${escapeHtml(report.details || '')}">${escapeHtml(report.details || '—')}</td>
				<td class="muted">${escapeHtml(formatDate(report.createdAt))}</td>
				<td>${statusBadge(report.status)}${report.resolution ? `<div class="cell-sub muted">${escapeHtml(report.resolution)}</div>` : ''}</td>
				<td class="cell-actions">${actionsCell(report)}</td>
			</tr>`
				)
				.join('')
		: '<tr><td colspan="7" class="muted center">No reports match this filter.</td></tr>';

	const total = Object.values(params.counts).reduce((sum, count) => sum + count, 0);
	const resolved = total - (params.counts.open ?? 0);

	const body = `
		<div class="stat-grid">
			<div class="stat-card"><span class="stat-label">Open</span><span class="stat-value">${params.counts.open ?? 0}</span></div>
			<div class="stat-card"><span class="stat-label">Actioned</span><span class="stat-value">${params.counts.actioned ?? 0}</span></div>
			<div class="stat-card"><span class="stat-label">Dismissed</span><span class="stat-value">${params.counts.dismissed ?? 0}</span></div>
			<div class="stat-card"><span class="stat-label">File removed</span><span class="stat-value">${params.counts.file_removed ?? 0}</span></div>
		</div>

		<form method="get" action="/admin/reports" class="filters">
			<select name="status">${STATUS_FILTERS.map(([value, label]) => `<option value="${value}"${value === params.status ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
			<button type="submit" class="btn btn-small">Filter</button>
		</form>

		<form id="reports-bulk" method="post" action="/admin/reports/bulk" data-confirm="Apply this action to the selected reports?" class="bulk-bar">
			<select name="op">
				<option value="delete">Delete selected</option>
				<option value="dismiss">Dismiss selected</option>
			</select>
			<button type="submit" class="btn btn-small">Apply</button>
			<span class="muted">${total} report(s) · ${resolved} resolved</span>
		</form>

		<div class="table-wrap">
			<table class="data-table">
				<thead><tr><th></th><th>Target</th><th>Reason</th><th>Details</th><th>Reported</th><th>Status</th><th class="col-actions">Actions</th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
		</div>

		<section class="panel">
			<h2>Report cleanup</h2>
			<p class="muted">Retention is currently ${params.retentionDays > 0 ? `${params.retentionDays} day(s)` : 'disabled'}. Change it under <a href="/admin/settings">Settings → Reports</a>.</p>
			<div class="button-row">
				<form method="post" action="/admin/reports/purge" data-confirm="Delete every dismissed report?"><input type="hidden" name="op" value="dismissed" /><button class="btn btn-small" type="submit">Delete dismissed</button></form>
				<form method="post" action="/admin/reports/purge" data-confirm="Delete every report whose file was removed?"><input type="hidden" name="op" value="file_removed" /><button class="btn btn-small" type="submit">Delete orphaned</button></form>
				<form method="post" action="/admin/reports/purge" data-confirm="Delete every resolved report (dismissed, actioned and orphaned)?"><input type="hidden" name="op" value="resolved" /><button class="btn btn-small" type="submit">Delete all resolved</button></form>
				<form method="post" action="/admin/reports/purge" data-confirm="Delete ALL reports, including open ones? This cannot be undone."><input type="hidden" name="op" value="all" /><button class="btn btn-small btn-danger" type="submit">Delete all reports</button></form>
			</div>
		</section>`;

	return adminShell({ active: 'reports', title: 'Reports', body, username: params.username, openReports: params.openReports });
};
