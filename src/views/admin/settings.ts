import type { DopraSettings } from '../../services/settings.js';
import { EXPIRATION_OPTIONS } from '../../services/expiration.js';
import { escapeHtml } from '../../utils/format.js';
import { adminShell } from './shell.js';

const text = (name: string, label: string, value: string, placeholder = ''): string =>
	`<label>${escapeHtml(label)}<input type="text" name="${name}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" /></label>`;

const number = (name: string, label: string, value: number, hint = ''): string =>
	`<label>${escapeHtml(label)}<input type="number" name="${name}" value="${value}" min="0" />${hint ? `<span class="hint">${escapeHtml(hint)}</span>` : ''}</label>`;

const checkbox = (name: string, label: string, checked: boolean): string =>
	`<label class="check"><input type="checkbox" name="${name}" value="true"${checked ? ' checked' : ''} /> ${escapeHtml(label)}</label>`;

const select = (name: string, label: string, value: string, options: [string, string][]): string =>
	`<label>${escapeHtml(label)}<select name="${name}">${options.map(([val, text2]) => `<option value="${escapeHtml(val)}"${val === value ? ' selected' : ''}>${escapeHtml(text2)}</option>`).join('')}</select></label>`;

const list = (name: string, label: string, values: string[], placeholder = ''): string =>
	`<label>${escapeHtml(label)}<input type="text" name="${name}" value="${escapeHtml(values.join(', '))}" placeholder="${escapeHtml(placeholder)}" /><span class="hint">Comma-separated</span></label>`;

const expirationOptions: [string, string][] = EXPIRATION_OPTIONS.map(option => [option.key, option.label]);

export const renderAdminSettings = (settings: DopraSettings, username: string, openReports: number, saved?: boolean): string => {
	const body = `
		${saved ? '<div class="notice">Settings saved.</div>' : ''}
		<form method="post" action="/admin/settings" class="settings-form">
			<section class="panel">
				<h2>General</h2>
				<div class="field-grid">
					${text('siteName', 'Site name', settings.siteName)}
					${text('publicBaseUrl', 'Public base URL', settings.publicBaseUrl, 'https://file.example.com')}
					${text('siteDescription', 'Site description', settings.siteDescription)}
					${text('contactUrl', 'Contact URL', settings.contactUrl)}
					${text('termsUrl', 'Terms URL', settings.termsUrl)}
					${text('privacyUrl', 'Privacy URL', settings.privacyUrl)}
				</div>
			</section>

			<section class="panel">
				<h2>Uploads</h2>
				<div class="field-grid">
					${checkbox('allowAnonymousUploads', 'Allow public (anonymous) uploads', settings.allowAnonymousUploads)}
					${number('maxFileSizeMb', 'Max file size (MB)', Math.round(settings.maxFileSize / (1024 * 1024)))}
					${number('maxFilesPerUpload', 'Max files per upload', settings.maxFilesPerUpload)}
					${select('defaultExpiration', 'Default expiration', settings.defaultExpiration, expirationOptions)}
					${select('maxExpiration', 'Maximum expiration', settings.maxExpiration, expirationOptions)}
					${checkbox('allowNeverExpiration', 'Allow "never" expiration', settings.allowNeverExpiration)}
					${list('allowedExtensions', 'Allowed extensions', settings.allowedExtensions, '.png, .jpg (empty = all)')}
					${list('blockedExtensions', 'Blocked extensions', settings.blockedExtensions, '.exe, .sh')}
					${list('allowedMimeTypes', 'Allowed MIME types', settings.allowedMimeTypes, 'empty = all')}
					${list('blockedMimeTypes', 'Blocked MIME types', settings.blockedMimeTypes)}
				</div>
			</section>

			<section class="panel">
				<h2>Downloads</h2>
				<div class="field-grid">
					${checkbox('enablePreviews', 'Enable file previews', settings.enablePreviews)}
					${checkbox('enableDirectLinks', 'Enable direct links', settings.enableDirectLinks)}
					${checkbox('enableDownloadCounters', 'Enable download counters', settings.enableDownloadCounters)}
				</div>
			</section>

			<section class="panel">
				<h2>Appearance</h2>
				<div class="field-grid">
					${select('theme', 'Default theme', settings.theme, [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])}
					<label>Accent color<input type="color" name="accentColor" value="${escapeHtml(settings.accentColor)}" /></label>
					${text('logoUrl', 'Logo URL', settings.logoUrl)}
					${text('faviconUrl', 'Favicon URL', settings.faviconUrl)}
				</div>
			</section>

			<div class="form-actions"><button type="submit" class="btn btn-primary">Save settings</button></div>
		</form>`;

	return adminShell({ active: 'settings', title: 'Settings', body, username, openReports });
};
