import { getSettings } from '../services/settings.js';
import { escapeHtml } from '../utils/format.js';

export interface LayoutOptions {
	title?: string;
	description?: string;
	body: string;
	extraHead?: string;
	extraScripts?: string;
	bodyClass?: string;
	showChrome?: boolean;
	isAdmin?: boolean;
}

/** Base HTML document shared by every server-rendered page. */
export const layout = (options: LayoutOptions): string => {
	const settings = getSettings();
	const siteName = escapeHtml(settings.siteName || 'Dopra');
	const title = options.title ? `${escapeHtml(options.title)} · ${siteName}` : siteName;
	const description = escapeHtml(options.description || settings.siteDescription);
	const accent = escapeHtml(settings.accentColor || '#4f46e5');
	const favicon = settings.faviconUrl ? escapeHtml(settings.faviconUrl) : '/assets/favicon.svg';
	const showChrome = options.showChrome !== false;

	const header = showChrome
		? `<header class="site-header">
				<a class="brand" href="/">
					${settings.logoUrl ? `<img class="brand-logo" src="${escapeHtml(settings.logoUrl)}" alt="${siteName}" />` : brandMark()}
					<span class="brand-name">${siteName}</span>
				</a>
				<nav class="site-nav">
					${options.isAdmin ? '<a href="/admin">Dashboard</a>' : ''}
					<button type="button" class="theme-toggle" data-theme-toggle aria-label="Toggle theme">
						<span class="theme-icon" aria-hidden="true"></span>
					</button>
				</nav>
			</header>`
		: '';

	const footerLinks = [
		settings.termsUrl ? `<a href="${escapeHtml(settings.termsUrl)}">Terms</a>` : '',
		settings.privacyUrl ? `<a href="${escapeHtml(settings.privacyUrl)}">Privacy</a>` : '',
		settings.contactUrl ? `<a href="${escapeHtml(settings.contactUrl)}">Contact</a>` : ''
	]
		.filter(Boolean)
		.join('');

	const footer = showChrome
		? `<footer class="site-footer">
				<div class="footer-links">${footerLinks}</div>
				<div class="footer-note">Powered by ${siteName} · Files are hosted privately. No ads, no tracking.</div>
			</footer>`
		: '';

	return `<!DOCTYPE html>
<html lang="en" data-theme="${escapeHtml(settings.theme)}">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
	<meta name="description" content="${description}" />
	<meta name="theme-color" content="${accent}" />
	<meta property="og:title" content="${title}" />
	<meta property="og:description" content="${description}" />
	<title>${title}</title>
	<link rel="icon" href="${favicon}" type="image/svg+xml" />
	<link rel="stylesheet" href="/assets/css/dopra.css" />
	<style>:root{--accent:${accent};}</style>
	<script>
		(function(){
			try{
				var stored = localStorage.getItem('dopra-theme');
				var theme = stored || 'system';
				var resolved = theme === 'system'
					? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
					: theme;
				document.documentElement.setAttribute('data-theme', resolved);
			}catch(e){}
		})();
	</script>
	${options.extraHead ?? ''}
</head>
<body class="${escapeHtml(options.bodyClass ?? '')}">
	${header}
	<main class="site-main">${options.body}</main>
	${footer}
	<script src="/assets/js/theme.js" defer></script>
	${options.extraScripts ?? ''}
</body>
</html>`;
};

/** Inline SVG brand mark for Dopra (a stylised drop). */
export const brandMark = (): string =>
	`<svg class="brand-mark" width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.5c3.6 4.2 6.5 7.9 6.5 11.4A6.5 6.5 0 0 1 12 20.4a6.5 6.5 0 0 1-6.5-6.5C5.5 10.4 8.4 6.7 12 2.5Z" fill="var(--accent)"/></svg>`;
