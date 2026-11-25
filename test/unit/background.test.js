// Smaller parts of the background page and what all pages share:
//   QDCommon (js/common.js)                       message command numbers, node types, picture modes and CSS values
//   QDClient (js/common.js)                       the pages' messages: what each command sends, failures, listening
//   app.Backup (js/background/backup.js)          copying without transient fields, merging defaults,
//                                                 linking imported tiles to bookmarks
//   app.Images (js/background/images.js)          picture values, storage and cache
//   app.Bookmarks (js/background/bookmarks.js)    which events count, listening around our own changes
//
// Loaded into a sandbox with a fake browser API (./load.js). Picture re-encoding (canvas) needs a
// browser: integration/startup.js and backup.js cover it. A whole import is integration/backup.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, loadBackground, plain, settle } = require('./load');

// The node types of the tile tree (QDCommon.NodeType)
const NodeType = { empty: 0, folder: 1, bookmark: 2 };

test('QDCommon: every message command has its own number', () => {
	const { QDCommon } = load('js/common.js');
	const numbers = Object.values(QDCommon.Commands);
	assert.equal(new Set(numbers).size, numbers.length);
	assert.ok(Object.isFrozen(QDCommon.Commands) && Object.isFrozen(QDCommon.NodeType));
	assert.deepEqual(plain(QDCommon.NodeType), { back: -1, ...NodeType });
});

test('QDCommon: how a picture fills its box, and pictures as CSS values', () => {
	const { QDCommon } = load('js/common.js');
	const ImageMode = QDCommon.ImageMode;
	// The background repeat, size and position a mode sets
	const styleFor = mode => {
		const style = { backgroundRepeat: 'x', backgroundSize: 'x', backgroundPosition: 'x' };
		QDCommon.applyImageMode(mode, style);
		return [style.backgroundRepeat, style.backgroundSize, style.backgroundPosition];
	};
	assert.deepEqual(styleFor(ImageMode.stretch), ['no-repeat', '100% 100%', 'center']);
	assert.deepEqual(styleFor(String(ImageMode.cover)), ['no-repeat', 'cover', 'center'], 'a select\'s value works too');
	assert.deepEqual(styleFor(ImageMode.contain), ['no-repeat', 'contain', 'center']);
	assert.deepEqual(styleFor(ImageMode.original), ['no-repeat', 'auto', 'center']);
	assert.deepEqual(styleFor(ImageMode.inherit), ['', '', ''], 'inherit: back to the CSS rule underneath');
	assert.deepEqual(styleFor(7), styleFor(ImageMode.stretch), 'anything else: stretched');
	assert.equal(QDCommon.toCssUrl('data:image/webp;base64,AA'), 'url("data:image/webp;base64,AA")');
	assert.equal(QDCommon.toCssUrl('url(/img/folder.svg)'), 'url(/img/folder.svg)');
	assert.equal(QDCommon.toCssUrl('0'), null);
	assert.equal(QDCommon.toCssUrl(null), null);
	assert.equal(QDCommon.fromCssUrl(QDCommon.toCssUrl('data:image/webp;base64,AA')), 'data:image/webp;base64,AA');
	assert.equal(QDCommon.fromCssUrl(" url( 'data:x' ) "), 'data:x');
	assert.equal(QDCommon.fromCssUrl('data:x'), 'data:x');
	assert.equal(QDCommon.fromCssUrl(null), null);
});

test('QDCommon: the tile shape, with the default shape where a value is missing', () => {
	const { QDCommon } = load('js/common.js');
	const DEFAULT_RATIO = QDCommon.TILE_RATIO_Y / QDCommon.TILE_RATIO_X;
	assert.equal(QDCommon.tileRatio({ ratioX: 16, ratioY: 9 }), 9 / 16);
	assert.equal(QDCommon.tileRatio({ ratioX: '1', ratioY: '1' }), 1, 'form values work too');
	assert.equal(QDCommon.tileRatio({}), DEFAULT_RATIO);
	assert.equal(QDCommon.tileRatio({ ratioX: 0, ratioY: '' }), DEFAULT_RATIO, 'empty or zero: the default');
});

