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

const init = w => new Promise(r => w.app.Settings.init(r));

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
	assert.deepEqual([g.backNode, g.backIcon, g.backIconMode, g.folderIconMode, g.ratioX, g.ratioY, c.snapshotDelay], [true, 'url(/img/back.png)', 3, 0, 4, 3, 2000]);
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
	delete settings.grid.cells.hoverEffect; // a 0.4.0 key an older version didn't have
	Object.assign(w.browser.store, { version: 5, settings, node: { children: [] }, themes: [{ name: 'Mine', style: {} }, { name: 'Classic', style: {} }] });
	await init(w);
	await settle();
	assert.ok(!('startpageTimeout' in w.app.settings) && !('startpageTimeout' in w.browser.store.settings));
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
	w.app.Settings.save(() => done++);
	w.app.Settings.save(() => done++);
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

test('Themes.save keeps a clean list; an empty list removes the key', async () => {
	const w = loadBackground();
	const saved = await w.app.Themes.save([{ name: 'A', style: { grid: { cells: { blur: 100 } } } }, { name: 'a', style: {} }]);
	assert.deepEqual(plain(saved.map(t => t.name)), ['A']);
	assert.equal(w.browser.store.themes[0].style.grid.cells.blur, 40);
	await w.app.Themes.save([]);
	assert.ok(!('themes' in w.browser.store));
});
