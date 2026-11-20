// app.Settings and app.Themes (js/background/settings.js): defaults, upgrades of data stored by older
// versions (the original Quick Dial's versions 1 to 4), the toolbar setting (0.5.0), loading and saving.
//
// Each test loads the background scripts into a fresh sandbox (./load.js loadBackground: everything but
// main.js, so nothing starts by itself) with a fake browser API: browser.store is storage.local, and
// browser.calls lists the writes, so "writes nothing" is a check of browser.calls. Saving is batched
// (100 ms): settle() waits for it.
// Related: the same upgrades through real restarts are integration tests (integration/startup.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackground, plain, settle } = require('./load');

const init = w => w.app.Settings.init();

test('defaults: layout of a new install with the Classic look', () => {
	const w = loadBackground(), d = w.app.Settings.defaults();
	assert.equal(d.toolbarAction, 'settings');
	assert.deepEqual([d.grid.rows, d.grid.columns, d.grid.ratioX, d.grid.ratioY, d.grid.root], [4, 5, 4, 3, 'Quick Dial']);
	assert.ok(w.QDThemes.equal(w.QDThemes.extract(d), w.QDThemes.CLASSIC));
	assert.notEqual(w.app.Settings.defaults(), d, 'a new object each time');
});

test('migrateToolbar: the old new-tab switch becomes toolbarAction', () => {
	const w = loadBackground(), m = s => [w.app.Settings.migrateToolbar(s), s.toolbarAction, 'openQuickDialInNewPage' in s];
	assert.deepEqual(m({}), [true, 'settings', false]);
	assert.deepEqual(m({ openQuickDialInNewPage: false }), [true, 'current', false]);
	assert.deepEqual(m({ openQuickDialInNewPage: true }), [true, 'newtab', false]);
	assert.deepEqual(m({ toolbarAction: 'bogus', openQuickDialInNewPage: true }), [true, 'newtab', false]);
	assert.deepEqual(m({ toolbarAction: 'current', openQuickDialInNewPage: true }), [true, 'current', false]);
	assert.deepEqual(m({ toolbarAction: 'current' }), [false, 'current', false]);
	assert.equal(w.app.Settings.migrateToolbar(null), false);
});

test('migrateIcons: the old loading picture setting goes (the spinner is built in)', () => {
	const w = loadBackground(), s = { grid: { backIcon: 'url(/img/back.svg)', loadingIcon: 'url(/img/throbber.gif)' } };
	assert.equal(w.app.Settings.migrateIcons(s), true);
	assert.deepEqual(plain(s.grid), { backIcon: 'url(/img/back.svg)' });
	assert.equal('loadingIcon' in w.app.Settings.defaults().grid, false);
});

test('migrateIcons: the old PNG folder and Back defaults become the SVG ones, own pictures stay', () => {
	const w = loadBackground(), m = grid => { const s = { grid }; return [w.app.Settings.migrateIcons(s), s.grid.backIcon, s.grid.folderIcon]; };
	assert.deepEqual(m({ backIcon: 'url(/img/back.png)', folderIcon: 'url(/img/folder.png)' }), [true, 'url(/img/back.svg)', 'url(/img/folder.svg)']);
	assert.deepEqual(m({ backIcon: 'url(data:image/png;base64,AA==)', folderIcon: 'url(/img/folder.png)' }), [true, 'url(data:image/png;base64,AA==)', 'url(/img/folder.svg)']);
	assert.deepEqual(m({ backIcon: 'url(/img/back.svg)', folderIcon: 'url(/img/folder.svg)' }), [false, 'url(/img/back.svg)', 'url(/img/folder.svg)']);
	assert.equal(w.app.Settings.migrateIcons(null), false);
	assert.equal(w.app.Settings.migrateIcons({}), false);
});

test('dropObsolete: the start page timer and the fixed picture size go; nothing else', () => {
	const w = loadBackground();
	const s = { startpageTimeout: 500, toolbarAction: 'newtab', grid: { rows: 2, cells: { previewWidth: 1200, previewHeight: 710, snapshotDelay: 500 } } };
	assert.equal(w.app.Settings.dropObsolete(s), true);
	assert.deepEqual(plain(s), { toolbarAction: 'newtab', grid: { rows: 2, cells: { snapshotDelay: 500 } } });
	assert.equal(w.app.Settings.dropObsolete(s), false, 'nothing left to drop');
	assert.equal(w.app.Settings.dropObsolete({ grid: {} }), false);
	assert.equal(w.app.Settings.dropObsolete(null), false);
	assert.equal('previewWidth' in w.app.Settings.defaults().grid.cells, false, 'not in new installs');
});

