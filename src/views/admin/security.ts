import type { DopraSettings } from '../../services/settings.js';
import { escapeHtml, formatDate } from '../../utils/format.js';
import { adminShell } from './shell.js';

const number = (name: string, label: string, value: number): string =>
	`<label>${escapeHtml(label)}<input type="number" name="${name}" value="${value}" min="0" /></label>`;

export const renderAdminSecurity = (params: {
	settings: DopraSettings;
	bannedIps: { ip: string; reason: string | null; createdAt: number }[];
	username: string;
	openReports: number;
	saved?: boolean;
}): string => {
	const { settings, bannedIps } = params;

	const bannedRows = bannedIps.length
		? bannedIps
				.map(
					entry => `<tr>
						<td><code>${escapeHtml(entry.ip)}</code></td>
						<td class="muted">${escapeHtml(entry.reason || '—')}</td>
						<td class="muted">${escapeHtml(formatDate(entry.createdAt))}</td>
						<td><form method="post" action="/admin/security/unban"><input type="hidden" name="ip" value="${escapeHtml(entry.ip)}" /><button class="btn btn-small" type="submit">Remove</button></form></td>
					</tr>`
				)
				.join('')
		: '<tr><td colspan="4" class="muted center">No blocked addresses</td></tr>';

	const body = `
		${params.saved ? '<div class="notice">Security settings saved. Rate-limit changes take effect after a restart.</div>' : ''}
		<form method="post" action="/admin/security" class="settings-form">
			<section class="panel">
				<h2>Rate limits</h2>
				<p class="muted">Windows are in milliseconds; max is the number of requests allowed per window.</p>
				<div class="field-grid">
					${number('anonUploadRateWindow', 'Upload window (ms)', settings.anonUploadRateWindow)}
					${number('anonUploadRateMax', 'Upload max / window', settings.anonUploadRateMax)}
					${number('downloadRateWindow', 'Download window (ms)', settings.downloadRateWindow)}
					${number('downloadRateMax', 'Download max / window', settings.downloadRateMax)}
					${number('loginRateWindow', 'Login window (ms)', settings.loginRateWindow)}
					${number('loginRateMax', 'Login max / window', settings.loginRateMax)}
					${number('reportRateWindow', 'Report window (ms)', settings.reportRateWindow)}
					${number('reportRateMax', 'Report max / window', settings.reportRateMax)}
				</div>
				<div class="form-actions"><button type="submit" class="btn btn-primary">Save</button></div>
			</section>
		</form>

		<section class="panel">
			<h2>Blocked IP addresses</h2>
			<form method="post" action="/admin/security/ban" class="inline-form">
				<input type="text" name="ip" placeholder="203.0.113.10" required />
				<input type="text" name="reason" placeholder="Reason (optional)" />
				<button type="submit" class="btn btn-small">Block</button>
			</form>
			<div class="table-wrap"><table class="data-table"><thead><tr><th>IP</th><th>Reason</th><th>Added</th><th></th></tr></thead><tbody>${bannedRows}</tbody></table></div>
		</section>

		<section class="panel">
			<h2>Content restrictions</h2>
			<p class="muted">Blocked extensions and MIME types are configured on the <a href="/admin/settings">Settings</a> page.</p>
			<p>Blocked extensions: <code>${escapeHtml(settings.blockedExtensions.join(', ') || 'none')}</code></p>
			<p>Blocked MIME types: <code>${escapeHtml(settings.blockedMimeTypes.join(', ') || 'none')}</code></p>
		</section>`;

	return adminShell({ active: 'security', title: 'Security', body, username: params.username, openReports: params.openReports });
};