test('QDClient sends each command with its fields, answers failures with empty values, and listens', async () => {
	const sandbox = load('js/common.js'), { QDClient } = sandbox, Commands = sandbox.QDCommon.Commands;
	const sent = [], listeners = [];
	let failing = false;
	sandbox.browser.runtime.sendMessage = message => { sent.push(plain(message)); return failing ? Promise.reject(new Error('no page')) : Promise.resolve(message.cmd); };
	sandbox.browser.runtime.onMessage = { addListener: listener => listeners.push(listener) };
	await QDClient.updateNode('b1', { title: 'T' });
	await QDClient.setNodeIndex('/Work/', 2, 5);
	await QDClient.createBookmark('/', 'https://a.b/', 'https://a.b/');
	await QDClient.openSettings({ type: 'click' }); // a button handler's event is not a section
	await QDClient.openSettings('backup');
	assert.deepEqual(sent, [
		{ cmd: Commands.updateNode, id: 'b1', value: { title: 'T' } },
		{ cmd: Commands.setNodeIndex, path: '/Work/', index: 2, newIndex: 5 },
		{ cmd: Commands.createBookmark, path: '/', url: 'https://a.b/', title: 'https://a.b/' },
		{ cmd: Commands.openSettings, tab: null },
		{ cmd: Commands.openSettings, tab: 'backup' }
	]);
	failing = true;
	assert.deepEqual(plain(await QDClient.getImages(['b1'])), {});
	assert.deepEqual(plain(await QDClient.getThemes()), []);
	assert.equal(await QDClient.openSettings(), undefined);
	assert.equal(await QDClient.drawIcon({ image: 'data:image/svg+xml,x' }), null);
	assert.deepEqual(plain(await QDClient.iconSets()), []);
	assert.equal(await QDClient.iconSet('outline'), null);
	assert.deepEqual(plain(await QDClient.downloadIconSet('outline')), { error: 'no page', gone: false }, 'a download that can\'t be asked for says why');
	await assert.rejects(QDClient.getSettings(), 'other commands pass the failure on');

	const received = [];
	QDClient.listen({ [Commands.gridNodesLoaded]: message => received.push(message.cmd) });
	assert.equal(listeners.length, 1);
	const answers = [Commands.gridNodesLoaded, Commands.settingsChanged, Commands.getSettings].map(cmd => listeners[0]({ cmd }));
	assert.deepEqual(received, [Commands.gridNodesLoaded], 'only the commands it was given');
	assert.deepEqual(answers, [undefined, undefined, undefined], 'a page never answers in place of the background page');
});

test('Backup._clean copies without the "__" fields', () => {
	const sandbox = loadBackground();
	const source = { a: 1, __x: 2, n: { __isLoading: true, b: [1, { __y: 1, c: 2 }] } };
	assert.deepEqual(plain(sandbox.app.Backup._clean(source)), { a: 1, n: { b: [1, { c: 2 }] } });
	assert.equal(source.__x, 2, 'the original is untouched');
});

test('Backup._mergeDefaults: imported values win, missing ones come from the defaults', () => {
	const sandbox = loadBackground(), merged = (defaults, imported) => plain(sandbox.app.Backup._mergeDefaults(defaults, imported));
	assert.deepEqual(merged({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 9 }, e: 5 }), { a: 1, b: { c: 9, d: 3 }, e: 5 });
	assert.deepEqual(merged({ a: [1, 2] }, { a: [3] }), { a: [3] }, 'arrays are values, not merged');
	assert.deepEqual(merged({ a: { b: 1 } }, { a: null }), { a: null });
	assert.deepEqual(merged({ a: 1 }, undefined), { a: 1 });
});

test('Backup._attachBookmarks links tiles by id, then address or folder name, and creates the rest', async () => {
	const sandbox = loadBackground();
	const folder = { id: 'qd', children: [
		{ id: 'k1', type: 'bookmark', url: 'https://one.example/' },
		{ id: 'k2', type: 'bookmark', url: 'https://two.example/' },
		{ id: 'kf', type: 'folder', title: 'Work', children: [] }] };
	sandbox.browser.bookmarks.find('menu________').children.push(folder);
	const imported = { children: [
		{ id: 'old2', type: NodeType.bookmark, url: 'https://two.example/' }, // matched by address
		{ id: 'k1', type: NodeType.bookmark, url: 'https://one.example/' }, // matched by id
		{ type: NodeType.empty }, null, { type: NodeType.bookmark }, // gaps (a bookmark without address is unusable)
		{ id: 'oldf', type: NodeType.folder, title: 'Work', children: [{ id: 'x', type: NodeType.bookmark, url: 'https://inner.example/' }] },
		{ id: 'old9', type: NodeType.bookmark, title: 'Nine', url: 'https://nine.example/' },
		{ type: NodeType.empty }] };
	const idMap = {}, stats = { tiles: 0, folders: 0, matched: 0, created: 0 };
	await sandbox.app.Backup._attachBookmarks(imported, folder, idMap, stats);
	const cellIds = plain(imported.children.map(tile => tile.id || '-'));
	assert.deepEqual(cellIds.slice(0, 6), ['k2', 'k1', '-', '-', '-', 'kf']);
	assert.equal(imported.children.length, 7, 'the gap at the end is trimmed');
	assert.deepEqual(plain(stats), { tiles: 4, folders: 1, matched: 3, created: 2 });
	assert.equal(idMap.old2, 'k2');
	assert.equal(idMap.oldf, 'kf');
	assert.equal(idMap.old9, cellIds[6]);
	assert.equal(sandbox.browser.bookmarks.find(cellIds[6]).title, 'Nine');
	assert.equal(sandbox.browser.bookmarks.find(idMap.x).parentId, 'kf', 'inner bookmarks are created in the matched folder');
});

