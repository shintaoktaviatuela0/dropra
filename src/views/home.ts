import { EXPIRATION_OPTIONS } from '../services/expiration.js';
import { getSettings } from '../services/settings.js';
import { escapeHtml, formatBytes } from '../utils/format.js';
import { layout } from './layout.js';

export const renderHome = (): string => {
	const settings = getSettings();
	const anon = settings.allowAnonymousUploads;

	const expirationChoices = EXPIRATION_OPTIONS.filter(option => option.key !== 'never' || settings.allowNeverExpiration)
		.map(
			option =>
				`<option value="${option.key}"${option.key === settings.defaultExpiration ? ' selected' : ''}>${escapeHtml(option.label)}</option>`
		)
		.join('');

	const clientConfig = {
		maxFileSize: settings.maxFileSize,
		maxFilesPerUpload: settings.maxFilesPerUpload,
		chunkSize: 90 * 1024 * 1024,
		allowAnonymous: anon
	};

	const dropzone = anon
		? `<form id="upload-form" class="uploader" autocomplete="off">
				<div id="dropzone" class="dropzone" tabindex="0" role="button" aria-label="Upload files">
					<input id="file-input" type="file" multiple hidden />
					<div class="dropzone-inner">
						<svg class="dropzone-icon" viewBox="0 0 24 24" width="46" height="46" fill="none" aria-hidden="true"><path d="M12 16V4m0 0 4 4m-4-4L8 8" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round"/></svg>
						<p class="dropzone-title">Drop files here</p>
						<p class="dropzone-sub">or <span class="link-like">click to browse</span> · paste from clipboard</p>
					</div>
				</div>

				<details class="upload-options">
					<summary>Upload options</summary>
					<div class="options-grid">
						<label>Expires
							<select name="expiration">${expirationChoices}</select>
						</label>
						<label>Password <span class="muted">(optional)</span>
							<input type="password" name="password" placeholder="Protect with a password" autocomplete="new-password" />
						</label>
						<label>Download limit <span class="muted">(optional)</span>
							<input type="number" name="maxDownloads" min="1" placeholder="Unlimited" />
						</label>
					</div>
				</details>

				<ul id="upload-list" class="upload-list" aria-live="polite"></ul>
			</form>`
		: `<div class="uploader">
				<div class="dropzone dropzone-disabled">
					<div class="dropzone-inner">
						<p class="dropzone-title">Uploads are currently disabled</p>
						<p class="dropzone-sub">The administrator has turned off public uploads.</p>
					</div>
				</div>
			</div>`;

	const body = `
		<section class="hero">
			<h1 class="hero-title">Share files in seconds.</h1>
			<p class="hero-sub">Drop a file, get a link, share it. No account required.</p>
		</section>
		${dropzone}
		<p class="privacy-note">Max file size ${escapeHtml(formatBytes(settings.maxFileSize))}. Files may expire automatically. Do not upload illegal content.</p>
		<template id="upload-item-template">
			<li class="upload-item">
				<div class="upload-item-head">
					<span class="upload-name"></span>
					<span class="upload-status"></span>
				</div>
				<div class="progress"><div class="progress-bar"></div></div>
				<div class="upload-result" hidden>
					<input class="result-link" type="text" readonly />
					<button type="button" class="btn btn-small copy-link">Copy</button>
				</div>
			</li>
		</template>
		<script>window.DROPRA = ${JSON.stringify(clientConfig)};</script>`;

	return layout({
		body,
		bodyClass: 'page-home',
		extraScripts: '<script src="/assets/js/upload.js" defer></script>'
	});
};
