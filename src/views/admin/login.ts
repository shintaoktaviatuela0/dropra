import { getSettings } from '../../services/settings.js';
import { escapeHtml } from '../../utils/format.js';
import { brandMark } from '../layout.js';

export const renderAdminLogin = (options: { error?: string } = {}): string => {
	const settings = getSettings();
	const siteName = escapeHtml(settings.siteName || 'Dropra');
	return `<!DOCTYPE html>
<html lang="en" data-theme="${escapeHtml(settings.theme)}">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="robots" content="noindex" />
	<title>Sign in · ${siteName} Admin</title>
	<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
	<link rel="stylesheet" href="/assets/css/dropra.css" />
	<style>:root{--accent:${escapeHtml(settings.accentColor || '#4f46e5')};}</style>
	<script>(function(){try{var s=localStorage.getItem('dropra-theme')||'system';var r=s==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):s;document.documentElement.setAttribute('data-theme',r);}catch(e){}})();</script>
</head>
<body class="page-centered">
	<main class="site-main">
		<section class="centered-card login-card">
			<div class="login-brand">${brandMark()}<span class="brand-name">${siteName}</span></div>
			<h1>Admin sign in</h1>
			${options.error ? `<p class="form-error">${escapeHtml(options.error)}</p>` : ''}
			<form method="post" action="/admin/login" class="stack-form">
				<label>Username
					<input type="text" name="username" autocomplete="username" required autofocus />
				</label>
				<label>Password
					<input type="password" name="password" autocomplete="current-password" required />
				</label>
				<button type="submit" class="btn btn-primary">Sign in</button>
			</form>
		</section>
	</main>
	<script src="/assets/js/theme.js" defer></script>
</body>
</html>`;
};