test('_upgrade: version 1 data (settings at the top, tiles inside them) reaches version 4', () => {
	const w = loadBackground();
	const v1 = { backgroundColor: '#000000', grid: { rows: 2, columns: 3, node: { children: [{ id: 'a', type: 2 }] },
		cells: { title: true, titleHeight: 20, titleFontSize: 11, backIcon: 'x', folderIcon: 'y', loadingIcon: 'z', backPanel: 1 } } };
	const d = plain(w.app.Settings._upgrade(v1));
	assert.equal(d.version, 4);
	assert.deepEqual(d.node, { children: [{ id: 'a', type: 2 }] }, 'the tiles move out of the settings');
	assert.equal(d.settings.grid.node, undefined);
	assert.equal(d.settings.version, undefined);
	const g = d.settings.grid, c = g.cells;
	assert.deepEqual([g.backNode, g.backIcon, g.backIconMode, g.folderIconMode, g.ratioX, g.ratioY, c.snapshotDelay], [true, 'url(/img/back.svg)', 3, 0, 4, 3, 2000]);
	assert.deepEqual([c.titleHover, c.titleHeightHover, c.titleFontSizeHover, c.opacity, c.borderSize], [true, 20, 11, 1, 1]);
	assert.ok(!('backIcon' in c) && !('backPanel' in c), 'icons moved from cells to grid');
	assert.deepEqual([d.settings.menuShowAdd, d.settings.openQuickDialInNewPage, g.openBookmarkMethod], [true, true, 0]);
	assert.ok(w.browser.calls.some(c => c[0] === 'clear'), 'version 2 storage is cleared before saving the new layout');
});

test('_upgrade: version 4 fields of the original 4.x releases', () => {
	const w = loadBackground();
	const d = plain(w.app.Settings._upgrade({ version: 4, node: {}, settings: { menuShowAdd: false, openQuickDialInNewPage: false,
		grid: { ratioAuto: true, ratioX: 16, ratioY: 9, openBookmarkMethod: 1, cells: { snapshotDelay: 500 } } } }));
	assert.deepEqual([d.settings.grid.ratioX, d.settings.grid.ratioY, 'ratioAuto' in d.settings.grid], [4, 3, false], 'automatic ratio: back to 4:3');
	assert.deepEqual([d.settings.menuShowAdd, d.settings.openQuickDialInNewPage, d.settings.grid.openBookmarkMethod, d.settings.grid.cells.snapshotDelay], [false, false, 1, 500], 'set values are kept');
});

test('init on an empty profile saves the defaults once', async () => {
	const w = loadBackground();
	await init(w);
	const s = w.browser.store;
	assert.equal(s.version, 5);
	assert.equal(s.settings.toolbarAction, 'settings');
	assert.ok(!('openQuickDialInNewPage' in s.settings));
	assert.deepEqual(plain(s.node), { children: [] });
	assert.equal(w.browser.calls.filter(c => c[0] === 'set').length, 1);
	assert.equal(w.localStorage.getItem('dialBackgroundColor'), '#3c4048', 'the colour the dial paints before settings load');
});

test('init: obsolete fields are dropped and saved once; nothing else is written', async () => {
	const w = loadBackground();
	const settings = w.app.Settings.defaults();
	settings.startpageTimeout = 500;
	Object.assign(settings.grid.cells, { previewWidth: 1200, previewHeight: 710 }); // the fixed picture size of older versions
	delete settings.grid.cells.hoverEffect; // a 0.4.0 key an older version didn't have
	Object.assign(w.browser.store, { version: 5, settings, node: { children: [] }, themes: [{ name: 'Mine', style: {} }, { name: 'Classic', style: {} }] });
	await init(w);
	await settle();
	assert.ok(!('startpageTimeout' in w.app.settings) && !('startpageTimeout' in w.browser.store.settings));
	assert.ok(!('previewWidth' in w.browser.store.settings.grid.cells) && !('previewHeight' in w.browser.store.settings.grid.cells));
	assert.equal(w.app.settings.grid.cells.hoverEffect, 0);
	assert.deepEqual(plain(w.app.Themes.list.map(t => t.name)), ['Mine']);
	const w2 = loadBackground();
	Object.assign(w2.browser.store, plain(w.browser.store));
	await init(w2);
	await settle();
	assert.equal(w2.browser.calls.length, 0, 'the next start writes nothing');
});

