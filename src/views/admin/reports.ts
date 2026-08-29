import type { Report } from '../../services/reports.js';
import { escapeHtml, formatDate } from '../../utils/format.js';
import { adminShell } from './shell.js';

const REASON_LABELS: Record<string, string> = {
	copyright: 'Copyright',
	malware: 'Malware',
	illegal: 'Illegal content',
	privacy: 'Privacy',
	other: 'Other'
};

export const renderAdminReports = (params: {
	reports: Report[];
	username: string;
	openReports: number;
}): string => {
	const rows = params.reports.length
		? params.reports
				.map(
					report => `<tr>
				<td><a href="/${escapeHtml(report.shortCode)}" target="_blank" rel="noopener"><code>${escapeHtml(report.shortCode)}</code></a></td>
				<td>${escapeHtml(REASON_LABELS[report.reason] ?? report.reason)}</td>
				<td class="muted cell-details">${escapeHtml(report.details || '—')}</td>
				<td class="muted">${escapeHtml(formatDate(report.createdAt))}</td>
				<td><span class="badge badge-${escapeHtml(report.status)}">${escapeHtml(report.status)}</span></td>
				<td class="cell-actions">
					<details class="row-menu">
						<summary class="btn btn-small">Actions</summary>
						<div class="row-menu-panel">
							<form method="post" action="/admin/reports/${report.id}/action"><input type="hidden" name="op" value="dismiss" /><button class="menu-link" type="submit">Dismiss</button></form>
							<form method="post" action="/admin/reports/${report.id}/action"><input type="hidden" name="op" value="disableFile" /><button class="menu-link" type="submit">Disable file</button></form>
							<form method="post" action="/admin/reports/${report.id}/action" data-confirm="Delete the reported file permanently?"><input type="hidden" name="op" value="deleteFile" /><button class="menu-link danger" type="submit">Delete file</button></form>
						</div>
					</details>
				</td>
			</tr>`
				)
				.join('')
		: '<tr><td colspan="6" class="muted center">No reports</td></tr>';

	const body = `
		<div class="table-wrap">
			<table class="data-table">
				<thead><tr><th>Code</th><th>Reason</th><th>Details</th><th>Reported</th><th>Status</th><th></th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
		</div>`;

	return adminShell({ active: 'reports', title: 'Reports', body, username: params.username, openReports: params.openReports });
};
