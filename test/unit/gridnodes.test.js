// app.GridNodes (js/background/gridnodes.js): the tile tree, its sync with the bookmarks folder, and edits
// (swap, new bookmark or folder, delete, Refresh and Properties), and where a tile's picture comes from (a screenshot,
// the site's icon, a letter tile or the user's own picture), with SiteIcons and the screenshots stood in for.
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

// The node types of the tile tree (QDCommon.NodeType)
const NodeType = { empty: 0, folder: 1, bookmark: 2 };
const EMPTY_CELL = { type: NodeType.empty };
// A background page with settings loaded and a "Quick Dial" folder holding the given bookmarks
async function setup(bookmarks = []) {
	const sandbox = loadBackground();
	await sandbox.app.Settings.init();
	sandbox.browser.bookmarks.find('menu________').children.push({ id: 'qd', type: 'folder', title: 'Quick Dial', children: bookmarks });
	return sandbox;
}
// Syncs the tile tree with the root folder, as the background page does on a bookmark event
const sync = sandbox => sandbox.app.GridNodes.sync(sandbox.app.node, sandbox.app.settings.grid.root);
// A folder's cells by bookmark id ('-': a gap)
const cellIds = folder => plain(folder.children.map(tile => tile.id || '-'));
// A bookmark of the fake tree: titled with its id in capitals, at https://<id>.example/ unless given an address
const bookmark = (id, url) => ({ id, type: 'bookmark', title: id.toUpperCase(), url: url || 'https://' + id + '.example/' });
// A bookmark folder of the fake tree
const bookmarkFolder = (id, title, children = []) => ({ id, type: 'folder', title, children });
// A WebP picture as a data URL (any bytes will do)
const WEBP_PICTURE = 'data:image/webp;base64,AAAA';

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
	const sandbox = await setup([bookmark('a'), bookmarkFolder('f', 'Work', [bookmarkFolder('g', 'Tools', [bookmark('t')])])]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, root = sandbox.app.node;
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

// Refresh with a stand-in for the download: fromFrame() waits until the test calls finish(infos)
const pendingDownload = sandbox => {
	const download = { calls: 0, finish: null };
	sandbox.app.SiteInfos.fromFrame = () => { download.calls++; return new Promise(resolve => { download.finish = resolve; }); };
	return download;
};

test('refresh and capture: one at a time per tile; asked again meanwhile, the one under way answers', async () => {
	const sandbox = await setup([bookmark('a'), bookmarkFolder('f', 'F')]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, tile = sandbox.app.node.children[0], download = pendingDownload(sandbox);
	const first = GridNodes.refreshNode(tile);
	assert.equal(tile.__isLoading, true);
	assert.equal(GridNodes.refreshNode(tile), first);
	assert.equal(GridNodes.capturePage(tile), first);
	await settle();
	assert.equal(download.calls, 1, 'downloaded once');
	download.finish({ url: tile.url, title: 'Site A', icon: null, screenshot: WEBP_PICTURE });
	assert.equal((await first).title, 'Site A');
	assert.equal(tile.title, 'Site A');
	assert.equal(tile.image, '1');
	assert.ok(!('__isLoading' in tile), 'done: not loading any more');
	const next = GridNodes.refreshNode(tile);
	assert.notEqual(next, first, 'a new request once done');
	await settle();
	download.finish(null);
	assert.equal(await next, null, 'a failed download resolves with null');
	assert.equal(tile.image, '0', 'and marks the tile as having no picture');
	assert.deepEqual(plain(await GridNodes.refreshNode(sandbox.app.node.children[1])), { title: 'F' }, 'a folder: its picture is cleared');
	assert.equal(await GridNodes.refreshNode({ ...EMPTY_CELL }), null, 'an empty cell: nothing to load');
});

test('updateNode: a new address is refreshed first, then the bookmark gets its new title and address', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const tile = sandbox.app.node.children[0], download = pendingDownload(sandbox);
	const bookmarkUpdates = () => plain(sandbox.browser.calls.filter(call => call[0] === 'update'));
	let done = false;
	const updated = sandbox.app.GridNodes.updateNode(tile, { url: 'https://moved.example/' }).then(() => { done = true; });
	assert.equal(tile.url, 'https://moved.example/');
	assert.equal(tile.__isLoading, true);
	await settle();
	assert.equal(done, false, 'waits for the refresh');
	download.finish({ url: tile.url, title: 'Moved', icon: null, screenshot: WEBP_PICTURE });
	await updated;
	assert.deepEqual(bookmarkUpdates().pop(), ['update', 'a', { title: 'Moved', url: 'https://moved.example/' }]);
	sandbox.browser.calls.length = 0;
	await sandbox.app.GridNodes.updateNode(tile, { title: 'Renamed' });
	assert.equal(download.calls, 1, 'the same address: no refresh');
	assert.deepEqual(bookmarkUpdates(), [['update', 'a', { title: 'Renamed' }]]);
});

// ----- where a tile's picture comes from (node.imageSource): Refresh makes the same kind again -----
// The picture sources (QDCommon.ImageSource); `page` is never stored
const ImageSource = { page: 0, siteIcon: 1, letter: 2, file: 3 };
// Pictures that stand for a site's icon and a letter tile
const ICON_PICTURE = 'data:image/webp;base64,SUNPTg==', LETTER_PICTURE = 'data:image/webp;base64,TEVUVA==';
const SITE_ICONS = { title: 'Site A', icons: [{ picture: ICON_PICTURE, width: 180, height: 180, isVector: false }] };
const NO_ICONS = { title: null, icons: [] };
// Stand-ins for SiteIcons: find() answers with `found`, letter() with LETTER_PICTURE; the calls are counted
const fakeSiteIcons = (sandbox, found) => {
	const calls = { find: 0, letter: 0 };
	sandbox.app.SiteIcons.find = () => { calls.find++; return Promise.resolve(found); };
	sandbox.app.SiteIcons.letter = () => { calls.letter++; return LETTER_PICTURE; };
	return calls;
};
// A stand-in for Capture page's screenshot: answers with `infos` (null: it failed); the calls are counted
const fakeCapture = (sandbox, infos) => {
	const capture = { calls: 0 };
	sandbox.app.SiteInfos.fromNewTab = () => { capture.calls++; return Promise.resolve(infos); };
	return capture;
};
// The picture stored for a tile
const storedPicture = (sandbox, tile) => sandbox.app.Images._cache.get(tile.id);

test('Use site icon: the best icon and the page\'s title; Refresh then makes an icon again, not a screenshot', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, tile = sandbox.app.node.children[0];
	const calls = fakeSiteIcons(sandbox, SITE_ICONS), download = pendingDownload(sandbox);
	const infos = await GridNodes.useSiteIcon(tile);
	assert.equal(infos.screenshot, ICON_PICTURE);
	assert.equal(tile.imageSource, ImageSource.siteIcon);
	assert.equal(tile.title, 'Site A');
	assert.equal(storedPicture(sandbox, tile), ICON_PICTURE);
	await GridNodes.refreshNode(tile);
	assert.equal(calls.find, 2, 'Refresh looks for the icons again');
	assert.equal(download.calls, 0, 'no screenshot');
	assert.equal(tile.imageSource, ImageSource.siteIcon);
	assert.equal(await GridNodes.useSiteIcon(sandbox.app.node), null, 'a folder has no site icon');
});

