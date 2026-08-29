import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { generateCode, generateUniqueCode, isReserved, RESERVED_CODES } from '../src/services/shortcode.js';
import { categorize, isActiveContent, sniffMimeType } from '../src/services/filetype.js';
import { clampExpiration, expirationToTimestamp, isValidExpiration } from '../src/services/expiration.js';
import { LocalStorageProvider } from '../src/storage/local.js';

test('short code: correct length and safe alphabet', () => {
	for (let i = 0; i < 200; i++) {
		const code = generateCode(8);
		assert.equal(code.length, 8);
		assert.match(code, /^[2-9A-HJ-NP-Za-km-z]+$/); // no 0,1,O,I,l
	}
});

test('short code: reserved routes are recognised', () => {
	for (const reserved of ['admin', 'api', 'health', 'raw', 'download', 'robots.txt', 'favicon.ico']) {
		assert.ok(isReserved(reserved));
		assert.ok(RESERVED_CODES.has(reserved));
	}

	assert.equal(isReserved('A7x92K'), false);
});

test('short code: generateUniqueCode avoids collisions and reserved codes', () => {
	const taken = new Set<string>();
	for (let i = 0; i < 500; i++) {
		const code = generateUniqueCode(c => taken.has(c));
		assert.ok(!taken.has(code));
		assert.ok(!isReserved(code));
		taken.add(code);
	}

	assert.equal(taken.size, 500);
});

test('filetype: sniff magic numbers', () => {
	assert.equal(sniffMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'image/png');
	assert.equal(sniffMimeType(Buffer.from([0xff, 0xd8, 0xff])), 'image/jpeg');
	assert.equal(sniffMimeType(Buffer.from('%PDF-1.7')), 'application/pdf');
	assert.equal(sniffMimeType(Buffer.from('plain text')), null);
});

test('filetype: categorisation and active-content detection', () => {
	assert.equal(categorize('image/png', '.png'), 'image');
	assert.equal(categorize('video/mp4', '.mp4'), 'video');
	assert.equal(categorize('application/pdf', '.pdf'), 'pdf');
	assert.equal(categorize('text/plain', '.txt'), 'text');
	// SVG/HTML must NOT be treated as inline-previewable image/text.
	assert.equal(categorize('image/svg+xml', '.svg'), 'other');
	assert.ok(isActiveContent('text/html', '.html'));
	assert.ok(isActiveContent(null, '.svg'));
	assert.equal(isActiveContent('image/png', '.png'), false);
});

test('expiration: option to timestamp', () => {
	const from = 1_000_000;
	assert.equal(expirationToTimestamp('never', from), null);
	assert.equal(expirationToTimestamp('1h', from), from + 3_600_000);
	assert.ok(isValidExpiration('7d'));
	assert.equal(isValidExpiration('nonsense'), false);
});

test('expiration: clamp respects maximum and never policy', () => {
	const from = 0;
	// Requesting never when max is 1d clamps to 1 day.
	assert.equal(clampExpiration('never', '1d', true, from), 86_400_000);
	// Never allowed and max never -> null.
	assert.equal(clampExpiration('never', 'never', true, from), null);
	// Never disallowed -> forced to max.
	assert.equal(clampExpiration('never', '7d', false, from), 7 * 86_400_000);
});

test('storage: rejects path traversal, supports sharded keys', async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'dropra-store-'));
	try {
		const provider = new LocalStorageProvider(root);
		assert.equal(provider.keyFor('abcdef12'), path.posix.join('ab', 'cd', 'abcdef12'));

		await assert.rejects(() => provider.put('../escape', Buffer.from('x')));
		await assert.rejects(() => provider.put('../../etc/passwd', Buffer.from('x')));

		await provider.put('ab/cd/file', Buffer.from('hello'));
		assert.equal((await provider.get('ab/cd/file')).toString(), 'hello');
		assert.ok(await provider.exists('ab/cd/file'));
		await provider.delete('ab/cd/file');
		assert.equal(await provider.exists('ab/cd/file'), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
