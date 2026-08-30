import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

// Environment must be configured BEFORE any application module is imported,
// because config.ts reads process.env at load time. All app modules are
// therefore loaded lazily via dynamic import() inside before().
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'dopra-it-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_USERNAME = 'tester';
process.env.ADMIN_PASSWORD = 'super-secret-123';
process.env.SESSION_SECRET = 'test-session-secret-value-1234567890';
process.env.NODE_ENV = 'test';

let app: any;
let config: any;
let finalizeUpload: any;
let files: any;
let cleanup: any;

const writeTemp = (content: string | Buffer): string => {
	const file = path.join(config.paths.temp, `src_${Math.random().toString(16).slice(2)}`);
	writeFileSync(file, content);
	return file;
};

const adminCookie = async (): Promise<string> => {
	const login = await app.inject({
		method: 'POST',
		url: '/admin/login',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		payload: 'username=tester&password=super-secret-123'
	});
	const session = login.cookies.find((c: any) => c.name === 'dopra_session');
	return `dopra_session=${session.value}`;
};

const buildMultipart = (
	fields: [string, string][],
	file: { name: string; content: string | Buffer; contentType: string }
): { payload: Buffer; headers: Record<string, string> } => {
	const boundary = `----dopra${Math.random().toString(16).slice(2)}`;
	const chunks: Buffer[] = [];
	for (const [name, value] of fields) {
		chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
	}

	chunks.push(
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
		)
	);
	chunks.push(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content));
	chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

	return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
};

before(async () => {
	config = (await import('../src/config.js')).config;
	const cfg = await import('../src/config.js');
	cfg.ensureDirectories();
	(await import('../src/db/index.js')).initDb();
	(await import('../src/services/settings.js')).loadSettings();
	await (await import('../src/services/users.js')).createAdminUserIfNotExists();
	finalizeUpload = (await import('../src/services/upload.js')).finalizeUpload;
	files = await import('../src/services/files.js');
	cleanup = await import('../src/services/cleanup.js');
	app = await (await import('../src/server.js')).buildServer();
	await app.ready();
});

after(async () => {
	if (app) await app.close();
	rmSync(dataDir, { recursive: true, force: true });
});

test('TEST 3 — /health returns 200', async () => {
	const res = await app.inject({ method: 'GET', url: '/health' });
	assert.equal(res.statusCode, 200);
	const body = res.json();
	assert.equal(body.status, 'ok');
	assert.equal(body.service, 'dopra');
	assert.equal(body.database, 'ok');
	assert.equal(body.storage, 'ok');
});

test('TEST 4-7 — anonymous upload returns a short URL, page and raw work', async () => {
	const { payload, headers } = buildMultipart([['expiration', 'never']], {
		name: 'hello.txt',
		content: 'hello dopra world',
		contentType: 'text/plain'
	});
	const res = await app.inject({ method: 'POST', url: '/api/upload', headers, payload });
	assert.equal(res.statusCode, 200);
	const body = res.json();
	assert.equal(body.success, true);
	const { shortCode, url } = body.data;
	assert.match(shortCode, /^[2-9A-HJ-NP-Za-km-z]{6,}$/);
	assert.ok(url.endsWith(`/${shortCode}`));

	// Public page renders.
	const page = await app.inject({ method: 'GET', url: `/${shortCode}` });
	assert.equal(page.statusCode, 200);
	assert.match(page.body, /hello\.txt/);

	// Raw stream returns the exact bytes.
	const raw = await app.inject({ method: 'GET', url: `/raw/${shortCode}` });
	assert.equal(raw.statusCode, 200);
	assert.equal(raw.body, 'hello dopra world');
});

test('TEST 15 — HTTP Range requests are supported', async () => {
	const record = await finalizeUpload({ tempPath: writeTemp('0123456789'), name: 'range.bin' });
	const res = await app.inject({ method: 'GET', url: `/raw/${record.shortCode}`, headers: { range: 'bytes=0-3' } });
	assert.equal(res.statusCode, 206);
	assert.equal(res.headers['content-range'], 'bytes 0-3/10');
	assert.equal(res.headers['content-length'], '4');
	assert.equal(res.rawPayload.toString(), '0123');

	const head = await app.inject({ method: 'HEAD', url: `/raw/${record.shortCode}` });
	assert.equal(head.statusCode, 200);
	assert.equal(head.headers['content-length'], '10');
	assert.equal(head.headers['accept-ranges'], 'bytes');
});

