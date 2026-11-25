// app.GridNodes (js/background/gridnodes.js): the tile tree, its sync with the bookmarks folder, and edits
// (swap, new bookmark or folder, delete). How tiles get their titles and pictures: tilepictures.test.js.
//
// The tile tree mirrors the "Quick Dial" bookmarks folder: a folder's children are its cells in order,
// with { type: 0 } for a gap; tiles keep their cells while bookmarks come and go. Here the bookmarks are
// the fake API's tree (browser.bookmarks.tree in ./load.js), changed directly, then sync() is called as
// the background page does on a bookmark event. cellIds() shows a folder's cells by bookmark id ('-': a gap).
// Related: the same through real bookmark events, with pictures, is integration/sync.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackground, plain, settle } = require('./load');
const { NodeType, EMPTY_CELL, setup, sync, cellIds, bookmark, bookmarkFolder, WEBP_PICTURE } = require('./tiles');

test('sync builds the tree from the folder: bookmarks, folders, their order', async () => {
	const sandbox = await setup([bookmark('a'), bookmarkFolder('f', 'F', [bookmark('c')]), bookmark('b')]);
	await sync(sandbox);
	const root = sandbox.app.node;
	assert.equal(root.id, 'qd');
	assert.deepEqual(cellIds(root), ['a', 'f', 'b']);
	assert.deepEqual(plain(root.children.map(tile => tile.type)), [NodeType.bookmark, NodeType.folder, NodeType.bookmark]);
	assert.deepEqual(cellIds(root.children[1]), ['c']);
	assert.equal(root.children[0].url, 'https://a.example/');
});

test('sync keeps cells: a removed bookmark leaves a gap, new ones fill gaps first, the end is trimmed', async () => {
	const sandbox = await setup([bookmark('a'), bookmark('b'), bookmark('c')]);
	await sync(sandbox);
	const folder = sandbox.browser.bookmarks.find('qd');
	const removeBookmark = id => { folder.children = folder.children.filter(child => child.id !== id); };
	removeBookmark('b');
	await sync(sandbox);
	assert.deepEqual(cellIds(sandbox.app.node), ['a', '-', 'c']);
	folder.children.push(bookmark('d'));
	await sync(sandbox);
	assert.deepEqual(cellIds(sandbox.app.node), ['a', 'd', 'c']);
	removeBookmark('c');
	await sync(sandbox);
	assert.deepEqual(cellIds(sandbox.app.node), ['a', 'd'], 'a bookmark gone from the end leaves no gap');
	sandbox.app.node.children.splice(1, 0, null); // a broken cell from old data
	await sync(sandbox);
	assert.deepEqual(cellIds(sandbox.app.node), ['a', '-', 'd'], 'a null cell becomes a gap');
});

test('sync: a bookmark gone from the end leaves no gap at the end, also when a gap was before it', async () => {
	const sandbox = await setup([bookmark('a'), bookmark('b'), bookmark('c')]);
	await sync(sandbox);
	const folder = sandbox.browser.bookmarks.find('qd');
	folder.children = folder.children.filter(child => child.id !== 'b');
	await sync(sandbox);
	assert.deepEqual(cellIds(sandbox.app.node), ['a', '-', 'c']);
	folder.children = folder.children.filter(child => child.id !== 'c');
	await sync(sandbox);
	assert.deepEqual(cellIds(sandbox.app.node), ['a']);
});

test('the root folder is a folder: a bookmark of the same name before it is passed over', async () => {
	const sandbox = await setup([bookmark('a')]);
	sandbox.browser.bookmarks.find('menu________').children.unshift({ ...bookmark('link'), title: 'Quick Dial' });
	assert.equal((await sandbox.app.Bookmarks.load('Quick Dial')).id, 'qd');
});

test('sync: a new address drops the stored picture; a gone bookmark takes its picture with it', async () => {
	const sandbox = await setup([bookmark('a'), bookmark('b')]);
	await sync(sandbox);
	await sandbox.app.Images.setNodeImage(sandbox.app.node.children[0], 'data:image/webp;base64,AAAA');
	await sandbox.app.Images.setNodeImage(sandbox.app.node.children[1], 'data:image/webp;base64,BBBB');
	const folder = sandbox.browser.bookmarks.find('qd');
	folder.children[0].url = 'https://moved.example/';
	folder.children.pop();
	await sync(sandbox);
	await settle();
	assert.equal(sandbox.app.node.children[0].image, undefined);
	assert.ok(!('img_a' in sandbox.browser.store) && !('img_b' in sandbox.browser.store));
});

test('sync called again while running runs once more afterwards, and answers every caller', async () => {
	const sandbox = await setup([bookmark('a')]);
	const finished = [];
	const syncThen = name => sandbox.app.GridNodes.sync(sandbox.app.node, 'Quick Dial').then(() => finished.push(name));
	const first = syncThen('first');
	sandbox.browser.bookmarks.find('qd').children.push(bookmark('b'));
	const second = syncThen('second');
	const third = syncThen('third');
	await Promise.all([first, second, third]);
	assert.deepEqual(plain(finished), ['first', 'second', 'third'], 'all after the second run, in order');
	assert.deepEqual(cellIds(sandbox.app.node), ['a', 'b']);
	assert.equal(sandbox.app.GridNodes._syncing, undefined, 'not left locked');
});

test('a sync asked for while one runs uses its own tree: a tree replaced meanwhile (import, new root) is synced', async () => {
	const sandbox = await setup([bookmark('a')]);
	const first = sandbox.app.GridNodes.sync(sandbox.app.node, 'Quick Dial');
	const replacedTree = { children: [] };
	const second = sandbox.app.GridNodes.sync(replacedTree, 'Quick Dial');
	await Promise.all([first, second]);
	assert.equal(replacedTree.id, 'qd');
	assert.deepEqual(cellIds(replacedTree), ['a']);
});

