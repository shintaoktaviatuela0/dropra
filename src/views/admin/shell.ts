import { getSettings } from '../../services/settings.js';
import { escapeHtml } from '../../utils/format.js';
import { brandMark } from '../layout.js';

export interface AdminShellOptions {
	active: string;
	title: string;
	body: string;
	username: string;
	openReports?: number;
	extraScripts?: string;
}

const NAV = [
	{ key: 'dashboard', label: 'Dashboard', href: '/admin' },
	{ key: 'files', label: 'Files', href: '/admin/files' },
	{ key: 'storage', label: 'Storage', href: '/admin/storage' },
	{ key: 'reports', label: 'Reports', href: '/admin/reports' },
	{ key: 'settings', label: 'Settings', href: '/admin/settings' },
	{ key: 'security', label: 'Security', href: '/admin/security' },
	{ key: 'system', label: 'System', href: '/admin/system' }
];

/** Admin dashboard chrome (sidebar + topbar). */
export const adminShell = (options: AdminShellOptions): string => {
	const settings = getSettings();
	const siteName = escapeHtml(settings.siteName || 'Dopra');

	const nav = NAV.map(item => {
		const badge =
			item.key === 'reports' && options.openReports
				? `<span class="nav-badge">${options.openReports}</span>`
				: '';
		return `<a class="nav-item${item.key === options.active ? ' active' : ''}" href="${item.href}">${escapeHtml(item.label)}${badge}</a>`;
	}).join('');

	return `<!DOCTYPE html>
<html lang="en" data-theme="${escapeHtml(settings.theme)}">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="robots" content="noindex" />
	<title>${escapeHtml(options.title)} · ${siteName} Admin</title>
	<link rel="icon" href="${settings.faviconUrl ? escapeHtml(settings.faviconUrl) : '/assets/favicon.svg'}" type="image/svg+xml" />
	<link rel="stylesheet" href="/assets/css/dopra.css" />
	<style>:root{--accent:${escapeHtml(settings.accentColor || '#4f46e5')};}</style>
	<script>
		(function(){try{var s=localStorage.getItem('dopra-theme')||'system';var r=s==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):s;document.documentElement.setAttribute('data-theme',r);}catch(e){}})();
	</script>
</head>
<body class="admin">
	<div class="admin-layout">
		<aside class="admin-sidebar">
			<a class="brand" href="/admin">${brandMark()}<span class="brand-name">${siteName}</span></a>
			<nav class="admin-nav">${nav}</nav>
			<div class="sidebar-foot">
				<a href="/" class="muted">View site</a>
			</div>
		</aside>
		<div class="admin-content">
			<header class="admin-topbar">
				<h1>${escapeHtml(options.title)}</h1>
				<div class="topbar-actions">
					<button type="button" class="theme-toggle" data-theme-toggle aria-label="Toggle theme"><span class="theme-icon"></span></button>
					<span class="muted">${escapeHtml(options.username)}</span>
					<form method="post" action="/admin/logout"><button type="submit" class="btn btn-small">Log out</button></form>
				</div>
			</header>
			<div class="admin-body">${options.body}</div>
		</div>
	</div>
	<script src="/assets/js/theme.js" defer></script>
	<script src="/assets/js/admin.js" defer></script>
	${options.extraScripts ?? ''}
</body>
</html>`;
};