test('download endpoint increments the counter; raw does not', async () => {
	const record = await finalizeUpload({ tempPath: writeTemp('count me'), name: 'count.txt' });
	assert.equal(files.getByShortCode(record.shortCode).downloadCount, 0);

	await app.inject({ method: 'GET', url: `/raw/${record.shortCode}` });
	assert.equal(files.getByShortCode(record.shortCode).downloadCount, 0);

	await app.inject({ method: 'GET', url: `/download/${record.shortCode}` });
	assert.equal(files.getByShortCode(record.shortCode).downloadCount, 1);
});

test('TEST 14 — password protected files require the password', async () => {
	const record = await finalizeUpload({ tempPath: writeTemp('secret data'), name: 'secret.txt', password: 'letmein' });

	const locked = await app.inject({ method: 'GET', url: `/${record.shortCode}` });
	assert.match(locked.body, /Password required/);

	const rawBlocked = await app.inject({ method: 'GET', url: `/raw/${record.shortCode}` });
	assert.equal(rawBlocked.statusCode, 302); // redirected to password page

	const wrong = await app.inject({
		method: 'POST',
		url: `/${record.shortCode}`,
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		payload: 'password=nope'
	});
	assert.equal(wrong.statusCode, 401);

	const right = await app.inject({
		method: 'POST',
		url: `/${record.shortCode}`,
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		payload: 'password=letmein'
	});
	assert.equal(right.statusCode, 302);
	const cookie = right.cookies.find((c: any) => c.name.startsWith('u_'));
	assert.ok(cookie);

	const unlocked = await app.inject({
		method: 'GET',
		url: `/raw/${record.shortCode}`,
		headers: { cookie: `${cookie.name}=${cookie.value}` }
	});
	assert.equal(unlocked.statusCode, 200);
	assert.equal(unlocked.body, 'secret data');
});

test('download limit disables the file after the limit', async () => {
	const record = await finalizeUpload({
		tempPath: writeTemp('limited'),
		name: 'limited.txt',
		maxDownloads: 1,
		downloadLimitAction: 'disable'
	});
	await app.inject({ method: 'GET', url: `/download/${record.shortCode}` });
	const after = files.getByShortCode(record.shortCode);
	assert.equal(after.status, 'disabled');
	assert.equal(files.availability(after), 'disabled');
});

test('TEST 13 — expired files are removed by cleanup', async () => {
	const record = await finalizeUpload({ tempPath: writeTemp('temporary'), name: 'temp.txt' });
	files.updateExpiration(record.id, Date.now() - 1000);
	const result = await cleanup.runCleanup();
	assert.ok(result.expiredFiles >= 1);
	assert.equal(files.getByShortCode(record.shortCode), undefined);
});

test('TEST 10-12 — admin login, list and delete', async () => {
	const record = await finalizeUpload({ tempPath: writeTemp('admin file'), name: 'admin-view.txt' });

	// Unauthenticated admin redirects to login.
	const guarded = await app.inject({ method: 'GET', url: '/admin' });
	assert.equal(guarded.statusCode, 302);
	assert.equal(guarded.headers.location, '/admin/login');

	// Wrong password is rejected.
	const bad = await app.inject({
		method: 'POST',
		url: '/admin/login',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		payload: 'username=tester&password=wrong'
	});
	assert.equal(bad.statusCode, 401);

	// Correct login sets a session cookie.
	const login = await app.inject({
		method: 'POST',
		url: '/admin/login',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		payload: 'username=tester&password=super-secret-123'
	});
	assert.equal(login.statusCode, 302);
	const session = login.cookies.find((c: any) => c.name === 'dopra_session');
	assert.ok(session);
	const cookie = `dopra_session=${session.value}`;

	// Dashboard is reachable.
	const dash = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } });
	assert.equal(dash.statusCode, 200);
	assert.match(dash.body, /Dashboard/);

	// File appears in the manager.
	const list = await app.inject({ method: 'GET', url: '/admin/files', headers: { cookie } });
	assert.match(list.body, /admin-view\.txt/);

	// Delete removes both the row and the physical file.
	const storageKey = files.getByShortCode(record.shortCode).storageName;
	const del = await app.inject({
		method: 'POST',
		url: `/admin/files/${record.id}/action`,
		headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
		payload: 'op=delete'
	});
	assert.equal(del.statusCode, 302);
	assert.equal(files.getByShortCode(record.shortCode), undefined);
	const storage = (await import('../src/storage/index.js')).getStorage();
	assert.equal(await storage.exists(storageKey), false);
});

test('upload validation rejects blocked extensions and oversized files', async () => {
	const upload = await import('../src/services/upload.js');
	assert.throws(() => upload.validateUpload({ name: 'evil.exe', size: 10, mimeType: 'application/octet-stream' }), /blocked/i);
	assert.throws(() => upload.validateUpload({ name: 'big.txt', size: 5 * 1024 * 1024 * 1024, mimeType: 'text/plain' }), /size/i);
});