test('sync creates a missing root folder; an absolute root path starts at the top', async () => {
	const sandbox = await setup();
	sandbox.app.settings.grid.root = '/menu/Dial/Sub';
	await sync(sandbox);
	const dialFolder = sandbox.browser.bookmarks.find('menu________').children.find(child => child.title === 'Dial');
	assert.ok(dialFolder && dialFolder.children[0].title === 'Sub');
	assert.equal(sandbox.app.node.id, dialFolder.children[0].id);
});

test('finding nodes: by path, by id, with parents', async () => {
	const sameNameBookmark = { ...bookmark('w'), title: 'Work' }; // before the folder: a path names folders only
	const sandbox = await setup([bookmark('a'), sameNameBookmark, bookmarkFolder('f', 'Work', [bookmarkFolder('g', 'Tools', [bookmark('t')])])]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, root = sandbox.app.node;
	root.children.unshift({ ...EMPTY_CELL }); // a gap has no title: never a folder named "undefined"
	assert.equal(GridNodes.getNode(root, 'undefined/'), null);
	assert.equal(GridNodes.getNode(root, 'Work/').id, 'f');
	assert.equal(GridNodes.getNode(root, '').id, 'qd');
	assert.equal(GridNodes.getNode(root, '/').id, 'qd');
	assert.equal(GridNodes.getNode(root, 'Work/Tools/').id, 'g');
	assert.equal(GridNodes.getNode(root, 'Nope/'), null);
	assert.equal(GridNodes.getChildNode(root, 'f').title, 'Work');
	assert.equal(GridNodes.getChildNode(root, 'x'), null);
	assert.equal(GridNodes.getNodeById('t').title, 'T');
	assert.deepEqual(plain(GridNodes.getNodeWithParents('t').map(node => node.id)), ['qd', 'f', 'g', 't']);
	assert.equal(GridNodes.getNodeById('zzz'), null);
});

test('setNodeIndex swaps two cells, growing the folder if needed, never leaving a gap at the end', () => {
	const sandbox = loadBackground();
	sandbox.app.settings = sandbox.app.Settings.defaults();
	const GridNodes = sandbox.app.GridNodes, folder = { children: [{ id: 'a', type: NodeType.bookmark }, { id: 'b', type: NodeType.bookmark }, { ...EMPTY_CELL }] };
	GridNodes.setNodeIndex(folder, 0, 1);
	assert.deepEqual(cellIds(folder), ['b', 'a'], 'the gap at the end is trimmed');
	GridNodes.setNodeIndex(folder, 0, 5);
	assert.deepEqual(cellIds(folder), ['-', 'a', '-', '-', '-', 'b']);
	GridNodes.setNodeIndex(folder, 5, 0);
	assert.deepEqual(cellIds(folder), ['b', 'a']);
});

test('new bookmarks and folders go into the first gap, else at the end; the event of our own change is not heard', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, root = sandbox.app.node;
	sandbox.app.Bookmarks.initListener();
	root.children.push({ ...EMPTY_CELL }, bookmark('z'));
	const created = await GridNodes.createBookmark(root, 'example.com', '');
	assert.equal(created.url, 'http://example.com');
	assert.equal(created.title, '');
	assert.deepEqual(cellIds(root), ['a', created.id, 'z']);
	const folder = await GridNodes.createFolder(root, 'New');
	assert.deepEqual(plain(folder.children), []);
	assert.equal(root.children[3].id, folder.id);
	assert.ok(sandbox.browser.bookmarks.onCreated.listeners.has(sandbox.app.Bookmarks._onCreated), 'listening again afterwards');
	const ownScheme = await GridNodes.createBookmark(root, 'about:config', 'Config');
	assert.equal(ownScheme.url, 'about:config', 'an address with its own scheme keeps it');
});

test('deleteNode: a gap in the middle, nothing at the end; its bookmark and pictures go', async () => {
	const sandbox = await setup([bookmark('a'), bookmark('b'), bookmark('c')]);
	await sync(sandbox);
	await sandbox.app.Images.setNodeImage(sandbox.app.node.children[1], WEBP_PICTURE);
	sandbox.app.GridNodes.deleteNode(sandbox.app.node, 'b');
	assert.deepEqual(cellIds(sandbox.app.node), ['a', '-', 'c']);
	sandbox.app.GridNodes.deleteNode(sandbox.app.node, 'c');
	assert.deepEqual(cellIds(sandbox.app.node), ['a']);
	await settle();
	assert.ok(!('img_b' in sandbox.browser.store));
	assert.deepEqual(plain(sandbox.browser.calls.filter(call => call[0] === 'removeTree')), [['removeTree', 'b'], ['removeTree', 'c']]);
});

test('sync: bookmarks that can\'t be read leave the tree as it is, unlocked; the next sync catches up', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const bookmarksApi = sandbox.browser.bookmarks, workingGetSubTree = bookmarksApi.getSubTree;
	bookmarksApi.getSubTree = () => Promise.reject(new Error('busy'));
	bookmarksApi.find('qd').children.push(bookmark('b'));
	assert.equal(await sandbox.app.Bookmarks.load('Quick Dial'), null, 'Bookmarks.load resolves with null, never rejects');
	await sync(sandbox);
	assert.deepEqual(cellIds(sandbox.app.node), ['a']);
	assert.equal(sandbox.app.GridNodes._syncing, undefined);
	bookmarksApi.getSubTree = workingGetSubTree;
	await sync(sandbox);
	assert.deepEqual(cellIds(sandbox.app.node), ['a', 'b']);
});
