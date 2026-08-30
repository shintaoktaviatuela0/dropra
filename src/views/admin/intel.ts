import type { IntelSnapshot } from '../../services/intel.js';
import { escapeHtml, formatBytes } from '../../utils/format.js';
import { adminShell } from './shell.js';

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;

/**
 * Coarse 10° land mask, one row per latitude band from 80°N down to −60°N.
 * '#' marks a cell that contains land; it is rendered as a dot cluster to give
 * the map a recognisable silhouette without shipping vector map data.
 */
const LAND_MASK = [
	'..##############...##..#############',
	'.################.##################',
	'.############....###################',
	'.....#######.....################...',
	'.....######......################...',
	'..#...####......###############.....',
	'.......######...#######..######.....',
	'.........#####...######..#######....',
	'..........#####...#####....######...',
	'..........#####....####......#####..',
	'...........####....####......#####..',
	'..........####.....###.......#####.#',
	'..........##......................##',
	'..........#.........................'
];

const projectX = (lon: number): number => ((lon + 180) / 360) * MAP_WIDTH;
const projectY = (lat: number): number => ((90 - lat) / 180) * MAP_HEIGHT;

const SUBCELL_OFFSETS: [number, number][] = [
	[2.5, 2.5],
	[7.5, 2.5],
	[2.5, 7.5],
	[7.5, 7.5]
];

const landDots = (): string => {
	const dots: string[] = [];
	LAND_MASK.forEach((line, row) => {
		for (let col = 0; col < line.length; col++) {
			if (line[col] !== '#') continue;
			// Each 10° cell becomes a 2×2 cluster, doubling the apparent resolution.
			for (const [dx, dy] of SUBCELL_OFFSETS) {
				const lon = -180 + col * 10 + dx;
				const lat = 80 - row * 10 - dy;
				dots.push(`<circle cx="${projectX(lon).toFixed(1)}" cy="${projectY(lat).toFixed(1)}" r="2.1" />`);
			}
		}
	});

	return `<g class="map-land">${dots.join('')}</g>`;
};

const graticule = (): string => {
	const lines: string[] = [];
	for (let lon = -180; lon <= 180; lon += 30) {
		const x = projectX(lon).toFixed(1);
		lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${MAP_HEIGHT}" />`);
	}

	for (let lat = -60; lat <= 80; lat += 20) {
		const y = projectY(lat).toFixed(1);
		lines.push(`<line x1="0" y1="${y}" x2="${MAP_WIDTH}" y2="${y}" />`);
	}

	return `<g class="map-grid">${lines.join('')}</g>`;
};

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
			const radius = (5 + (entry.uploads / peak) * 13).toFixed(1);
			const share = ((entry.uploads / Math.max(1, snapshot.totalUploads)) * 100).toFixed(1);
			return `<g class="map-marker" data-code="${escapeHtml(entry.code)}" style="--delay:${((index % 8) * 0.35).toFixed(2)}s">
					<title>${escapeHtml(entry.name)} — ${entry.uploads} upload(s), ${share}%</title>
					<circle class="marker-pulse" cx="${x}" cy="${y}" r="${radius}" />
					<circle class="marker-pulse marker-pulse-2" cx="${x}" cy="${y}" r="${radius}" />
					<circle class="marker-core" cx="${x}" cy="${y}" r="${Math.max(3, Number(radius) / 3).toFixed(1)}" />
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
				<svg viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="img" aria-label="World map of upload origins" preserveAspectRatio="xMidYMid meet">
					${graticule()}
					${landDots()}
					<g id="intel-arcs" class="map-arcs"></g>
					<g id="intel-markers">${markers}</g>
				</svg>
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
		extraScripts: `<script>window.DOPRA_INTEL = { width: ${MAP_WIDTH}, height: ${MAP_HEIGHT} };</script><script src="/assets/js/intel.js" defer></script>`
	});
};