test('reports lock once the reported file is deleted, and can be deleted', async () => {
	const reports = await import('../src/services/reports.js');
	const record = await finalizeUpload({ tempPath: writeTemp('reported'), name: 'reported.txt' });
	reports.createReport({ fileId: record.id, shortCode: record.shortCode, reason: 'malware', ip: '10.0.0.9' });

	const open = reports.listReports({ status: 'open' }).find((r: any) => r.shortCode === record.shortCode);
	assert.ok(open);
	assert.equal(open.fileExists, true);
	assert.equal(reports.isReportEditable(open), true);

	await files.deleteFile(record);

	const locked = reports.getReport(open.id);
	assert.equal(locked.fileExists, false);
	assert.equal(locked.status, 'file_removed');
	assert.equal(reports.isReportEditable(locked), false);

	// Moderation is refused, but the entry itself can still be removed.
	const cookie = await adminCookie();
	const blocked = await app.inject({
		method: 'POST',
		url: `/admin/reports/${open.id}/action`,
		headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
		payload: 'op=dismiss'
	});
	assert.equal(blocked.statusCode, 302);
	assert.equal(reports.getReport(open.id).status, 'file_removed');

	const removed = await app.inject({
		method: 'POST',
		url: `/admin/reports/${open.id}/action`,
		headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
		payload: 'op=deleteReport'
	});
	assert.equal(removed.statusCode, 302);
	assert.equal(reports.getReport(open.id), undefined);
});

test('intelligence snapshot groups uploads by resolved country', async () => {
	const geo = await import('../src/services/geo.js');
	assert.equal(geo.countryFromHeaders({ 'cf-ipcountry': 'id' }), 'ID');
	assert.equal(geo.countryFromHeaders({ 'cf-ipcountry': 'XX' }), null);
	assert.equal(geo.isPrivateIp('192.168.1.4'), true);
	assert.equal(geo.isPrivateIp('8.8.8.8'), false);

	const record = await finalizeUpload({ tempPath: writeTemp('geo'), name: 'geo.txt', country: 'ID' });
	const snapshot = (await import('../src/services/intel.js')).getIntelSnapshot();
	const indonesia = snapshot.countries.find((entry: any) => entry.code === 'ID');
	assert.ok(indonesia);
	assert.equal(indonesia.name, 'Indonesia');
	assert.ok(indonesia.lat !== null && indonesia.lon !== null);
	assert.ok(snapshot.events.some((event: any) => event.shortCode === record.shortCode && event.country === 'Indonesia'));

	const cookie = await adminCookie();
	const page = await app.inject({ method: 'GET', url: '/admin/intel', headers: { cookie } });
	assert.equal(page.statusCode, 200);
	assert.match(page.body, /Live origin map/);
});

test('short URLs honour X-Forwarded-Host/Proto behind a reverse proxy', async () => {
	const { payload, headers } = buildMultipart([['expiration', 'never']], {
		name: 'proxied.txt',
		content: 'behind a proxy',
		contentType: 'text/plain'
	});

	// Proxies (Railway, Render, Heroku, nginx, Codespaces...) rewrite Host to
	// localhost and send the real domain in X-Forwarded-Host.
	const res = await app.inject({
		method: 'POST',
		url: '/api/upload',
		headers: {
			...headers,
			host: 'localhost:3000',
			'x-forwarded-host': 'file.example.com',
			'x-forwarded-proto': 'https'
		},
		payload
	});

	assert.equal(res.statusCode, 200);
	const { url, directUrl } = res.json().data;
	assert.ok(url.startsWith('https://file.example.com/'), `expected forwarded host, got ${url}`);
	assert.ok(directUrl.startsWith('https://file.example.com/raw/'), `expected forwarded host, got ${directUrl}`);
	assert.ok(!url.includes('localhost'));
});

test('a spoofed forwarded host is rejected', async () => {
	const { payload, headers } = buildMultipart([], {
		name: 'spoof.txt',
		content: 'spoof attempt',
		contentType: 'text/plain'
	});

	const res = await app.inject({
		method: 'POST',
		url: '/api/upload',
		headers: { ...headers, 'x-forwarded-host': 'evil.com/path"><script>' },
		payload
	});

	assert.equal(res.statusCode, 200);
	assert.ok(!res.json().data.url.includes('<script>'));
});

test('missing short code returns a 404 file page', async () => {
	const res = await app.inject({ method: 'GET', url: '/doesnotexist' });
	assert.equal(res.statusCode, 404);
	assert.match(res.body, /File not found/);
});