test('a site icon tile keeps its icon when the site has none or can\'t be reached; asked for anew, it gets a letter tile', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, tile = sandbox.app.node.children[0];
	fakeSiteIcons(sandbox, SITE_ICONS);
	await GridNodes.useSiteIcon(tile);
	const calls = fakeSiteIcons(sandbox, NO_ICONS);
	await GridNodes.refreshNode(tile);
	assert.equal(storedPicture(sandbox, tile), ICON_PICTURE, 'the icon stays');
	assert.equal(tile.title, 'Site A', 'and so does the title');
	assert.equal(calls.letter, 0);
	await GridNodes.useSiteIcon(tile);
	assert.equal(storedPicture(sandbox, tile), LETTER_PICTURE, 'asked for again: a letter tile');
	assert.equal(tile.imageSource, ImageSource.siteIcon, 'still a site icon tile: Refresh looks for an icon again');
});

test('Refresh draws a letter tile again and keeps the user\'s own picture; a kept picture is left alone', async () => {
	const sandbox = await setup([bookmark('a'), bookmark('b'), bookmark('c')]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, [letterTile, fileTile, keptTile] = sandbox.app.node.children;
	const calls = fakeSiteIcons(sandbox, SITE_ICONS), download = pendingDownload(sandbox);
	await GridNodes.updateNode(letterTile, { image: WEBP_PICTURE, imageSource: ImageSource.letter });
	await GridNodes.refreshNode(letterTile);
	assert.equal(calls.letter, 1);
	assert.equal(storedPicture(sandbox, letterTile), LETTER_PICTURE);
	await GridNodes.updateNode(fileTile, { image: WEBP_PICTURE, imageSource: ImageSource.file });
	await GridNodes.refreshNode(fileTile);
	assert.equal(storedPicture(sandbox, fileTile), WEBP_PICTURE, 'the user\'s picture is kept');
	assert.equal(fileTile.title, 'Site A', 'the title still comes from the page');
	assert.equal(download.calls, 0, 'no screenshot for either');
	keptTile.imageLocked = true;
	assert.equal(await GridNodes.useSiteIcon(keptTile), null);
	assert.equal(keptTile.imageSource, undefined);
});

test('a tile whose own picture went with its old address gets a screenshot again', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, tile = sandbox.app.node.children[0];
	await GridNodes.updateNode(tile, { image: WEBP_PICTURE, imageSource: ImageSource.file });
	sandbox.browser.bookmarks.find('a').url = 'https://elsewhere.example/';
	await sync(sandbox);
	assert.equal(tile.image, undefined, 'the picture went with the address');
	const download = pendingDownload(sandbox);
	const refreshed = GridNodes.refreshNode(tile);
	await settle();
	assert.equal(download.calls, 1, 'downloaded for a screenshot');
	download.finish({ url: tile.url, title: 'Elsewhere', icon: null, screenshot: WEBP_PICTURE });
	await refreshed;
	assert.equal(tile.imageSource, undefined, 'a screenshot now');
});

