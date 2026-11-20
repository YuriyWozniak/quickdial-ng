// app.GridNodes (js/background/gridnodes.js): the tile tree, its sync with the bookmarks folder, and edits
// (swap, new bookmark or folder, delete, Refresh and Properties).
//
// The tile tree mirrors the "Quick Dial" bookmarks folder: a folder's children are its cells in order,
// with { type: 0 } for a gap; tiles keep their cells while bookmarks come and go. Here the bookmarks are
// the fake API's tree (browser.bookmarks.tree in ./load.js), changed directly, then sync() is called as
// the background page does on a bookmark event. ids() shows a folder's cells by bookmark id ('-': a gap).
// Related: the same through real bookmark events, with pictures, is integration/sync.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackground, plain, settle } = require('./load');

const E = { type: 0 }; // an empty cell
// A background page with settings loaded and a "Quick Dial" folder holding the given bookmarks
async function setup(bookmarks = []) {
	const w = loadBackground();
	await w.app.Settings.init();
	w.browser.bookmarks.find('menu________').children.push({ id: 'qd', type: 'folder', title: 'Quick Dial', children: bookmarks });
	return w;
}
const sync = w => w.app.GridNodes.sync(w.app.node, w.app.settings.grid.root);
const ids = node => plain(node.children.map(c => c.id || '-'));
const bm = (id, url) => ({ id, type: 'bookmark', title: id.toUpperCase(), url: url || 'https://' + id + '.example/' });

test('sync builds the tree from the folder: bookmarks, folders, their order', async () => {
	const w = await setup([bm('a'), { id: 'f', type: 'folder', title: 'F', children: [bm('c')] }, bm('b')]);
	await sync(w);
	assert.equal(w.app.node.id, 'qd');
	assert.deepEqual(ids(w.app.node), ['a', 'f', 'b']);
	assert.deepEqual(plain(w.app.node.children.map(c => c.type)), [2, 1, 2]);
	assert.deepEqual(ids(w.app.node.children[1]), ['c']);
	assert.equal(w.app.node.children[0].url, 'https://a.example/');
});

test('sync keeps cells: a removed bookmark leaves a gap, new ones fill gaps first, the end is trimmed', async () => {
	const w = await setup([bm('a'), bm('b'), bm('c')]);
	await sync(w);
	const folder = w.browser.bookmarks.find('qd');
	folder.children = folder.children.filter(b => b.id !== 'b');
	await sync(w);
	assert.deepEqual(ids(w.app.node), ['a', '-', 'c']);
	folder.children.push(bm('d'));
	await sync(w);
	assert.deepEqual(ids(w.app.node), ['a', 'd', 'c']);
	folder.children = folder.children.filter(b => b.id !== 'c');
	await sync(w);
	assert.deepEqual(ids(w.app.node), ['a', 'd'], 'a bookmark gone from the end leaves no gap');
	w.app.node.children.splice(1, 0, null); // a broken cell from old data
	await sync(w);
	assert.deepEqual(ids(w.app.node), ['a', '-', 'd'], 'a null cell becomes a gap');
});

test('sync: a new address drops the stored picture; a gone bookmark takes its picture with it', async () => {
	const w = await setup([bm('a'), bm('b')]);
	await sync(w);
	await w.app.Images.setNodeImage(w.app.node.children[0], 'data:image/webp;base64,AAAA');
	await w.app.Images.setNodeImage(w.app.node.children[1], 'data:image/webp;base64,BBBB');
	const folder = w.browser.bookmarks.find('qd');
	folder.children[0].url = 'https://moved.example/';
	folder.children.pop();
	await sync(w);
	await settle();
	assert.equal(w.app.node.children[0].image, undefined);
	assert.ok(!('img_a' in w.browser.store) && !('img_b' in w.browser.store));
});

test('sync called again while running runs once more afterwards, and answers every caller', async () => {
	const w = await setup([bm('a')]);
	const order = [];
	const first = w.app.GridNodes.sync(w.app.node, 'Quick Dial').then(() => order.push('first'));
	w.browser.bookmarks.find('qd').children.push(bm('b'));
	const second = w.app.GridNodes.sync(w.app.node, 'Quick Dial').then(() => order.push('second'));
	const third = w.app.GridNodes.sync(w.app.node, 'Quick Dial').then(() => order.push('third'));
	await Promise.all([first, second, third]);
	assert.deepEqual(plain(order), ['first', 'second', 'third'], 'all after the second run, in order');
	assert.deepEqual(ids(w.app.node), ['a', 'b']);
	assert.equal(w.app.GridNodes._syncing, undefined, 'not left locked');
});

