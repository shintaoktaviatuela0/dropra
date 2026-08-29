import { escapeHtml } from '../utils/format.js';
import { layout } from './layout.js';

export interface ErrorPageOptions {
	status: number;
	title: string;
	message: string;
}

export const renderErrorPage = (options: ErrorPageOptions): string => {
	const body = `
		<section class="centered-card error-card">
			<div class="error-status">${escapeHtml(options.status)}</div>
			<h1>${escapeHtml(options.title)}</h1>
			<p class="muted">${escapeHtml(options.message)}</p>
			<a class="btn btn-primary" href="/">Go home</a>
		</section>`;
	return layout({ title: options.title, body, bodyClass: 'page-centered' });
};

/** Common, pre-baked error pages. */
export const ERROR_PAGES = {
	notFound: () =>
		renderErrorPage({ status: 404, title: 'Not found', message: 'The page or file you are looking for does not exist.' }),
	fileNotFound: () =>
		renderErrorPage({ status: 404, title: 'File not found', message: 'This file does not exist or has been removed.' }),
	expired: () =>
		renderErrorPage({ status: 410, title: 'File expired', message: 'This file has expired and is no longer available.' }),
	disabled: () =>
		renderErrorPage({ status: 403, title: 'File unavailable', message: 'This file is unavailable.' }),
	limitReached: () =>
		renderErrorPage({
			status: 410,
			title: 'Download limit reached',
			message: 'This file has reached its download limit and is no longer available.'
		}),
	tooLarge: () =>
		renderErrorPage({ status: 413, title: 'Upload too large', message: 'The file you tried to upload exceeds the allowed size.' }),
	rateLimited: () =>
		renderErrorPage({ status: 429, title: 'Slow down', message: 'You are doing that too often. Please try again later.' }),
	server: () =>
		renderErrorPage({ status: 500, title: 'Something went wrong', message: 'An unexpected error occurred. Please try again later.' })
};