test('Images: unwrap, ids in a tree', () => {
	const { app } = loadBackground();
	assert.equal(app.Images.unwrap('url("data:image/png;base64,AA")'), 'data:image/png;base64,AA');
	assert.equal(app.Images.unwrap(" url( 'x.png' ) "), 'x.png');
	assert.equal(app.Images.unwrap('data:x'), 'data:x');
	assert.equal(app.Images.unwrap(null), null);
	const tree = { id: 'r', image: '1', children: [{ id: 'a', image: '0' }, { id: 'b', image: '1' }, { type: NodeType.empty }, { id: 'f', children: [{ id: 'c', image: '1' }] }] };
	assert.deepEqual(plain(app.Images.idsInTree(tree)), ['r', 'b', 'c']);
	assert.deepEqual(plain(app.Images.idsInTree(null)), []);
});

test('Images.setNodeImage stores, keeps, marks failed and removes pictures', async () => {
	const sandbox = loadBackground(), Images = sandbox.app.Images, store = sandbox.browser.store, calls = sandbox.browser.calls;
	const tile = { id: 'a' };
	await Images.setNodeImage(tile, 'url(data:image/webp;base64,AA)');
	assert.deepEqual([tile.image, store.img_a], ['1', 'data:image/webp;base64,AA']);
	calls.length = 0;
	await Images.setNodeImage(tile, 'data:image/webp;base64,AA');
	await Images.setNodeImage(tile, '1');
	assert.equal(calls.length, 0, 'the same picture again: not written');
	assert.deepEqual(plain(await Images.get(['a', 'zz'])), { a: 'data:image/webp;base64,AA' }, 'from the cache');
	Images._cache.clear();
	assert.deepEqual(plain(await Images.get(['a'])), { a: 'data:image/webp;base64,AA' }, 'from storage');
	await Images.setNodeImage(tile, '0');
	assert.deepEqual([tile.image, 'img_a' in store], ['0', false], 'failed: marked, old picture removed');
	await Images.setNodeImage(tile, null);
	assert.ok(!('image' in tile));
	calls.length = 0;
	await Images.setNodeImage(tile, null);
	assert.equal(calls.length, 0, 'no picture to remove: nothing written');
});

test('Bookmarks: events outside the tree are ignored; quietly() always listens again', async () => {
	const sandbox = loadBackground(), Bookmarks = sandbox.app.Bookmarks, changedListeners = sandbox.browser.bookmarks.onChanged.listeners;
	assert.ok(Bookmarks._isTracked('anything'), 'tree not loaded yet: everything counts');
	sandbox.app.node = { id: 'qd', children: [{ id: 'a' }, { id: 'f', children: [{ id: 'b' }] }] };
	assert.ok(Bookmarks._isTracked('b') && Bookmarks._isTracked('x', 'qd') && !Bookmarks._isTracked('x', 'y') && !Bookmarks._isTracked(undefined));
	Bookmarks.initListener();
	const answer = await Bookmarks.quietly('onChanged', () => { assert.ok(!changedListeners.has(Bookmarks._onChanged), 'not listening during the change'); return Promise.resolve(5); });
	assert.equal(answer, 5);
	assert.ok(changedListeners.has(Bookmarks._onChanged));
	await assert.rejects(Bookmarks.quietly('onChanged', () => Promise.reject(new Error('no'))));
	assert.ok(changedListeners.has(Bookmarks._onChanged), 'after a failed change');
	assert.throws(() => Bookmarks.quietly('onChanged', () => { throw new Error('sync'); }));
	assert.ok(changedListeners.has(Bookmarks._onChanged), 'after a change that threw');
	Bookmarks.removeListener();
	assert.equal(changedListeners.size, 0);
	await Bookmarks.update('a', { title: 'T' });
	await settle(0);
	assert.deepEqual(plain(sandbox.browser.calls.at(-1)), ['update', 'a', { title: 'T' }]);
});