test('a sync asked for while one runs uses its own tree: a tree replaced meanwhile (import, new root) is synced', async () => {
	const w = await setup([bm('a')]);
	const old = w.app.node;
	const first = w.app.GridNodes.sync(old, 'Quick Dial');
	const fresh = { children: [] };
	const second = w.app.GridNodes.sync(fresh, 'Quick Dial');
	await Promise.all([first, second]);
	assert.equal(fresh.id, 'qd');
	assert.deepEqual(ids(fresh), ['a']);
});

test('sync creates a missing root folder; an absolute root path starts at the top', async () => {
	const w = await setup();
	w.app.settings.grid.root = '/menu/Dial/Sub';
	await sync(w);
	const dial = w.browser.bookmarks.find('menu________').children.find(c => c.title === 'Dial');
	assert.ok(dial && dial.children[0].title === 'Sub');
	assert.equal(w.app.node.id, dial.children[0].id);
});

test('finding nodes: by path, by id, with parents', async () => {
	const w = await setup([bm('a'), { id: 'f', type: 'folder', title: 'Work', children: [{ id: 'g', type: 'folder', title: 'Tools', children: [bm('t')] }] }]);
	await sync(w);
	const G = w.app.GridNodes;
	assert.equal(G.getNode(w.app.node, '').id, 'qd');
	assert.equal(G.getNode(w.app.node, '/').id, 'qd');
	assert.equal(G.getNode(w.app.node, 'Work/Tools/').id, 'g');
	assert.equal(G.getNode(w.app.node, 'Nope/'), null);
	assert.equal(G.getChildNode(w.app.node, 'f').title, 'Work');
	assert.equal(G.getChildNode(w.app.node, 'x'), null);
	assert.equal(G.getNodeById('t').title, 'T');
	assert.deepEqual(plain(G.getNodeWithParents('t').map(n => n.id)), ['qd', 'f', 'g', 't']);
	assert.equal(G.getNodeById('zzz'), null);
});

test('setNodeIndex swaps two cells, growing the folder if needed, never leaving a gap at the end', () => {
	const w = loadBackground();
	w.app.settings = w.app.Settings.defaults();
	const G = w.app.GridNodes, folder = { children: [{ id: 'a', type: 2 }, { id: 'b', type: 2 }, { ...E }] };
	G.setNodeIndex(folder, 0, 1);
	assert.deepEqual(ids(folder), ['b', 'a'], 'the gap at the end is trimmed');
	G.setNodeIndex(folder, 0, 5);
	assert.deepEqual(ids(folder), ['-', 'a', '-', '-', '-', 'b']);
	G.setNodeIndex(folder, 5, 0);
	assert.deepEqual(ids(folder), ['b', 'a']);
});

test('new bookmarks and folders go into the first gap, else at the end; the event of our own change is not heard', async () => {
	const w = await setup([bm('a')]);
	await sync(w);
	w.app.Bookmarks.initListener();
	w.app.node.children.push({ ...E }, bm('z'));
	const created = await w.app.GridNodes.createBookmark(w.app.node, 'example.com', '');
	assert.equal(created.url, 'http://example.com');
	assert.equal(created.title, '');
	assert.deepEqual(ids(w.app.node), ['a', created.id, 'z']);
	const folder = await w.app.GridNodes.createFolder(w.app.node, 'New');
	assert.deepEqual(plain(folder.children), []);
	assert.equal(w.app.node.children[3].id, folder.id);
	assert.ok(w.browser.bookmarks.onCreated.listeners.has(w.app.Bookmarks._onCreated), 'listening again afterwards');
	const kept = await w.app.GridNodes.createBookmark(w.app.node, 'about:config', 'Config');
	assert.equal(kept.url, 'about:config', 'an address with its own scheme keeps it');
});

