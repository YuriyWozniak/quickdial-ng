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

// The node types of the tile tree (QDCommon.NodeType)
const NodeType = { bookmark: 2 };
// What Settings.init stores as the current data version
const DATA_VERSION = 5;
const init = sandbox => sandbox.app.Settings.init();
// A second background page started on a copy of the first one's storage, as after a restart
async function restartedFrom(sandbox) {
	const restarted = loadBackground();
	Object.assign(restarted.browser.store, plain(sandbox.browser.store));
	await init(restarted);
	await settle();
	return restarted;
}

test('defaults: layout of a new install with the Classic look', () => {
	const sandbox = loadBackground(), defaults = sandbox.app.Settings.defaults(), grid = defaults.grid;
	assert.equal(defaults.toolbarAction, 'settings');
	assert.deepEqual([grid.rows, grid.columns, grid.ratioX, grid.ratioY, grid.root], [4, 5, 4, 3, 'Quick Dial']);
	assert.ok(sandbox.QDThemes.equal(sandbox.QDThemes.extract(defaults), sandbox.QDThemes.CLASSIC));
	assert.notEqual(sandbox.app.Settings.defaults(), defaults, 'a new object each time');
});

test('migrateToolbar: the old new-tab switch becomes toolbarAction', () => {
	const sandbox = loadBackground();
	// [whether it changed something, toolbarAction afterwards, whether the old switch is still there]
	const migrated = settings => [sandbox.app.Settings.migrateToolbar(settings), settings.toolbarAction, 'openQuickDialInNewPage' in settings];
	assert.deepEqual(migrated({}), [true, 'settings', false]);
	assert.deepEqual(migrated({ openQuickDialInNewPage: false }), [true, 'current', false]);
	assert.deepEqual(migrated({ openQuickDialInNewPage: true }), [true, 'newtab', false]);
	assert.deepEqual(migrated({ toolbarAction: 'bogus', openQuickDialInNewPage: true }), [true, 'newtab', false]);
	assert.deepEqual(migrated({ toolbarAction: 'current', openQuickDialInNewPage: true }), [true, 'current', false]);
	assert.deepEqual(migrated({ toolbarAction: 'current' }), [false, 'current', false]);
	assert.equal(sandbox.app.Settings.migrateToolbar(null), false);
});

test('migrateIcons: the old loading picture setting goes (the spinner is built in)', () => {
	const sandbox = loadBackground(), settings = { grid: { backIcon: 'url(/img/back.svg)', loadingIcon: 'url(/img/throbber.gif)' } };
	assert.equal(sandbox.app.Settings.migrateIcons(settings), true);
	assert.deepEqual(plain(settings.grid), { backIcon: 'url(/img/back.svg)' });
	assert.equal('loadingIcon' in sandbox.app.Settings.defaults().grid, false);
});

test('migrateIcons: the old PNG folder and Back defaults become the SVG ones, own pictures stay', () => {
	const sandbox = loadBackground();
	// [whether it changed something, the Back icon, the folder icon]
	const migrated = grid => { const settings = { grid }; return [sandbox.app.Settings.migrateIcons(settings), settings.grid.backIcon, settings.grid.folderIcon]; };
	assert.deepEqual(migrated({ backIcon: 'url(/img/back.png)', folderIcon: 'url(/img/folder.png)' }), [true, 'url(/img/back.svg)', 'url(/img/folder.svg)']);
	assert.deepEqual(migrated({ backIcon: 'url(data:image/png;base64,AA==)', folderIcon: 'url(/img/folder.png)' }), [true, 'url(data:image/png;base64,AA==)', 'url(/img/folder.svg)']);
	assert.deepEqual(migrated({ backIcon: 'url(/img/back.svg)', folderIcon: 'url(/img/folder.svg)' }), [false, 'url(/img/back.svg)', 'url(/img/folder.svg)']);
	assert.equal(sandbox.app.Settings.migrateIcons(null), false);
	assert.equal(sandbox.app.Settings.migrateIcons({}), false);
});

