import type { IntelSnapshot } from '../../services/intel.js';
import { escapeHtml, formatBytes } from '../../utils/format.js';
import { adminShell } from './shell.js';

// Plate carrée projection matching the generated /assets/js/world.js geometry.
const MAP_WIDTH = 1000;
const LAT_TOP = 84;
const LAT_BOTTOM = -58;
const SCALE = MAP_WIDTH / 360;
const MAP_HEIGHT = Math.round((LAT_TOP - LAT_BOTTOM) * SCALE);

const projectX = (lon: number): number => (lon + 180) * SCALE;
const projectY = (lat: number): number => (LAT_TOP - lat) * SCALE;

const graticule = (): string => {
	const lines: string[] = [];
	for (let lon = -180; lon <= 180; lon += 20) {
		const x = projectX(lon).toFixed(1);
		lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${MAP_HEIGHT}" />`);
	}

	for (let lat = 80; lat >= LAT_BOTTOM; lat -= 20) {
		const y = projectY(lat).toFixed(1);
		lines.push(`<line x1="0" y1="${y}" x2="${MAP_WIDTH}" y2="${y}" />`);
	}

	return `<g class="map-grid">${lines.join('')}</g>`;
};

const defs = (): string => `<defs>
		<radialGradient id="holo-ocean" cx="50%" cy="46%" r="72%">
			<stop offset="0%" stop-color="#38bdf8" stop-opacity="0.18" />
			<stop offset="60%" stop-color="#1d4ed8" stop-opacity="0.07" />
			<stop offset="100%" stop-color="#020617" stop-opacity="0" />
		</radialGradient>
		<linearGradient id="holo-land" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="#7dd3fc" stop-opacity="0.34" />
			<stop offset="100%" stop-color="#6366f1" stop-opacity="0.16" />
		</linearGradient>
		<linearGradient id="holo-sweep" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0%" stop-color="#38bdf8" stop-opacity="0" />
			<stop offset="70%" stop-color="#38bdf8" stop-opacity="0.06" />
			<stop offset="100%" stop-color="#7dd3fc" stop-opacity="0.3" />
		</linearGradient>
		<filter id="holo-glow" x="-40%" y="-40%" width="180%" height="180%">
			<feGaussianBlur stdDeviation="1.6" result="blur" />
			<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
		</filter>
		<filter id="holo-glow-soft" x="-60%" y="-60%" width="220%" height="220%">
			<feGaussianBlur stdDeviation="5" />
		</filter>
		<pattern id="holo-scan" width="6" height="3" patternUnits="userSpaceOnUse">
			<rect x="0" y="0" width="6" height="1" fill="#bae6fd" fill-opacity="0.05" />
		</pattern>
	</defs>`;

