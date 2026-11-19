// app.GridNodes (js/background/gridnodes.js): the tile tree, its sync with the bookmarks folder, and edits.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackground, plain, settle } = require('./load');

const E = { type: 0 }; // an empty cell
// A background page with settings loaded and a "Quick Dial" folder holding the given bookmarks
async function setup(bookmarks = []) {
	const w = loadBackground();
	await new Promise(r => w.app.Settings.init(r));
	w.browser.bookmarks.find('menu________').children.push({ id: 'qd', type: 'folder', title: 'Quick Dial', children: bookmarks });
	return w;
}
const sync = w => new Promise(r => w.app.GridNodes.sync(w.app.node, w.app.settings.grid.root, r));
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

test('sync called again while running runs once more afterwards, with one callback', async () => {
	const w = await setup([bm('a')]);
	let calls = 0;
	const done = new Promise(r => w.app.GridNodes.sync(w.app.node, 'Quick Dial', () => { calls++; r(); }));
	w.browser.bookmarks.find('qd').children.push(bm('b'));
	w.app.GridNodes.sync(w.app.node, 'Quick Dial', () => calls++);
	await done;
	assert.equal(calls, 1);
	assert.deepEqual(ids(w.app.node), ['a', 'b']);
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
	const created = await new Promise(r => w.app.GridNodes.createBookmark(w.app.node, 'example.com', '', (p, n) => r(n)));
	assert.equal(created.url, 'http://example.com');
	assert.equal(created.title, '');
	assert.deepEqual(ids(w.app.node), ['a', created.id, 'z']);
	const folder = await new Promise(r => w.app.GridNodes.createFolder(w.app.node, 'New', (p, n) => r(n)));
	assert.deepEqual(plain(folder.children), []);
	assert.equal(w.app.node.children[3].id, folder.id);
	assert.ok(w.browser.bookmarks.onCreated.listeners.has(w.app.Bookmarks._onCreated), 'listening again afterwards');
	const kept = await new Promise(r => w.app.GridNodes.createBookmark(w.app.node, 'about:config', 'Config', (p, n) => r(n)));
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