test('dropObsolete: the start page timer and the fixed picture size go; nothing else', () => {
	const sandbox = loadBackground();
	const settings = { startpageTimeout: 500, toolbarAction: 'newtab', grid: { rows: 2, cells: { previewWidth: 1200, previewHeight: 710, snapshotDelay: 500 } } };
	assert.equal(sandbox.app.Settings.dropObsolete(settings), true);
	assert.deepEqual(plain(settings), { toolbarAction: 'newtab', grid: { rows: 2, cells: { snapshotDelay: 500 } } });
	assert.equal(sandbox.app.Settings.dropObsolete(settings), false, 'nothing left to drop');
	assert.equal(sandbox.app.Settings.dropObsolete({ grid: {} }), false);
	assert.equal(sandbox.app.Settings.dropObsolete(null), false);
	assert.equal('previewWidth' in sandbox.app.Settings.defaults().grid.cells, false, 'not in new installs');
});

test('addMissing: what new tiles get starts as a screenshot; a value this version doesn\'t know is replaced', () => {
	const sandbox = loadBackground(), TilePicture = sandbox.QDCommon.TilePicture;
	// [whether it changed something, grid.newTilePicture afterwards]
	const completed = grid => { const settings = { grid }; return [sandbox.app.Settings.addMissing(settings), settings.grid.newTilePicture]; };
	assert.deepEqual(completed({}), [true, TilePicture.page]);
	assert.deepEqual(completed({ newTilePicture: 7 }), [true, TilePicture.page]);
	assert.deepEqual(completed({ newTilePicture: '1' }), [true, TilePicture.page], 'a number, not text');
	assert.deepEqual(completed({ newTilePicture: TilePicture.siteIconOrPage }), [false, TilePicture.siteIconOrPage]);
	assert.equal(sandbox.app.Settings.addMissing(null), false);
	assert.equal(sandbox.app.Settings.defaults().grid.newTilePicture, TilePicture.page, 'a new install');
});

test('_upgrade: version 1 data (settings at the top, tiles inside them) reaches version 4', () => {
	const sandbox = loadBackground();
	const version1 = { backgroundColor: '#000000', grid: { rows: 2, columns: 3, node: { children: [{ id: 'a', type: NodeType.bookmark }] },
		cells: { title: true, titleHeight: 20, titleFontSize: 11, backIcon: 'x', folderIcon: 'y', loadingIcon: 'z', backPanel: 1 } } };
	const upgraded = plain(sandbox.app.Settings._upgrade(version1));
	assert.equal(upgraded.version, 4);
	assert.deepEqual(upgraded.node, { children: [{ id: 'a', type: NodeType.bookmark }] }, 'the tiles move out of the settings');
	assert.equal(upgraded.settings.grid.node, undefined);
	assert.equal(upgraded.settings.version, undefined);
	const grid = upgraded.settings.grid, cells = grid.cells;
	assert.deepEqual([grid.backNode, grid.backIcon, grid.backIconMode, grid.folderIconMode, grid.ratioX, grid.ratioY, cells.snapshotDelay], [true, 'url(/img/back.svg)', 3, 0, 4, 3, 2000]);
	assert.deepEqual([cells.titleHover, cells.titleHeightHover, cells.titleFontSizeHover, cells.opacity, cells.borderSize], [true, 20, 11, 1, 1]);
	assert.ok(!('backIcon' in cells) && !('backPanel' in cells), 'icons moved from cells to grid');
	assert.deepEqual([upgraded.settings.menuShowAdd, upgraded.settings.openQuickDialInNewPage, grid.openBookmarkMethod], [true, true, 0]);
	assert.ok(sandbox.browser.calls.some(call => call[0] === 'clear'), 'version 2 storage is cleared before saving the new layout');
});

test('_upgrade: version 4 fields of the original 4.x releases', () => {
	const sandbox = loadBackground();
	const upgraded = plain(sandbox.app.Settings._upgrade({ version: 4, node: {}, settings: { menuShowAdd: false, openQuickDialInNewPage: false,
		grid: { ratioAuto: true, ratioX: 16, ratioY: 9, openBookmarkMethod: 1, cells: { snapshotDelay: 500 } } } }));
	const settings = upgraded.settings, grid = settings.grid;
	assert.deepEqual([grid.ratioX, grid.ratioY, 'ratioAuto' in grid], [4, 3, false], 'automatic ratio: back to 4:3');
	assert.deepEqual([settings.menuShowAdd, settings.openQuickDialInNewPage, grid.openBookmarkMethod, grid.cells.snapshotDelay], [false, false, 1, 500], 'set values are kept');
});