test('deleteNode: a gap in the middle, nothing at the end; its bookmark and pictures go', async () => {
	const w = await setup([bm('a'), bm('b'), bm('c')]);
	await sync(w);
	await w.app.Images.setNodeImage(w.app.node.children[1], 'data:image/webp;base64,AAAA');
	w.app.GridNodes.deleteNode(w.app.node, 'b');
	assert.deepEqual(ids(w.app.node), ['a', '-', 'c']);
	w.app.GridNodes.deleteNode(w.app.node, 'c');
	assert.deepEqual(ids(w.app.node), ['a']);
	await settle();
	assert.ok(!('img_b' in w.browser.store));
	assert.deepEqual(plain(w.browser.calls.filter(c => c[0] === 'removeTree')), [['removeTree', 'b'], ['removeTree', 'c']]);
});

test('sync: bookmarks that can\'t be read leave the tree as it is, unlocked; the next sync catches up', async () => {
	const w = await setup([bm('a')]);
	await sync(w);
	const getSubTree = w.browser.bookmarks.getSubTree;
	w.browser.bookmarks.getSubTree = () => Promise.reject(new Error('busy'));
	w.browser.bookmarks.find('qd').children.push(bm('b'));
	assert.equal(await w.app.Bookmarks.load('Quick Dial'), null, 'Bookmarks.load resolves with null, never rejects');
	await sync(w);
	assert.deepEqual(ids(w.app.node), ['a']);
	assert.equal(w.app.GridNodes._syncing, undefined);
	w.browser.bookmarks.getSubTree = getSubTree;
	await sync(w);
	assert.deepEqual(ids(w.app.node), ['a', 'b']);
});

// Refresh with a stand-in for the download: fromFrame() waits until the test calls finish(infos)
const pendingRefresh = w => {
	const fake = { calls: 0, finish: null };
	w.app.SiteInfos.fromFrame = () => { fake.calls++; return new Promise(r => { fake.finish = r; }); };
	return fake;
};

test('refresh and capture: one at a time per tile; asked again meanwhile, the one under way answers', async () => {
	const w = await setup([bm('a'), { id: 'f', type: 'folder', title: 'F', children: [] }]);
	await sync(w);
	const G = w.app.GridNodes, a = w.app.node.children[0], fake = pendingRefresh(w);
	const first = G.refreshNode(a);
	assert.equal(a.__isLoading, true);
	assert.equal(G.refreshNode(a), first);
	assert.equal(G.capturePage(a), first);
	await settle();
	assert.equal(fake.calls, 1, 'downloaded once');
	fake.finish({ url: a.url, title: 'Site A', icon: null, screenshot: 'data:image/webp;base64,AAAA' });
	assert.equal((await first).title, 'Site A');
	assert.equal(a.title, 'Site A');
	assert.equal(a.image, '1');
	assert.ok(!('__isLoading' in a), 'done: not loading any more');
	const next = G.refreshNode(a);
	assert.notEqual(next, first, 'a new request once done');
	await settle();
	fake.finish(null);
	assert.equal(await next, null, 'a failed download resolves with null');
	assert.equal(a.image, '0', 'and marks the tile as having no picture');
	assert.deepEqual(plain(await G.refreshNode(w.app.node.children[1])), { title: 'F' }, 'a folder: its picture is cleared');
	assert.equal(await G.refreshNode({ type: 0 }), null, 'an empty cell: nothing to load');
});

test('updateNode: a new address is refreshed first, then the bookmark gets its new title and address', async () => {
	const w = await setup([bm('a')]);
	await sync(w);
	const a = w.app.node.children[0], fake = pendingRefresh(w);
	let done = false;
	const updated = w.app.GridNodes.updateNode(a, { url: 'https://moved.example/' }).then(() => { done = true; });
	assert.equal(a.url, 'https://moved.example/');
	assert.equal(a.__isLoading, true);
	await settle();
	assert.equal(done, false, 'waits for the refresh');
	fake.finish({ url: a.url, title: 'Moved', icon: null, screenshot: 'data:image/webp;base64,AAAA' });
	await updated;
	assert.deepEqual(plain(w.browser.calls.filter(c => c[0] === 'update').pop()), ['update', 'a', { title: 'Moved', url: 'https://moved.example/' }]);
	w.browser.calls.length = 0;
	await w.app.GridNodes.updateNode(a, { title: 'Renamed' });
	assert.equal(fake.calls, 1, 'the same address: no refresh');
	assert.deepEqual(plain(w.browser.calls.filter(c => c[0] === 'update')), [['update', 'a', { title: 'Renamed' }]]);
});
