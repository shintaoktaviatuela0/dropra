import { escapeHtml } from '../utils/format.js';
import { layout } from './layout.js';

export const renderPasswordPage = (shortCode: string, error?: string): string => {
	const body = `
		<section class="centered-card">
			<h1>Password required</h1>
			<p class="muted">This file is protected. Enter its password to continue.</p>
			${error ? `<p class="form-error">${escapeHtml(error)}</p>` : ''}
			<form method="post" action="/${encodeURIComponent(shortCode)}" class="stack-form">
				<input type="password" name="password" placeholder="Password" autocomplete="off" required autofocus />
				<button type="submit" class="btn btn-primary">Unlock</button>
			</form>
		</section>`;
	return layout({ title: 'Password required', body, bodyClass: 'page-centered' });
};