test('init on an empty profile saves the defaults once', async () => {
	const sandbox = loadBackground();
	await init(sandbox);
	const store = sandbox.browser.store;
	assert.equal(store.version, DATA_VERSION);
	assert.equal(store.settings.toolbarAction, 'settings');
	assert.ok(!('openQuickDialInNewPage' in store.settings));
	assert.deepEqual(plain(store.node), { children: [] });
	assert.equal(sandbox.browser.calls.filter(call => call[0] === 'set').length, 1);
	assert.equal(sandbox.localStorage.getItem('dialBackgroundColor'), '#3c4048', 'the colour the dial paints before settings load');
});

test('init: obsolete fields are dropped and saved once; nothing else is written', async () => {
	const sandbox = loadBackground();
	const settings = sandbox.app.Settings.defaults();
	settings.startpageTimeout = 500;
	Object.assign(settings.grid.cells, { previewWidth: 1200, previewHeight: 710 }); // the fixed picture size of older versions
	delete settings.grid.cells.hoverEffect; // a 0.4.0 key an older version didn't have
	Object.assign(sandbox.browser.store, { version: DATA_VERSION, settings, node: { children: [] }, themes: [{ name: 'Mine', style: {} }, { name: 'Classic', style: {} }] });
	await init(sandbox);
	await settle();
	const storedCells = sandbox.browser.store.settings.grid.cells;
	assert.ok(!('startpageTimeout' in sandbox.app.settings) && !('startpageTimeout' in sandbox.browser.store.settings));
	assert.ok(!('previewWidth' in storedCells) && !('previewHeight' in storedCells));
	assert.equal(sandbox.app.settings.grid.cells.hoverEffect, 0);
	assert.deepEqual(plain(sandbox.app.Themes.list.map(theme => theme.name)), ['Mine']);
	const restarted = await restartedFrom(sandbox);
	assert.equal(restarted.browser.calls.length, 0, 'the next start writes nothing');
});

test('save is batched, skipped when nothing changed, and leaves out "__" fields', async () => {
	const sandbox = loadBackground();
	await init(sandbox);
	await settle();
	sandbox.browser.calls.length = 0;
	sandbox.app.node.children.push({ id: 'x', type: NodeType.bookmark, __isLoading: true });
	let saved = 0;
	sandbox.app.Settings.save().then(() => saved++);
	sandbox.app.Settings.save().then(() => saved++);
	await settle();
	assert.equal(saved, 2);
	assert.equal(sandbox.browser.calls.length, 1, 'one write for both');
	assert.deepEqual(plain(sandbox.browser.store.node.children), [{ id: 'x', type: NodeType.bookmark }]);
	sandbox.app.Settings.save();
	await settle();
	assert.equal(sandbox.browser.calls.length, 1, 'unchanged: not written again');
	sandbox.app.Settings.update(Object.assign(plain(sandbox.app.settings), { backgroundColor: null }));
	await settle();
	assert.equal(sandbox.localStorage.getItem('dialBackgroundColor'), null, 'no colour: nothing remembered');
});

// The sandbox's console, without the expected error messages of the tests below
const silenceConsole = sandbox => { sandbox.console = { log() {}, warn() {}, error() {} }; };
// A promise's rejection reason, or null if it resolved
const rejectionOf = promise => promise.then(() => null, error => error);

test('init: a read of the stored data that fails is tried again', async () => {
	const sandbox = loadBackground(), workingGet = sandbox.browser.storage.local.get;
	silenceConsole(sandbox);
	sandbox.app.Settings.LOAD_RETRY_DELAY = 0;
	Object.assign(sandbox.browser.store, { version: DATA_VERSION, settings: Object.assign(sandbox.app.Settings.defaults(), { backgroundColor: '#123456' }),
		node: { children: [{ id: 'a', type: NodeType.bookmark }] } });
	let reads = 0;
	sandbox.browser.storage.local.get = keys => ++reads == 1 ? Promise.reject(new Error('busy')) : workingGet(keys);
	await init(sandbox);
	assert.equal(reads, 2);
	assert.equal(sandbox.app.settings.backgroundColor, '#123456');
	assert.deepEqual(plain(sandbox.app.node), { children: [{ id: 'a', type: NodeType.bookmark }] });
});