test('save is batched, skipped when nothing changed, and leaves out "__" fields', async () => {
	const w = loadBackground();
	await init(w);
	await settle();
	w.browser.calls.length = 0;
	w.app.node.children.push({ id: 'x', type: 2, __isLoading: true });
	let done = 0;
	w.app.Settings.save().then(() => done++);
	w.app.Settings.save().then(() => done++);
	await settle();
	assert.equal(done, 2);
	assert.equal(w.browser.calls.length, 1, 'one write for both');
	assert.deepEqual(plain(w.browser.store.node.children), [{ id: 'x', type: 2 }]);
	w.app.Settings.save();
	await settle();
	assert.equal(w.browser.calls.length, 1, 'unchanged: not written again');
	w.app.Settings.update(Object.assign(plain(w.app.settings), { backgroundColor: null }));
	await settle();
	assert.equal(w.localStorage.getItem('dialBackgroundColor'), null, 'no colour: nothing remembered');
});

// The sandbox's console, without the expected error messages of the tests below
const quiet = w => { w.console = { log() {}, warn() {}, error() {} }; };

test('init: a read of the stored data that fails is tried again', async () => {
	const w = loadBackground(), get = w.browser.storage.local.get;
	quiet(w);
	w.app.Settings.LOAD_RETRY_DELAY = 0;
	Object.assign(w.browser.store, { version: 5, settings: Object.assign(w.app.Settings.defaults(), { backgroundColor: '#123456' }), node: { children: [{ id: 'a', type: 2 }] } });
	let reads = 0;
	w.browser.storage.local.get = keys => ++reads == 1 ? Promise.reject(new Error('busy')) : get(keys);
	await init(w);
	assert.equal(reads, 2);
	assert.equal(w.app.settings.backgroundColor, '#123456');
	assert.deepEqual(plain(w.app.node), { children: [{ id: 'a', type: 2 }] });
});

test('init: stored data that can\'t be read at all: the defaults are used and nothing is saved over it until the user saves', async () => {
	const w = loadBackground();
	quiet(w);
	w.app.Settings.LOAD_RETRY_DELAY = 0;
	let reads = 0;
	w.browser.storage.local.get = () => { reads++; return Promise.reject(new Error('corrupt')); };
	await init(w); // resolves: the dial pages waiting on app.ready don't hang
	assert.equal(reads, 1 + w.app.Settings.LOAD_RETRIES);
	assert.equal(w.app.settings.toolbarAction, 'settings');
	assert.deepEqual(plain(w.app.node), { children: [] });
	w.app.node.children.push({ id: 'x', type: 2 }); // e.g. synced from the bookmarks
	const error = await w.app.Settings.save().then(() => null, e => e);
	assert.ok(error && error.message, 'the promise rejects with the reason');
	assert.equal(w.browser.calls.filter(c => c[0] === 'set').length, 0, 'nothing written');
	assert.equal(w.localStorage.getItem('dialBackgroundColor'), null, 'the default colour is not remembered as the user\'s');
	await w.app.Settings.update(Object.assign(plain(w.app.settings), { backgroundColor: '#000000' }));
	assert.equal(w.browser.store.settings.backgroundColor, '#000000', 'settings the user saves are written');
});

test('save: a failed write rejects with the error, and is written on the next save', async () => {
	const w = loadBackground();
	quiet(w);
	await init(w);
	await settle();
	const set = w.browser.storage.local.set;
	w.browser.storage.local.set = () => Promise.reject(new Error('disk full'));
	w.app.node.children.push({ id: 'x', type: 2 });
	const error = await w.app.Settings.save().then(() => null, e => e);
	assert.equal(error && error.message, 'disk full');
	w.browser.storage.local.set = set;
	await w.app.Settings.save();
	assert.deepEqual(plain(w.browser.store.node.children), [{ id: 'x', type: 2 }]);
});

// ----- pictures picked in Settings: their own storage keys -----
const BG = 'url(data:image/png;base64,QkFDSw==)', ICON = 'url(data:image/png;base64,SUNPTg==)', BG2 = 'url(data:image/png;base64,TkVX)';
const writes = w => w.browser.calls.filter(c => c[0] === 'set' || c[0] === 'remove');