test('Capture page replaces an icon with a screenshot; a failed capture leaves the icon', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, tile = sandbox.app.node.children[0];
	fakeSiteIcons(sandbox, SITE_ICONS);
	await GridNodes.useSiteIcon(tile);
	fakeCapture(sandbox, null);
	await GridNodes.capturePage(tile);
	assert.equal(tile.image, '1');
	assert.equal(storedPicture(sandbox, tile), ICON_PICTURE, 'the icon stays');
	assert.equal(tile.imageSource, ImageSource.siteIcon);
	fakeCapture(sandbox, { url: tile.url, title: 'Shot', icon: null, screenshot: WEBP_PICTURE });
	await GridNodes.capturePage(tile);
	assert.equal(storedPicture(sandbox, tile), WEBP_PICTURE);
	assert.equal(tile.imageSource, undefined, 'a screenshot now');
});

test('updateNode saves the picture\'s source with it (Page is not stored), and captures the page when asked', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, tile = sandbox.app.node.children[0];
	await GridNodes.updateNode(tile, { image: ICON_PICTURE, imageSource: ImageSource.siteIcon });
	assert.equal(tile.imageSource, ImageSource.siteIcon);
	await GridNodes.updateNode(tile, { title: 'Renamed' });
	assert.equal(tile.imageSource, ImageSource.siteIcon, 'left out: kept');
	const capture = fakeCapture(sandbox, { url: tile.url, title: 'Shot', icon: null, screenshot: WEBP_PICTURE });
	await GridNodes.updateNode(tile, { image: ICON_PICTURE, imageSource: ImageSource.page, capturePage: true });
	assert.equal(capture.calls, 1, 'the page is captured once saved');
	assert.equal(tile.imageSource, undefined);
	assert.equal(storedPicture(sandbox, tile), WEBP_PICTURE);
});

// ----- the picture new tiles get (grid.newTilePicture), and Settings › Tiles › Apply to tiles -----
// The kinds of picture (QDCommon.TilePicture)
const TilePicture = { page: 0, siteIcon: 1, siteIconOrPage: 2 };
const SCREENSHOT = { url: 'https://a.example/', title: 'Shot', icon: null, screenshot: WEBP_PICTURE };
// A stand-in for Refresh's screenshot that answers at once with SCREENSHOT; the calls are counted
const instantDownload = sandbox => {
	const download = { calls: 0 };
	sandbox.app.SiteInfos.fromFrame = () => { download.calls++; return Promise.resolve(SCREENSHOT); };
	return download;
};