test('init: stored data that can\'t be read at all: the defaults are used and nothing is saved over it until the user saves', async () => {
	const sandbox = loadBackground();
	silenceConsole(sandbox);
	sandbox.app.Settings.LOAD_RETRY_DELAY = 0;
	let reads = 0;
	sandbox.browser.storage.local.get = () => { reads++; return Promise.reject(new Error('corrupt')); };
	await init(sandbox); // resolves: the dial pages waiting on app.ready don't hang
	assert.equal(reads, 1 + sandbox.app.Settings.LOAD_RETRIES);
	assert.equal(sandbox.app.settings.toolbarAction, 'settings');
	assert.deepEqual(plain(sandbox.app.node), { children: [] });
	sandbox.app.node.children.push({ id: 'x', type: NodeType.bookmark }); // e.g. synced from the bookmarks
	const error = await rejectionOf(sandbox.app.Settings.save());
	assert.ok(error && error.message, 'the promise rejects with the reason');
	assert.equal(sandbox.browser.calls.filter(call => call[0] === 'set').length, 0, 'nothing written');
	assert.equal(sandbox.localStorage.getItem('dialBackgroundColor'), null, 'the default colour is not remembered as the user\'s');
	await sandbox.app.Settings.update(Object.assign(plain(sandbox.app.settings), { backgroundColor: '#000000' }));
	assert.equal(sandbox.browser.store.settings.backgroundColor, '#000000', 'settings the user saves are written');
});

test('save: a failed write rejects with the error, and is written on the next save', async () => {
	const sandbox = loadBackground();
	silenceConsole(sandbox);
	await init(sandbox);
	await settle();
	const workingSet = sandbox.browser.storage.local.set;
	sandbox.browser.storage.local.set = () => Promise.reject(new Error('disk full'));
	sandbox.app.node.children.push({ id: 'x', type: NodeType.bookmark });
	const error = await rejectionOf(sandbox.app.Settings.save());
	assert.equal(error && error.message, 'disk full');
	sandbox.browser.storage.local.set = workingSet;
	await sandbox.app.Settings.save();
	assert.deepEqual(plain(sandbox.browser.store.node.children), [{ id: 'x', type: NodeType.bookmark }]);
});

// ----- pictures picked in Settings: their own storage keys -----
const BACKGROUND_PICTURE = 'url(data:image/png;base64,QkFDSw==)', ICON_PICTURE = 'url(data:image/png;base64,SUNPTg==)', NEW_BACKGROUND_PICTURE = 'url(data:image/png;base64,TkVX)';
// The writes to storage (set and remove calls) since browser.calls was emptied
const storageWrites = sandbox => sandbox.browser.calls.filter(call => call[0] === 'set' || call[0] === 'remove');

test('pictures: stored under their own keys, "1" in the stored settings; a tile change doesn\'t write them again', async () => {
	const sandbox = loadBackground();
	await init(sandbox);
	await settle();
	const settings = plain(sandbox.app.settings);
	settings.backgroundImage = BACKGROUND_PICTURE;
	settings.grid.folderIcon = ICON_PICTURE;
	await sandbox.app.Settings.update(settings);
	const store = sandbox.browser.store;
	assert.equal(store.picture_background, BACKGROUND_PICTURE);
	assert.equal(store.picture_folderIcon, ICON_PICTURE);
	assert.ok(!('picture_backIcon' in store), 'the built-in Back icon stays in the settings');
	assert.deepEqual([store.settings.backgroundImage, store.settings.grid.folderIcon, store.settings.grid.backIcon], ['1', '1', 'url(/img/back.svg)']);
	assert.equal(sandbox.app.settings.backgroundImage, BACKGROUND_PICTURE, 'the pages still get the picture itself');
	sandbox.browser.calls.length = 0;
	sandbox.app.node.children.push({ id: 'x', type: NodeType.bookmark });
	await sandbox.app.Settings.save();
	assert.deepEqual(plain(storageWrites(sandbox)), [['set', ['version', 'settings', 'node']]], 'only settings and tiles are written');
	const restarted = await restartedFrom(sandbox);
	assert.deepEqual([restarted.app.settings.backgroundImage, restarted.app.settings.grid.folderIcon], [BACKGROUND_PICTURE, ICON_PICTURE], 'the next start puts them back');
	assert.equal(restarted.browser.calls.length, 0, 'and writes nothing');
});

