// app.IconSets (js/background/iconsets.js): the icon picker's sets, downloaded only when asked for
//   list       every set of iconsets.json, and whether it is downloaded, current or older
//   download   kept only when its size and fingerprint (SHA-256) match iconsets.json; one download at a time per set
//   get        a downloaded set as in its file
//   remove     forgets it
// Loaded into a sandbox with a fake browser API (./load.js) and a fake fetch that serves iconsets.json and the set files.
// Downloading from Properties is integration/properties.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { loadBackground, plain } = require('./load');

// Each set names its own file: the outline set from an earlier release than the pixel set
const RELEASES = 'https://example.test/releases/download/';
const OUTLINE_URL = RELEASES + 'icons-1/outline.json', PIXEL_URL = RELEASES + 'icons-2/pixel.json';
const OUTLINE = { source: 'Outline 1.0', license: 'MIT text', icons: [['home', 'house', '<path d="M1 1h2"/>']] };
const PIXEL = { source: 'Pixel 2.0', license: 'MIT text', icons: [['star', '', '<path d="M2 2h2"/>']] };
const fileBytes = data => Buffer.from(JSON.stringify(data) + '\n');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const catalogEntry = (url, data) => ({ url, bytes: fileBytes(data).length, sha256: sha256(fileBytes(data)), count: data.icons.length, source: data.source,
	homepage: 'https://example.test/', license: 'MIT', licenseUrl: 'https://example.test/LICENSE' });
const CATALOG = { sets: { outline: catalogEntry(OUTLINE_URL, OUTLINE), pixel: catalogEntry(PIXEL_URL, PIXEL) } };
// The states of a set (app.IconSets.State)
const State = { missing: 'missing', ready: 'ready', old: 'old' };

// The background page with a fetch that answers files[url] (a Buffer, an object for JSON, or a number: that HTTP status).
// fetch.calls: every URL asked for, with its options.
function setup(files = {}) {
	const sandbox = loadBackground();
	const served = { '/iconsets.json': CATALOG, [OUTLINE_URL]: fileBytes(OUTLINE), [PIXEL_URL]: fileBytes(PIXEL), ...files };
	const calls = [];
	sandbox.fetch = (url, options) => {
		calls.push([url, options]);
		const answer = served[url];
		if (answer === undefined) return Promise.reject(new TypeError('NetworkError when attempting to fetch resource.'));
		const status = typeof answer === 'number' ? answer : 200;
		const bytes = Buffer.isBuffer(answer) ? answer : Buffer.from(JSON.stringify(answer));
		return Promise.resolve({ ok: status === 200, status, headers: { get: () => null },
			json: () => Promise.resolve(JSON.parse(bytes)), arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)) });
	};
	sandbox.fetch.calls = calls;
	Object.assign(sandbox, { crypto: crypto.webcrypto, TextDecoder, URL });
	return sandbox;
}
const states = async IconSets => plain((await IconSets.list()).map(set => [set.name, set.state]));

test('every set is listed with where it comes from; none is downloaded to begin with', async () => {
	const { app, fetch, browser } = setup();
	assert.deepEqual(plain(await app.IconSets.list()), [
		{ name: 'outline', source: 'Outline 1.0', homepage: 'https://example.test/', license: 'MIT', licenseUrl: 'https://example.test/LICENSE',
			count: 1, bytes: CATALOG.sets.outline.bytes, state: State.missing, downloading: false },
		{ name: 'pixel', source: 'Pixel 2.0', homepage: 'https://example.test/', license: 'MIT', licenseUrl: 'https://example.test/LICENSE',
			count: 1, bytes: CATALOG.sets.pixel.bytes, state: State.missing, downloading: false }]);
	assert.deepEqual(fetch.calls.map(([url]) => url), ['/iconsets.json'], 'nothing is downloaded by itself');
	assert.equal(await app.IconSets.get('outline'), null);
	assert.deepEqual(Object.keys(browser.store), []);
});

test('a downloaded set is kept, listed as ready and read back; asked twice at once, it is downloaded once', async () => {
	const { app, fetch } = setup();
	await Promise.all([app.IconSets.download('outline'), app.IconSets.download('outline')]);
	const downloads = fetch.calls.filter(([url]) => url.startsWith(RELEASES));
	assert.equal(downloads.length, 1);
	assert.equal(downloads[0][0], OUTLINE_URL);
	assert.equal(downloads[0][1].credentials, 'omit', 'no cookies go with it');
	assert.deepEqual(await states(app.IconSets), [['outline', State.ready], ['pixel', State.missing]]);
	assert.deepEqual(plain(await app.IconSets.get('outline')), OUTLINE);
});

test('a file that isn\'t the expected one, or doesn\'t come, is refused and nothing is kept', async () => {
	const tampered = fileBytes({ ...OUTLINE, icons: [['home', 'house', '<path d="M9 9"/>']] });
	const sandbox = setup({ [OUTLINE_URL]: tampered, [PIXEL_URL]: 404 });
	const { app, browser } = sandbox, badFile = sandbox.QDCommon.text('propertiesIconSetBadFile');
	assert.ok(badFile.length > 0);
	await assert.rejects(app.IconSets.download('outline'), { message: badFile });
	await assert.rejects(app.IconSets.download('pixel'), { message: 'HTTP 404' });
	await assert.rejects(app.IconSets.download('retro'), /no icon set/);
	assert.deepEqual(Object.keys(browser.store), []);
	assert.deepEqual(await states(app.IconSets), [['outline', State.missing], ['pixel', State.missing]]);
	assert.equal((await app.IconSets.list())[0].downloading, false, 'no longer under way');
});

test('a set downloaded for an older iconsets.json is kept as old until updated; Remove forgets it', async () => {
	const { app, browser, fetch } = setup();
	await app.IconSets.download('pixel');
	assert.deepEqual(fetch.calls.filter(([url]) => url.startsWith(RELEASES)).map(([url]) => url), [PIXEL_URL], 'from the release iconsets.json names for this set');
	browser.store[app.IconSets.infoKey('pixel')].sha256 = '0'.repeat(64);
	assert.deepEqual(await states(app.IconSets), [['outline', State.missing], ['pixel', State.old]]);
	assert.deepEqual(plain(await app.IconSets.get('pixel')), PIXEL, 'still usable');
	await app.IconSets.download('pixel');
	assert.deepEqual(await states(app.IconSets), [['outline', State.missing], ['pixel', State.ready]]);
	await app.IconSets.remove('pixel');
	assert.deepEqual(await states(app.IconSets), [['outline', State.missing], ['pixel', State.missing]]);
	assert.deepEqual(Object.keys(browser.store), []);
});

test('iconsets.json that can\'t be read is read again next time', async () => {
	const sandbox = setup({ '/iconsets.json': 500 });
	await assert.rejects(sandbox.app.IconSets.list());
	sandbox.fetch = url => url === '/iconsets.json' ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(CATALOG) }) : Promise.reject(new Error(url));
	assert.equal((await sandbox.app.IconSets.list()).length, 2);
});