export const renderAdminIntel = (params: {
	snapshot: IntelSnapshot;
	username: string;
	openReports: number;
	geoEnabled: boolean;
}): string => {
	const { snapshot } = params;
	const plotted = snapshot.countries.filter(entry => entry.lat !== null && entry.lon !== null);
	const peak = Math.max(1, ...plotted.map(entry => entry.uploads));

	const markers = plotted
		.map((entry, index) => {
			const x = projectX(entry.lon!).toFixed(1);
			const y = projectY(entry.lat!).toFixed(1);
			const ring = (7 + (entry.uploads / peak) * 15).toFixed(1);
			const share = ((entry.uploads / Math.max(1, snapshot.totalUploads)) * 100).toFixed(1);
			return `<g class="map-marker" data-code="${escapeHtml(entry.code)}" style="--delay:${((index % 8) * 0.4).toFixed(2)}s">
					<title>${escapeHtml(entry.name)} — ${entry.uploads} upload(s), ${share}%</title>
					<circle class="marker-halo" cx="${x}" cy="${y}" r="${ring}" />
					<circle class="marker-ring" cx="${x}" cy="${y}" r="${ring}" />
					<circle class="marker-ring marker-ring-2" cx="${x}" cy="${y}" r="${ring}" />
					<circle class="marker-core" cx="${x}" cy="${y}" r="3.2" />
				</g>`;
		})
		.join('');

	const leaderboard = plotted.length
		? plotted
				.slice(0, 12)
				.map(entry => {
					const width = ((entry.uploads / peak) * 100).toFixed(1);
					return `<li class="geo-row" data-code="${escapeHtml(entry.code)}">
						<span class="geo-flag" aria-hidden="true">${entry.flag}</span>
						<span class="geo-name">${escapeHtml(entry.name)}</span>
						<span class="geo-bar"><span class="geo-bar-fill" style="width:${width}%"></span></span>
						<span class="geo-count">${entry.uploads}</span>
						<span class="geo-bytes muted">${escapeHtml(formatBytes(entry.bytes))}</span>
					</li>`;
				})
				.join('')
		: '<li class="muted">No geolocated uploads yet.</li>';

	const feed = snapshot.events.length
		? snapshot.events
				.slice(0, 20)
				.map(
					event => `<li class="feed-item">
					<span class="feed-flag" aria-hidden="true">${event.flag}</span>
					<span class="feed-country">${escapeHtml(event.country)}</span>
					<code class="feed-code">${escapeHtml(event.shortCode)}</code>
					<span class="feed-size muted">${escapeHtml(formatBytes(event.size))}</span>
					<time class="feed-time muted" data-time="${event.createdAt}">—</time>
				</li>`
				)
				.join('')
		: '<li class="muted">Waiting for uploads…</li>';

	const notice = params.geoEnabled
		? ''
		: `<div class="notice notice-warn">IP geolocation lookups are disabled, so only platform-provided country headers (Cloudflare, Vercel, Fastly, CloudFront) are used. Enable them under <a href="/admin/settings">Settings → Intelligence</a> if you want full coverage.</div>`;

	const body = `
		${notice}
		<div class="stat-grid">
			<div class="stat-card"><span class="stat-label">Uploads (total)</span><span class="stat-value" data-intel="totalUploads">${snapshot.totalUploads}</span></div>
			<div class="stat-card"><span class="stat-label">Last 24 hours</span><span class="stat-value" data-intel="uploads24h">${snapshot.uploads24h}</span></div>
			<div class="stat-card"><span class="stat-label">Last hour</span><span class="stat-value" data-intel="uploads1h">${snapshot.uploads1h}</span></div>
			<div class="stat-card"><span class="stat-label">Countries seen</span><span class="stat-value" data-intel="countriesSeen">${snapshot.countriesSeen}</span></div>
			<div class="stat-card"><span class="stat-label">Unlocated</span><span class="stat-value" data-intel="unknownUploads">${snapshot.unknownUploads}</span></div>
		</div>

		<section class="panel intel-panel">
			<div class="intel-head">
				<h2>Live origin map</h2>
				<span class="live-dot" aria-hidden="true"></span>
				<span class="muted" id="intel-status">Streaming</span>
			</div>
			<div class="intel-map">
				<svg class="holo-map" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="img" aria-label="World map of upload origins" preserveAspectRatio="xMidYMid meet">
					${defs()}
					<rect class="map-ocean" x="0" y="0" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" />
					${graticule()}
					<path id="world-land" class="map-land" d="" />
					<path id="world-borders" class="map-borders" d="" />
					<rect class="map-scan" x="0" y="0" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" />
					<rect class="map-sweep" x="0" y="0" width="240" height="${MAP_HEIGHT}" />
					<g id="intel-arcs" class="map-arcs"></g>
					<g id="intel-markers">${markers}</g>
				</svg>
				<div class="holo-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
			</div>
		</section>

		<div class="panel-grid">
			<section class="panel">
				<h2>Top origins</h2>
				<ul class="geo-list" id="intel-leaderboard">${leaderboard}</ul>
			</section>
			<section class="panel">
				<h2>Live feed</h2>
				<ul class="feed-list" id="intel-feed">${feed}</ul>
			</section>
		</div>`;

	return adminShell({
		active: 'intel',
		title: 'Intelligence',
		body,
		username: params.username,
		openReports: params.openReports,
		extraScripts: `<script>window.DOPRA_INTEL = { width: ${MAP_WIDTH}, height: ${MAP_HEIGHT}, latTop: ${LAT_TOP}, scale: ${SCALE} };</script><script src="/assets/js/world.js" defer></script><script src="/assets/js/intel.js" defer></script>`
	});
};