test('pictures: a changed one is written alone; a cleared one is removed', async () => {
	const sandbox = loadBackground();
	await init(sandbox);
	await settle();
	await sandbox.app.Settings.update(Object.assign(plain(sandbox.app.settings), { backgroundImage: BACKGROUND_PICTURE }));
	const withIcon = plain(sandbox.app.settings);
	withIcon.grid.backIcon = ICON_PICTURE;
	sandbox.browser.calls.length = 0;
	await sandbox.app.Settings.update(withIcon);
	assert.deepEqual(plain(storageWrites(sandbox)), [['set', ['version', 'settings', 'node', 'picture_backIcon']]], 'the unchanged background is not written again');
	sandbox.browser.calls.length = 0;
	await sandbox.app.Settings.update(Object.assign(plain(sandbox.app.settings), { backgroundImage: NEW_BACKGROUND_PICTURE }));
	assert.deepEqual(plain(storageWrites(sandbox)), [['set', ['picture_background']]], 'a new picture alone: the settings still say "1"');
	sandbox.browser.calls.length = 0;
	const cleared = plain(sandbox.app.settings);
	cleared.backgroundImage = null;
	cleared.grid.backIcon = 'url(/img/back.svg)';
	await sandbox.app.Settings.update(cleared);
	assert.deepEqual(plain(storageWrites(sandbox)), [['set', ['version', 'settings', 'node']], ['remove', ['picture_background', 'picture_backIcon']]]);
	assert.ok(!Object.keys(sandbox.browser.store).some(key => key.startsWith('picture_')));
});

test('pictures: inline in the stored settings (older versions) move to their own keys once', async () => {
	const sandbox = loadBackground();
	const settings = Object.assign(sandbox.app.Settings.defaults(), { backgroundImage: BACKGROUND_PICTURE });
	settings.grid.backIcon = ICON_PICTURE;
	Object.assign(sandbox.browser.store, { version: DATA_VERSION, settings, node: { children: [] } });
	await init(sandbox);
	await settle();
	const store = sandbox.browser.store;
	assert.deepEqual([store.settings.backgroundImage, store.settings.grid.backIcon, store.picture_background, store.picture_backIcon], ['1', '1', BACKGROUND_PICTURE, ICON_PICTURE]);
	assert.deepEqual([sandbox.app.settings.backgroundImage, sandbox.app.settings.grid.backIcon], [BACKGROUND_PICTURE, ICON_PICTURE]);
	const restarted = await restartedFrom(sandbox);
	assert.equal(restarted.browser.calls.length, 0, 'the next start writes nothing');
});

test('pictures: a missing one falls back to the default; one nothing points at is removed', async () => {
	const sandbox = loadBackground();
	silenceConsole(sandbox);
	const settings = Object.assign(sandbox.app.Settings.defaults(), { backgroundImage: '1' });
	settings.grid.folderIcon = '1';
	Object.assign(sandbox.browser.store, { version: DATA_VERSION, settings, node: { children: [] }, 'picture_backIcon': ICON_PICTURE }); // a storage key, named as in Settings.PICTURES
	await init(sandbox);
	await settle();
	const grid = sandbox.app.settings.grid;
	assert.deepEqual([sandbox.app.settings.backgroundImage, grid.folderIcon, grid.backIcon], [null, 'url(/img/folder.svg)', 'url(/img/back.svg)']);
	assert.ok(!('picture_backIcon' in sandbox.browser.store), 'the stray picture is removed');
	assert.equal(sandbox.browser.store.settings.grid.folderIcon, 'url(/img/folder.svg)');
});

test('Themes.save keeps a clean list; an empty list removes the key', async () => {
	const sandbox = loadBackground();
	const saved = await sandbox.app.Themes.save([{ name: 'A', style: { grid: { cells: { blur: 100 } } } }, { name: 'a', style: {} }]);
	assert.deepEqual(plain(saved.map(theme => theme.name)), ['A']);
	assert.equal(sandbox.browser.store.themes[0].style.grid.cells.blur, 40);
	await sandbox.app.Themes.save([]);
	assert.ok(!('themes' in sandbox.browser.store));
});
