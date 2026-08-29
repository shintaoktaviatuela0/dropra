import { REPORT_REASONS } from '../services/reports.js';
import { escapeHtml } from '../utils/format.js';
import { layout } from './layout.js';

const REASON_LABELS: Record<string, string> = {
	copyright: 'Copyright infringement',
	malware: 'Malware or virus',
	illegal: 'Illegal content',
	privacy: 'Privacy violation',
	other: 'Other'
};

export const renderReportPage = (shortCode: string, options: { error?: string; success?: boolean } = {}): string => {
	if (options.success) {
		const body = `
			<section class="centered-card">
				<h1>Report received</h1>
				<p class="muted">Thank you. Our moderators will review this file.</p>
				<a class="btn btn-ghost" href="/${encodeURIComponent(shortCode)}">Back to file</a>
			</section>`;
		return layout({ title: 'Report received', body, bodyClass: 'page-centered' });
	}

	const reasonOptions = REPORT_REASONS.map(
		reason => `<option value="${reason}">${escapeHtml(REASON_LABELS[reason] ?? reason)}</option>`
	).join('');

	const body = `
		<section class="centered-card">
			<h1>Report a file</h1>
			<p class="muted">Reporting <code>${escapeHtml(shortCode)}</code></p>
			${options.error ? `<p class="form-error">${escapeHtml(options.error)}</p>` : ''}
			<form method="post" action="/report/${encodeURIComponent(shortCode)}" class="stack-form">
				<label>Reason
					<select name="reason" required>${reasonOptions}</select>
				</label>
				<label>Details <span class="muted">(optional)</span>
					<textarea name="details" rows="4" maxlength="1000" placeholder="Add any relevant details"></textarea>
				</label>
				<button type="submit" class="btn btn-primary">Submit report</button>
			</form>
		</section>`;
	return layout({ title: 'Report a file', body, bodyClass: 'page-centered' });
};