test('pictures: stored under their own keys, "1" in the stored settings; a tile change doesn\'t write them again', async () => {
	const w = loadBackground();
	await init(w);
	await settle();
	const s = plain(w.app.settings);
	s.backgroundImage = BG;
	s.grid.folderIcon = ICON;
	await w.app.Settings.update(s);
	const st = w.browser.store;
	assert.equal(st.picture_background, BG);
	assert.equal(st.picture_folderIcon, ICON);
	assert.ok(!('picture_backIcon' in st), 'the built-in Back icon stays in the settings');
	assert.deepEqual([st.settings.backgroundImage, st.settings.grid.folderIcon, st.settings.grid.backIcon], ['1', '1', 'url(/img/back.svg)']);
	assert.equal(w.app.settings.backgroundImage, BG, 'the pages still get the picture itself');
	w.browser.calls.length = 0;
	w.app.node.children.push({ id: 'x', type: 2 });
	await w.app.Settings.save();
	assert.deepEqual(plain(writes(w)), [['set', ['version', 'settings', 'node']]], 'only settings and tiles are written');
	const w2 = loadBackground();
	Object.assign(w2.browser.store, plain(st));
	await init(w2);
	await settle();
	assert.deepEqual([w2.app.settings.backgroundImage, w2.app.settings.grid.folderIcon], [BG, ICON], 'the next start puts them back');
	assert.equal(w2.browser.calls.length, 0, 'and writes nothing');
});

test('pictures: a changed one is written alone; a cleared one is removed', async () => {
	const w = loadBackground();
	await init(w);
	await settle();
	await w.app.Settings.update(Object.assign(plain(w.app.settings), { backgroundImage: BG }));
	const s = plain(w.app.settings);
	s.grid.backIcon = ICON;
	w.browser.calls.length = 0;
	await w.app.Settings.update(s);
	assert.deepEqual(plain(writes(w)), [['set', ['version', 'settings', 'node', 'picture_backIcon']]], 'the unchanged background is not written again');
	w.browser.calls.length = 0;
	await w.app.Settings.update(Object.assign(plain(w.app.settings), { backgroundImage: BG2 }));
	assert.deepEqual(plain(writes(w)), [['set', ['picture_background']]], 'a new picture alone: the settings still say "1"');
	w.browser.calls.length = 0;
	const cleared = plain(w.app.settings);
	cleared.backgroundImage = null;
	cleared.grid.backIcon = 'url(/img/back.svg)';
	await w.app.Settings.update(cleared);
	assert.deepEqual(plain(writes(w)), [['set', ['version', 'settings', 'node']], ['remove', ['picture_background', 'picture_backIcon']]]);
	assert.ok(!Object.keys(w.browser.store).some(k => k.startsWith('picture_')));
});

test('pictures: inline in the stored settings (older versions) move to their own keys once', async () => {
	const w = loadBackground();
	const settings = Object.assign(w.app.Settings.defaults(), { backgroundImage: BG });
	settings.grid.backIcon = ICON;
	Object.assign(w.browser.store, { version: 5, settings, node: { children: [] } });
	await init(w);
	await settle();
	const st = w.browser.store;
	assert.deepEqual([st.settings.backgroundImage, st.settings.grid.backIcon, st.picture_background, st.picture_backIcon], ['1', '1', BG, ICON]);
	assert.deepEqual([w.app.settings.backgroundImage, w.app.settings.grid.backIcon], [BG, ICON]);
	const w2 = loadBackground();
	Object.assign(w2.browser.store, plain(st));
	await init(w2);
	await settle();
	assert.equal(w2.browser.calls.length, 0, 'the next start writes nothing');
});

test('pictures: a missing one falls back to the default; one nothing points at is removed', async () => {
	const w = loadBackground();
	quiet(w);
	const settings = Object.assign(w.app.Settings.defaults(), { backgroundImage: '1' });
	settings.grid.folderIcon = '1';
	Object.assign(w.browser.store, { version: 5, settings, node: { children: [] }, picture_backIcon: ICON });
	await init(w);
	await settle();
	assert.deepEqual([w.app.settings.backgroundImage, w.app.settings.grid.folderIcon, w.app.settings.grid.backIcon], [null, 'url(/img/folder.svg)', 'url(/img/back.svg)']);
	assert.ok(!('picture_backIcon' in w.browser.store), 'the stray picture is removed');
	assert.equal(w.browser.store.settings.grid.folderIcon, 'url(/img/folder.svg)');
});

test('Themes.save keeps a clean list; an empty list removes the key', async () => {
	const w = loadBackground();
	const saved = await w.app.Themes.save([{ name: 'A', style: { grid: { cells: { blur: 100 } } } }, { name: 'a', style: {} }]);
	assert.deepEqual(plain(saved.map(t => t.name)), ['A']);
	assert.equal(w.browser.store.themes[0].style.grid.cells.blur, 40);
	await w.app.Themes.save([]);
	assert.ok(!('themes' in w.browser.store));
});
