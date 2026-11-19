// Smaller parts of the background page: backup helpers, pictures, bookmark listeners, shared constants.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, loadBackground, plain, settle } = require('./load');

test('QDCommon: every message command has its own number', () => {
	const { QDCommon } = load('js/common.js');
	const numbers = Object.values(QDCommon.Commands);
	assert.equal(new Set(numbers).size, numbers.length);
	assert.ok(Object.isFrozen(QDCommon.Commands) && Object.isFrozen(QDCommon.NodeType));
	assert.deepEqual(plain(QDCommon.NodeType), { back: -1, empty: 0, folder: 1, bookmark: 2 });
});

test('Backup._clean copies without the "__" fields', () => {
	const w = loadBackground();
	const source = { a: 1, __x: 2, n: { __isLoading: true, b: [1, { __y: 1, c: 2 }] } };
	assert.deepEqual(plain(w.app.Backup._clean(source)), { a: 1, n: { b: [1, { c: 2 }] } });
	assert.equal(source.__x, 2, 'the original is untouched');
});

test('Backup._mergeDefaults: imported values win, missing ones come from the defaults', () => {
	const w = loadBackground(), m = (d, v) => plain(w.app.Backup._mergeDefaults(d, v));
	assert.deepEqual(m({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 9 }, e: 5 }), { a: 1, b: { c: 9, d: 3 }, e: 5 });
	assert.deepEqual(m({ a: [1, 2] }, { a: [3] }), { a: [3] }, 'arrays are values, not merged');
	assert.deepEqual(m({ a: { b: 1 } }, { a: null }), { a: null });
	assert.deepEqual(m({ a: 1 }, undefined), { a: 1 });
});

test('Backup._attachBookmarks links tiles by id, then address or folder name, and creates the rest', async () => {
	const w = loadBackground();
	const folder = { id: 'qd', children: [
		{ id: 'k1', type: 'bookmark', url: 'https://one.example/' },
		{ id: 'k2', type: 'bookmark', url: 'https://two.example/' },
		{ id: 'kf', type: 'folder', title: 'Work', children: [] }] };
	w.browser.bookmarks.find('menu________').children.push(folder);
	const node = { children: [
		{ id: 'old2', type: 2, url: 'https://two.example/' }, // matched by address
		{ id: 'k1', type: 2, url: 'https://one.example/' }, // matched by id
		{ type: 0 }, null, { type: 2 }, // gaps (a bookmark without address is unusable)
		{ id: 'oldf', type: 1, title: 'Work', children: [{ id: 'x', type: 2, url: 'https://inner.example/' }] },
		{ id: 'old9', type: 2, title: 'Nine', url: 'https://nine.example/' },
		{ type: 0 }] };
	const idMap = {}, stats = { tiles: 0, folders: 0, matched: 0, created: 0 };
	await w.app.Backup._attachBookmarks(node, folder, idMap, stats);
	const r = plain(node.children.map(c => c.id || '-'));
	assert.deepEqual(r.slice(0, 6), ['k2', 'k1', '-', '-', '-', 'kf']);
	assert.equal(node.children.length, 7, 'the gap at the end is trimmed');
	assert.deepEqual(plain(stats), { tiles: 4, folders: 1, matched: 3, created: 2 });
	assert.equal(idMap.old2, 'k2');
	assert.equal(idMap.oldf, 'kf');
	assert.equal(idMap.old9, r[6]);
	assert.equal(w.browser.bookmarks.find(r[6]).title, 'Nine');
	assert.equal(w.browser.bookmarks.find(idMap.x).parentId, 'kf', 'inner bookmarks are created in the matched folder');
});

test('Images: unwrap, ids in a tree', () => {
	const { app } = loadBackground();
	assert.equal(app.Images.unwrap('url("data:image/png;base64,AA")'), 'data:image/png;base64,AA');
	assert.equal(app.Images.unwrap(" url( 'x.png' ) "), 'x.png');
	assert.equal(app.Images.unwrap('data:x'), 'data:x');
	assert.equal(app.Images.unwrap(null), null);
	const tree = { id: 'r', image: '1', children: [{ id: 'a', image: '0' }, { id: 'b', image: '1' }, { type: 0 }, { id: 'f', children: [{ id: 'c', image: '1' }] }] };
	assert.deepEqual(plain(app.Images.idsInTree(tree)), ['r', 'b', 'c']);
	assert.deepEqual(plain(app.Images.idsInTree(null)), []);
});

test('Images.setNodeImage stores, keeps, marks failed and removes pictures', async () => {
	const w = loadBackground(), I = w.app.Images, store = w.browser.store, calls = w.browser.calls;
	const n = { id: 'a' };
	await I.setNodeImage(n, 'url(data:image/webp;base64,AA)');
	assert.deepEqual([n.image, store.img_a], ['1', 'data:image/webp;base64,AA']);
	calls.length = 0;
	await I.setNodeImage(n, 'data:image/webp;base64,AA');
	await I.setNodeImage(n, '1');
	assert.equal(calls.length, 0, 'the same picture again: not written');
	assert.deepEqual(plain(await I.get(['a', 'zz'])), { a: 'data:image/webp;base64,AA' }, 'from the cache');
	I._cache.clear();
	assert.deepEqual(plain(await I.get(['a'])), { a: 'data:image/webp;base64,AA' }, 'from storage');
	await I.setNodeImage(n, '0');
	assert.deepEqual([n.image, 'img_a' in store], ['0', false], 'failed: marked, old picture removed');
	await I.setNodeImage(n, null);
	assert.ok(!('image' in n));
	calls.length = 0;
	await I.setNodeImage(n, null);
	assert.equal(calls.length, 0, 'no picture to remove: nothing written');
});

test('Bookmarks: events outside the tree are ignored; quietly() always listens again', async () => {
	const w = loadBackground(), B = w.app.Bookmarks, ev = w.browser.bookmarks.onChanged.listeners;
	assert.ok(B._isTracked('anything'), 'tree not loaded yet: everything counts');
	w.app.node = { id: 'qd', children: [{ id: 'a' }, { id: 'f', children: [{ id: 'b' }] }] };
	assert.ok(B._isTracked('b') && B._isTracked('x', 'qd') && !B._isTracked('x', 'y') && !B._isTracked(undefined));
	B.initListener();
	assert.equal(await B.quietly('onChanged', () => { assert.ok(!ev.has(B._onChanged), 'not listening during the change'); return Promise.resolve(5); }), 5);
	assert.ok(ev.has(B._onChanged));
	await assert.rejects(B.quietly('onChanged', () => Promise.reject(new Error('no'))));
	assert.ok(ev.has(B._onChanged), 'after a failed change');
	assert.throws(() => B.quietly('onChanged', () => { throw new Error('sync'); }));
	assert.ok(ev.has(B._onChanged), 'after a change that threw');
	B.removeListener();
	assert.equal(ev.size, 0);
	await B.update('a', { title: 'T' });
	await settle(0);
	assert.deepEqual(plain(w.browser.calls.at(-1)), ['update', 'a', { title: 'T' }]);
});