test('new tiles get the picture chosen in Settings; Refresh of a tile with a screenshot takes a screenshot again', async () => {
	const sandbox = await setup([bookmark('a'), bookmark('b')]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, [iconTile, shotTile] = sandbox.app.node.children;
	const calls = fakeSiteIcons(sandbox, SITE_ICONS), download = instantDownload(sandbox);
	assert.equal(GridNodes.newTilePicture(), TilePicture.page, 'a screenshot by default');
	await GridNodes.refreshNode(shotTile);
	assert.equal(download.calls, 1);
	sandbox.app.settings.grid.newTilePicture = TilePicture.siteIcon;
	await GridNodes.refreshNode(iconTile);
	assert.equal(iconTile.imageSource, ImageSource.siteIcon);
	assert.equal(storedPicture(sandbox, iconTile), ICON_PICTURE);
	assert.equal(iconTile.title, 'Site A');
	await GridNodes.refreshNode(shotTile);
	assert.equal(download.calls, 2, 'a tile with a screenshot keeps getting screenshots');
	assert.equal(calls.find, 1);
	assert.equal(shotTile.imageSource, undefined);
	sandbox.app.settings.grid.newTilePicture = 9;
	assert.equal(GridNodes.newTilePicture(), TilePicture.page, 'a value it doesn\'t know: a screenshot');
});

test('new tiles: the site\'s icon or a letter tile; the icon or a screenshot; a kept picture takes none', async () => {
	const sandbox = await setup([bookmark('a'), bookmark('b'), bookmark('c'), bookmark('d')]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, [letterTile, shotTile, iconTile, keptTile] = sandbox.app.node.children;
	const grid = sandbox.app.settings.grid, download = instantDownload(sandbox);
	fakeSiteIcons(sandbox, NO_ICONS);
	grid.newTilePicture = TilePicture.siteIcon;
	await GridNodes.refreshNode(letterTile);
	assert.equal(storedPicture(sandbox, letterTile), LETTER_PICTURE, 'no icon: a letter tile');
	assert.equal(letterTile.imageSource, ImageSource.siteIcon, 'Refresh looks for an icon again');
	grid.newTilePicture = TilePicture.siteIconOrPage;
	await GridNodes.refreshNode(shotTile);
	assert.equal(download.calls, 1, 'no icon: a screenshot');
	assert.equal(storedPicture(sandbox, shotTile), WEBP_PICTURE);
	assert.equal(shotTile.imageSource, undefined);
	fakeSiteIcons(sandbox, SITE_ICONS);
	await GridNodes.refreshNode(iconTile);
	assert.equal(storedPicture(sandbox, iconTile), ICON_PICTURE);
	keptTile.imageLocked = true;
	await GridNodes.refreshNode(keptTile);
	assert.equal(keptTile.imageSource, undefined, 'a kept picture is not made into an icon');
});

test('Apply to tiles: icons for every tile in every folder but the user\'s own and kept pictures; screenshots back again', async () => {
	const sandbox = await setup([bookmark('a'), bookmark('b'), bookmark('c'), bookmarkFolder('f', 'F', [bookmark('d')])]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, [shotTile, fileTile, keptTile, folder] = sandbox.app.node.children, innerTile = folder.children[0];
	const download = instantDownload(sandbox);
	await GridNodes.refreshNode(shotTile);
	await GridNodes.updateNode(fileTile, { image: WEBP_PICTURE, imageSource: ImageSource.file });
	await GridNodes.refreshNode(keptTile);
	keptTile.imageLocked = true;
	const calls = fakeSiteIcons(sandbox, SITE_ICONS);
	let shown = 0;
	assert.equal(await GridNodes.applyTilePicture(TilePicture.siteIcon, () => { shown++; }), 2, 'the screenshot tile and the one in the folder');
	assert.equal(shown, 2, 'the pages are told after each tile');
	assert.deepEqual([shotTile.imageSource, innerTile.imageSource], [ImageSource.siteIcon, ImageSource.siteIcon]);
	assert.equal(storedPicture(sandbox, fileTile), WEBP_PICTURE, 'the user\'s own picture stays');
	assert.equal(keptTile.imageSource, undefined, 'and so does a kept one');
	assert.equal(calls.find, 2);
	assert.equal(folder.imageSource, undefined, 'a folder takes no icon');
	assert.equal(await GridNodes.applyTilePicture(TilePicture.siteIconOrPage), 0, 'icons already');
	const shots = download.calls;
	assert.equal(await GridNodes.applyTilePicture(TilePicture.page), 2);
	assert.equal(download.calls, shots + 2);
	assert.deepEqual([shotTile.imageSource, innerTile.imageSource], [undefined, undefined]);
	assert.equal(await GridNodes.applyTilePicture('1'), 0, 'not a kind of picture');
});

test('Apply to tiles, the icon or a screenshot: a site without an icon keeps its screenshot', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const GridNodes = sandbox.app.GridNodes, tile = sandbox.app.node.children[0], download = instantDownload(sandbox);
	await GridNodes.refreshNode(tile);
	fakeSiteIcons(sandbox, NO_ICONS);
	assert.equal(await GridNodes.applyTilePicture(TilePicture.siteIconOrPage), 1, 'looked at');
	assert.equal(download.calls, 1, 'no new screenshot');
	assert.equal(tile.imageSource, undefined);
	assert.equal(storedPicture(sandbox, tile), WEBP_PICTURE);
});
