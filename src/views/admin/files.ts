import type { FileRecord, ListFilesOptions } from '../../services/files.js';
import { EXPIRATION_OPTIONS } from '../../services/expiration.js';
import { escapeHtml, formatBytes, formatDate } from '../../utils/format.js';
import { adminShell } from './shell.js';

const STATUS_OPTIONS = ['', 'active', 'disabled', 'expired', 'quarantined'];
const CATEGORY_OPTIONS = ['', 'image', 'video', 'audio', 'pdf', 'archive'];

const statusBadge = (status: string): string =>
	`<span class="badge badge-${escapeHtml(status)}">${escapeHtml(status)}</span>`;

const buildQuery = (filters: ListFilesOptions, overrides: Record<string, string | number>): string => {
	const params = new URLSearchParams();
	const merged: Record<string, unknown> = { ...filters, ...overrides };
	for (const [key, value] of Object.entries(merged)) {
		if (value !== undefined && value !== '' && value !== null) params.set(key, String(value));
	}

	return params.toString();
};

const selectOptions = (values: string[], selected: string | undefined, labels?: Record<string, string>): string =>
	values
		.map(
			value =>
				`<option value="${escapeHtml(value)}"${value === (selected ?? '') ? ' selected' : ''}>${escapeHtml(labels?.[value] ?? (value || 'All'))}</option>`
		)
		.join('');

export const renderAdminFiles = (params: {
	result: { rows: FileRecord[]; total: number };
	filters: ListFilesOptions;
	page: number;
	pageSize: number;
	username: string;
	openReports: number;
}): string => {
	const { result, filters, page, pageSize } = params;
	const totalPages = Math.max(1, Math.ceil(result.total / pageSize));

	const rows = result.rows.length
		? result.rows
				.map(
					(file: FileRecord) => `
			<tr>
				<td><input type="checkbox" name="ids" value="${file.id}" form="bulk-form" /></td>
				<td class="cell-name"><a href="/${escapeHtml(file.shortCode)}" target="_blank" rel="noopener" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</a></td>
				<td><code>${escapeHtml(file.shortCode)}</code></td>
				<td>${escapeHtml(formatBytes(file.size))}</td>
				<td class="muted">${escapeHtml(file.mimeType || '—')}</td>
				<td class="muted">${escapeHtml(formatDate(file.createdAt))}</td>
				<td>${file.downloadCount}</td>
				<td class="muted">${file.expiresAt ? escapeHtml(formatDate(file.expiresAt)) : 'Never'}</td>
				<td>${statusBadge(file.status)}</td>
				<td class="cell-actions">
					<details class="row-menu">
						<summary class="btn btn-small">Actions</summary>
						<div class="row-menu-panel">
							<a class="menu-link" href="/${escapeHtml(file.shortCode)}" target="_blank" rel="noopener">Open</a>
							<button type="button" class="menu-link" data-copy-code="${escapeHtml(file.shortCode)}">Copy link</button>
							<form method="post" action="/admin/files/${file.id}/action">
								<input type="hidden" name="op" value="${file.status === 'disabled' ? 'enable' : 'disable'}" />
								<button type="submit" class="menu-link">${file.status === 'disabled' ? 'Enable' : 'Disable'}</button>
							</form>
							<form method="post" action="/admin/files/${file.id}/action">
								<input type="hidden" name="op" value="resetDownloads" />
								<button type="submit" class="menu-link">Reset downloads</button>
							</form>
							<form method="post" action="/admin/files/${file.id}/action" class="menu-inline">
								<input type="hidden" name="op" value="rename" />
								<input type="text" name="name" value="${escapeHtml(file.name)}" />
								<button type="submit" class="menu-link">Rename</button>
							</form>
							<form method="post" action="/admin/files/${file.id}/action" class="menu-inline">
								<input type="hidden" name="op" value="expiration" />
								<select name="expiration">${EXPIRATION_OPTIONS.map(option => `<option value="${option.key}">${escapeHtml(option.label)}</option>`).join('')}</select>
								<button type="submit" class="menu-link">Set expiry</button>
							</form>
							<form method="post" action="/admin/files/${file.id}/action" data-confirm="Delete this file permanently?">
								<input type="hidden" name="op" value="delete" />
								<button type="submit" class="menu-link danger">Delete</button>
							</form>
						</div>
					</details>
				</td>
			</tr>`
				)
				.join('')
		: '<tr><td colspan="10" class="muted center">No files match your filters.</td></tr>';

	const body = `
		<form method="get" action="/admin/files" class="filters">
			<input type="search" name="search" value="${escapeHtml(filters.search ?? '')}" placeholder="Search name or code" />
			<select name="status">${selectOptions(STATUS_OPTIONS, filters.status)}</select>
			<select name="category">${selectOptions(CATEGORY_OPTIONS, filters.category)}</select>
			<select name="expiration">${selectOptions(['', 'never', 'expiring', 'expired'], filters.expiration, { '': 'Any expiry', never: 'Never', expiring: 'Expiring', expired: 'Expired' })}</select>
			<select name="sort">${selectOptions(['createdAt', 'size', 'downloadCount', 'name'], filters.sort, { createdAt: 'Newest', size: 'Size', downloadCount: 'Downloads', name: 'Name' })}</select>
			<button type="submit" class="btn btn-small">Filter</button>
		</form>

		<form id="bulk-form" method="post" action="/admin/files/bulk" data-confirm="Apply this action to the selected files?" class="bulk-bar">
			<select name="op">
				<option value="disable">Disable selected</option>
				<option value="enable">Enable selected</option>
				<option value="delete">Delete selected</option>
			</select>
			<button type="submit" class="btn btn-small">Apply</button>
			<span class="muted">${result.total} file(s)</span>
		</form>

		<div class="table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th></th><th>Filename</th><th>Code</th><th>Size</th><th>Type</th><th>Uploaded</th><th>DL</th><th>Expiry</th><th>Status</th><th></th>
					</tr>
				</thead>
				<tbody>${rows}</tbody>
			</table>
		</div>

		<div class="pagination">
			${page > 1 ? `<a class="btn btn-small" href="/admin/files?${buildQuery(filters, { page: page - 1 })}">Previous</a>` : '<span></span>'}
			<span class="muted">Page ${page} of ${totalPages}</span>
			${page < totalPages ? `<a class="btn btn-small" href="/admin/files?${buildQuery(filters, { page: page + 1 })}">Next</a>` : '<span></span>'}
		</div>`;

	return adminShell({ active: 'files', title: 'Files', body, username: params.username, openReports: params.openReports });
};
