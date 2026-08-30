(function () {
	var CONFIG = window.DOPRA_INTEL || { width: 1000, height: 394, latTop: 84, scale: 1000 / 360 };
	var markersLayer = document.getElementById('intel-markers');
	var arcsLayer = document.getElementById('intel-arcs');
	var feedList = document.getElementById('intel-feed');
	var board = document.getElementById('intel-leaderboard');
	var status = document.getElementById('intel-status');
	if (!markersLayer) return;

	var SVG_NS = 'http://www.w3.org/2000/svg';
	var POLL_MS = 8000;
	var lastEventKey = null;

	// Land and border geometry ships as a cached static asset (assets/js/world.js).
	(function paintWorld() {
		var world = window.DOPRA_WORLD;
		if (!world) return;
		var land = document.getElementById('world-land');
		var borders = document.getElementById('world-borders');
		if (land) land.setAttribute('d', world.land);
		if (borders) borders.setAttribute('d', world.borders);
	})();

	function projectX(lon) { return (lon + 180) * CONFIG.scale; }
	function projectY(lat) { return (CONFIG.latTop - lat) * CONFIG.scale; }

	function relativeTime(ts) {
		var seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
		if (seconds < 60) return seconds + 's ago';
		if (seconds < 3600) return Math.round(seconds / 60) + 'm ago';
		if (seconds < 86400) return Math.round(seconds / 3600) + 'h ago';
		return Math.round(seconds / 86400) + 'd ago';
	}

	function formatBytes(bytes) {
		var units = ['B', 'KB', 'MB', 'GB', 'TB'];
		var value = bytes;
		var i = 0;
		while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
		return (i === 0 ? value : value.toFixed(1)) + ' ' + units[i];
	}

	function refreshTimes() {
		document.querySelectorAll('#intel-feed time[data-time]').forEach(function (node) {
			node.textContent = relativeTime(Number(node.getAttribute('data-time')));
		});
	}

	function el(name, attrs) {
		var node = document.createElementNS(SVG_NS, name);
		for (var key in attrs) node.setAttribute(key, attrs[key]);
		return node;
	}

	function renderMarkers(countries, totalUploads) {
		var plotted = countries.filter(function (c) { return c.lat !== null && c.lon !== null; });
		var peak = plotted.reduce(function (max, c) { return Math.max(max, c.uploads); }, 1);

		markersLayer.textContent = '';
		plotted.forEach(function (entry, index) {
			var x = projectX(entry.lon);
			var y = projectY(entry.lat);
			var ring = 7 + (entry.uploads / peak) * 15;
			var share = ((entry.uploads / Math.max(1, totalUploads)) * 100).toFixed(1);

			var group = el('g', { class: 'map-marker', 'data-code': entry.code });
			group.style.setProperty('--delay', ((index % 8) * 0.4).toFixed(2) + 's');

			var title = document.createElementNS(SVG_NS, 'title');
			title.textContent = entry.name + ' — ' + entry.uploads + ' upload(s), ' + share + '%';
			group.appendChild(title);
			group.appendChild(el('circle', { class: 'marker-halo', cx: x, cy: y, r: ring }));
			group.appendChild(el('circle', { class: 'marker-ring', cx: x, cy: y, r: ring }));
			group.appendChild(el('circle', { class: 'marker-ring marker-ring-2', cx: x, cy: y, r: ring }));
			group.appendChild(el('circle', { class: 'marker-core', cx: x, cy: y, r: 3.2 }));
			markersLayer.appendChild(group);
		});
	}

	// Draw a short-lived arc from the origin to the map centre for a new upload.
	function flyArc(event) {
		if (!arcsLayer || event.lat === null || event.lon === null) return;
		var x1 = projectX(event.lon);
		var y1 = projectY(event.lat);
		var x2 = CONFIG.width / 2;
		var y2 = CONFIG.height / 2;
		var lift = Math.min(150, Math.hypot(x2 - x1, y2 - y1) * 0.45);
		var d = 'M ' + x1 + ' ' + y1 + ' Q ' + (x1 + x2) / 2 + ' ' + ((y1 + y2) / 2 - lift) + ' ' + x2 + ' ' + y2;
		var glow = el('path', { class: 'map-arc map-arc-glow', d: d });
		var path = el('path', { class: 'map-arc', d: d });
		var ping = el('circle', { class: 'map-ping', cx: x1, cy: y1, r: 6 });
		arcsLayer.appendChild(glow);
		arcsLayer.appendChild(path);
		arcsLayer.appendChild(ping);
		setTimeout(function () { glow.remove(); path.remove(); ping.remove(); }, 2600);
	}

	function renderFeed(events) {
		if (!feedList) return;
		feedList.textContent = '';
		if (!events.length) {
			var empty = document.createElement('li');
			empty.className = 'muted';
			empty.textContent = 'Waiting for uploads…';
			feedList.appendChild(empty);
			return;
		}

		events.slice(0, 20).forEach(function (event, index) {
			var item = document.createElement('li');
			item.className = 'feed-item';
			if (index === 0 && lastEventKey && lastEventKey !== event.shortCode) item.classList.add('feed-new');

			var flag = document.createElement('span');
			flag.className = 'feed-flag';
			flag.setAttribute('aria-hidden', 'true');
			flag.textContent = event.flag;

			var country = document.createElement('span');
			country.className = 'feed-country';
			country.textContent = event.country;

			var code = document.createElement('code');
			code.className = 'feed-code';
			code.textContent = event.shortCode;

			var size = document.createElement('span');
			size.className = 'feed-size muted';
			size.textContent = formatBytes(event.size);

			var time = document.createElement('time');
			time.className = 'feed-time muted';
			time.setAttribute('data-time', event.createdAt);
			time.textContent = relativeTime(event.createdAt);

			item.append(flag, country, code, size, time);
			feedList.appendChild(item);
		});
	}

	function renderBoard(countries) {
		if (!board) return;
		var plotted = countries.filter(function (c) { return c.lat !== null && c.lon !== null; });
		board.textContent = '';
		if (!plotted.length) {
			var empty = document.createElement('li');
			empty.className = 'muted';
			empty.textContent = 'No geolocated uploads yet.';
			board.appendChild(empty);
			return;
		}

		var peak = plotted.reduce(function (max, c) { return Math.max(max, c.uploads); }, 1);
		plotted.slice(0, 12).forEach(function (entry) {
			var row = document.createElement('li');
			row.className = 'geo-row';
			row.setAttribute('data-code', entry.code);

			var flag = document.createElement('span');
			flag.className = 'geo-flag';
			flag.setAttribute('aria-hidden', 'true');
			flag.textContent = entry.flag;

			var name = document.createElement('span');
			name.className = 'geo-name';
			name.textContent = entry.name;

			var bar = document.createElement('span');
			bar.className = 'geo-bar';
			var fill = document.createElement('span');
			fill.className = 'geo-bar-fill';
			fill.style.width = ((entry.uploads / peak) * 100).toFixed(1) + '%';
			bar.appendChild(fill);

			var count = document.createElement('span');
			count.className = 'geo-count';
			count.textContent = entry.uploads;

			var bytes = document.createElement('span');
			bytes.className = 'geo-bytes muted';
			bytes.textContent = formatBytes(entry.bytes);

			row.append(flag, name, bar, count, bytes);
			board.appendChild(row);
		});
	}

	function renderStats(snapshot) {
		document.querySelectorAll('[data-intel]').forEach(function (node) {
			var key = node.getAttribute('data-intel');
			if (!(key in snapshot)) return;
			var next = String(snapshot[key]);
			if (node.textContent === next) return;
			node.textContent = next;
			node.classList.remove('stat-bump');
			void node.offsetWidth;
			node.classList.add('stat-bump');
		});
	}

	async function poll() {
		try {
			var response = await fetch('/admin/intel/data', { headers: { accept: 'application/json' } });
			if (!response.ok) throw new Error('bad status');
			var snapshot = await response.json();

			var newest = snapshot.events[0];
			if (newest && lastEventKey && newest.shortCode !== lastEventKey) flyArc(newest);

			renderStats(snapshot);
			renderMarkers(snapshot.countries, snapshot.totalUploads);
			renderBoard(snapshot.countries);
			renderFeed(snapshot.events);
			lastEventKey = newest ? newest.shortCode : null;
			if (status) { status.textContent = 'Live'; status.classList.remove('is-stale'); }
		} catch (err) {
			if (status) { status.textContent = 'Reconnecting…'; status.classList.add('is-stale'); }
		}
	}

	refreshTimes();
	setInterval(refreshTimes, 15000);
	poll();
	setInterval(poll, POLL_MS);
})();
