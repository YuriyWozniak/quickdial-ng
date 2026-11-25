// app.TilePictures (js/background/tilepictures.js): how a tile gets its title and picture from its site. Refresh and
// Capture page one at a time per tile; where a tile's picture comes from (a screenshot, the site's icon, a letter tile
// or the user's own picture) and what Refresh, Capture page and Use site icon do with each; Properties' changes of the
// picture (app.GridNodes.updateNode); the picture new tiles get, and Apply to tiles. SiteIcons and the screenshots are
// stood in for.
// Related: the tree these tiles are in is gridnodes.test.js; the same through the pages, integration/siteinfos.js and siteicons.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { plain, settle } = require('./load');
const { EMPTY_CELL, setup, sync, bookmark, bookmarkFolder, WEBP_PICTURE } = require('./tiles');

// Refresh with a stand-in for the download: fromFrame() waits until the test calls finish(infos)
const pendingDownload = sandbox => {
	const download = { calls: 0, finish: null };
	sandbox.app.SiteInfos.fromFrame = () => { download.calls++; return new Promise(resolve => { download.finish = resolve; }); };
	return download;
};

test('refresh and capture: one at a time per tile; asked again meanwhile, the one under way answers', async () => {
	const sandbox = await setup([bookmark('a'), bookmarkFolder('f', 'F')]);
	await sync(sandbox);
	const { TilePictures } = sandbox.app, tile = sandbox.app.node.children[0], download = pendingDownload(sandbox);
	const first = TilePictures.refresh(tile);
	assert.equal(tile.__isLoading, true);
	assert.equal(TilePictures.refresh(tile), first);
	assert.equal(TilePictures.capturePage(tile), first);
	await settle();
	assert.equal(download.calls, 1, 'downloaded once');
	download.finish({ url: tile.url, title: 'Site A', icon: null, screenshot: WEBP_PICTURE });
	assert.equal((await first).title, 'Site A');
	assert.equal(tile.title, 'Site A');
	assert.equal(tile.image, '1');
	assert.ok(!('__isLoading' in tile), 'done: not loading any more');
	const next = TilePictures.refresh(tile);
	assert.notEqual(next, first, 'a new request once done');
	await settle();
	download.finish(null);
	assert.equal(await next, null, 'a failed download resolves with null');
	assert.equal(tile.image, '0', 'and marks the tile as having no picture');
	assert.deepEqual(plain(await TilePictures.refresh(sandbox.app.node.children[1])), { title: 'F' }, 'a folder: its picture is cleared');
	assert.equal(await TilePictures.refresh({ ...EMPTY_CELL }), null, 'an empty cell: nothing to load');
});

test('a tile deleted while its picture is made leaves no picture behind in storage', async () => {
	const sandbox = await setup([bookmark('a'), bookmark('b')]);
	await sync(sandbox);
	const { GridNodes, TilePictures } = sandbox.app, tile = sandbox.app.node.children[0], download = pendingDownload(sandbox);
	const refreshed = TilePictures.refresh(tile);
	await settle();
	GridNodes.deleteNode(sandbox.app.node, 'a');
	download.finish({ url: tile.url, title: 'Late', icon: null, screenshot: WEBP_PICTURE });
	await refreshed;
	await settle();
	assert.ok(!('img_a' in sandbox.browser.store), 'nothing stored for the deleted tile');
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
const ImageSource = { page: 0, siteIcon: 1, letter: 2, file: 3, icon: 4 };
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
	const { TilePictures } = sandbox.app, tile = sandbox.app.node.children[0];
	const calls = fakeSiteIcons(sandbox, SITE_ICONS), download = pendingDownload(sandbox);
	const infos = await TilePictures.useSiteIcon(tile);
	assert.equal(infos.screenshot, ICON_PICTURE);
	assert.equal(tile.imageSource, ImageSource.siteIcon);
	assert.equal(tile.title, 'Site A');
	assert.equal(storedPicture(sandbox, tile), ICON_PICTURE);
	await TilePictures.refresh(tile);
	assert.equal(calls.find, 2, 'Refresh looks for the icons again');
	assert.equal(download.calls, 0, 'no screenshot');
	assert.equal(tile.imageSource, ImageSource.siteIcon);
	assert.equal(await TilePictures.useSiteIcon(sandbox.app.node), null, 'a folder has no site icon');
});

test('a site icon tile keeps its icon when the site has none or can\'t be reached; asked for anew, it gets a letter tile', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const { TilePictures } = sandbox.app, tile = sandbox.app.node.children[0];
	fakeSiteIcons(sandbox, SITE_ICONS);
	await TilePictures.useSiteIcon(tile);
	const calls = fakeSiteIcons(sandbox, NO_ICONS);
	await TilePictures.refresh(tile);
	assert.equal(storedPicture(sandbox, tile), ICON_PICTURE, 'the icon stays');
	assert.equal(tile.title, 'Site A', 'and so does the title');
	assert.equal(calls.letter, 0);
	await TilePictures.useSiteIcon(tile);
	assert.equal(storedPicture(sandbox, tile), LETTER_PICTURE, 'asked for again: a letter tile');
	assert.equal(tile.imageSource, ImageSource.siteIcon, 'still a site icon tile: Refresh looks for an icon again');
});

test('Refresh draws a letter tile again and keeps the user\'s own picture; a kept picture is left alone', async () => {
	const sandbox = await setup([bookmark('a'), bookmark('b'), bookmark('c')]);
	await sync(sandbox);
	const { GridNodes, TilePictures } = sandbox.app, [letterTile, fileTile, keptTile] = sandbox.app.node.children;
	const calls = fakeSiteIcons(sandbox, SITE_ICONS), download = pendingDownload(sandbox);
	await GridNodes.updateNode(letterTile, { image: WEBP_PICTURE, imageSource: ImageSource.letter });
	await TilePictures.refresh(letterTile);
	assert.equal(calls.letter, 1);
	assert.equal(storedPicture(sandbox, letterTile), LETTER_PICTURE);
	await GridNodes.updateNode(fileTile, { image: WEBP_PICTURE, imageSource: ImageSource.file });
	await TilePictures.refresh(fileTile);
	assert.equal(storedPicture(sandbox, fileTile), WEBP_PICTURE, 'the user\'s picture is kept');
	assert.equal(fileTile.title, 'Site A', 'the title still comes from the page');
	assert.equal(download.calls, 0, 'no screenshot for either');
	keptTile.imageLocked = true;
	assert.equal(await TilePictures.useSiteIcon(keptTile), null);
	assert.equal(keptTile.imageSource, undefined);
});

test('a tile whose own picture went with its old address gets a screenshot again', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const { GridNodes, TilePictures } = sandbox.app, tile = sandbox.app.node.children[0];
	await GridNodes.updateNode(tile, { image: WEBP_PICTURE, imageSource: ImageSource.file });
	sandbox.browser.bookmarks.find('a').url = 'https://elsewhere.example/';
	await sync(sandbox);
	assert.equal(tile.image, undefined, 'the picture went with the address');
	const download = pendingDownload(sandbox);
	const refreshed = TilePictures.refresh(tile);
	await settle();
	assert.equal(download.calls, 1, 'downloaded for a screenshot');
	download.finish({ url: tile.url, title: 'Elsewhere', icon: null, screenshot: WEBP_PICTURE });
	await refreshed;
	assert.equal(tile.imageSource, undefined, 'a screenshot now');
});

test('Capture page replaces an icon with a screenshot; a failed capture leaves the icon', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const { TilePictures } = sandbox.app, tile = sandbox.app.node.children[0];
	fakeSiteIcons(sandbox, SITE_ICONS);
	await TilePictures.useSiteIcon(tile);
	fakeCapture(sandbox, null);
	await TilePictures.capturePage(tile);
	assert.equal(tile.image, '1');
	assert.equal(storedPicture(sandbox, tile), ICON_PICTURE, 'the icon stays');
	assert.equal(tile.imageSource, ImageSource.siteIcon);
	fakeCapture(sandbox, { url: tile.url, title: 'Shot', icon: null, screenshot: WEBP_PICTURE });
	await TilePictures.capturePage(tile);
	assert.equal(storedPicture(sandbox, tile), WEBP_PICTURE);
	assert.equal(tile.imageSource, undefined, 'a screenshot now');
});

test('updateNode saves the picture\'s source with it (Page is not stored), and captures the page when asked', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const { GridNodes } = sandbox.app, tile = sandbox.app.node.children[0];
	await GridNodes.updateNode(tile, { image: ICON_PICTURE, imageSource: ImageSource.siteIcon });
	assert.equal(tile.imageSource, ImageSource.siteIcon);
	await GridNodes.updateNode(tile, { title: 'Renamed' });
	assert.equal(tile.imageSource, ImageSource.siteIcon, 'left out: kept');
	assert.equal(tile.image, '1', 'and so is the picture');
	assert.equal(storedPicture(sandbox, tile), ICON_PICTURE);
	await GridNodes.updateNode(tile, { imageLocked: false });
	assert.equal(storedPicture(sandbox, tile), ICON_PICTURE, 'also when only the lock is sent');
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
	const { TilePictures } = sandbox.app, [iconTile, shotTile] = sandbox.app.node.children;
	const calls = fakeSiteIcons(sandbox, SITE_ICONS), download = instantDownload(sandbox);
	assert.equal(TilePictures.newTileKind(), TilePicture.page, 'a screenshot by default');
	await TilePictures.refresh(shotTile);
	assert.equal(download.calls, 1);
	sandbox.app.settings.grid.newTilePicture = TilePicture.siteIcon;
	await TilePictures.refresh(iconTile);
	assert.equal(iconTile.imageSource, ImageSource.siteIcon);
	assert.equal(storedPicture(sandbox, iconTile), ICON_PICTURE);
	assert.equal(iconTile.title, 'Site A');
	await TilePictures.refresh(shotTile);
	assert.equal(download.calls, 2, 'a tile with a screenshot keeps getting screenshots');
	assert.equal(calls.find, 1);
	assert.equal(shotTile.imageSource, undefined);
	sandbox.app.settings.grid.newTilePicture = 9;
	assert.equal(TilePictures.newTileKind(), TilePicture.page, 'a value it doesn\'t know: a screenshot');
});

test('new tiles: the site\'s icon or a letter tile; the icon or a screenshot; a kept picture takes none', async () => {
	const sandbox = await setup([bookmark('a'), bookmark('b'), bookmark('c'), bookmark('d')]);
	await sync(sandbox);
	const { TilePictures } = sandbox.app, [letterTile, shotTile, iconTile, keptTile] = sandbox.app.node.children;
	const grid = sandbox.app.settings.grid, download = instantDownload(sandbox);
	fakeSiteIcons(sandbox, NO_ICONS);
	grid.newTilePicture = TilePicture.siteIcon;
	await TilePictures.refresh(letterTile);
	assert.equal(storedPicture(sandbox, letterTile), LETTER_PICTURE, 'no icon: a letter tile');
	assert.equal(letterTile.imageSource, ImageSource.siteIcon, 'Refresh looks for an icon again');
	grid.newTilePicture = TilePicture.siteIconOrPage;
	await TilePictures.refresh(shotTile);
	assert.equal(download.calls, 1, 'no icon: a screenshot');
	assert.equal(storedPicture(sandbox, shotTile), WEBP_PICTURE);
	assert.equal(shotTile.imageSource, undefined);
	fakeSiteIcons(sandbox, SITE_ICONS);
	await TilePictures.refresh(iconTile);
	assert.equal(storedPicture(sandbox, iconTile), ICON_PICTURE);
	keptTile.imageLocked = true;
	await TilePictures.refresh(keptTile);
	assert.equal(keptTile.imageSource, undefined, 'a kept picture is not made into an icon');
});

test('Apply to tiles: icons for every tile in every folder but the user\'s own and kept pictures; screenshots back again', async () => {
	const sandbox = await setup([bookmark('a'), bookmark('b'), bookmark('c'), bookmarkFolder('f', 'F', [bookmark('d')])]);
	await sync(sandbox);
	const { GridNodes, TilePictures } = sandbox.app, [shotTile, fileTile, keptTile, folder] = sandbox.app.node.children, innerTile = folder.children[0];
	const download = instantDownload(sandbox);
	await TilePictures.refresh(shotTile);
	await GridNodes.updateNode(fileTile, { image: WEBP_PICTURE, imageSource: ImageSource.file });
	await TilePictures.refresh(keptTile);
	keptTile.imageLocked = true;
	const calls = fakeSiteIcons(sandbox, SITE_ICONS);
	let shown = 0;
	assert.equal(await TilePictures.applyToTiles(TilePicture.siteIcon, () => { shown++; }), 2, 'the screenshot tile and the one in the folder');
	assert.equal(shown, 2, 'the pages are told after each tile');
	assert.deepEqual([shotTile.imageSource, innerTile.imageSource], [ImageSource.siteIcon, ImageSource.siteIcon]);
	assert.equal(storedPicture(sandbox, fileTile), WEBP_PICTURE, 'the user\'s own picture stays');
	assert.equal(keptTile.imageSource, undefined, 'and so does a kept one');
	assert.equal(calls.find, 2);
	assert.equal(folder.imageSource, undefined, 'a folder takes no icon');
	assert.equal(await TilePictures.applyToTiles(TilePicture.siteIconOrPage), 0, 'icons already');
	const shots = download.calls;
	assert.equal(await TilePictures.applyToTiles(TilePicture.page), 2);
	assert.equal(download.calls, shots + 2);
	assert.deepEqual([shotTile.imageSource, innerTile.imageSource], [undefined, undefined]);
	assert.equal(await TilePictures.applyToTiles('1'), 0, 'not a kind of picture');
});

test('Apply to tiles, the icon or a screenshot: a site without an icon keeps its screenshot', async () => {
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const { TilePictures } = sandbox.app, tile = sandbox.app.node.children[0], download = instantDownload(sandbox);
	await TilePictures.refresh(tile);
	fakeSiteIcons(sandbox, NO_ICONS);
	assert.equal(await TilePictures.applyToTiles(TilePicture.siteIconOrPage), 1, 'looked at');
	assert.equal(download.calls, 1, 'no new screenshot');
	assert.equal(tile.imageSource, undefined);
	assert.equal(storedPicture(sandbox, tile), WEBP_PICTURE);
});

test('an icon chosen in the icon picker is the user\'s own picture: Refresh keeps it, Apply to tiles leaves it', async () => {
	const PICKED_PICTURE = 'data:image/webp;base64,UElDSw==';
	const sandbox = await setup([bookmark('a')]);
	await sync(sandbox);
	const { GridNodes, TilePictures } = sandbox.app, tile = sandbox.app.node.children[0], download = instantDownload(sandbox);
	fakeSiteIcons(sandbox, SITE_ICONS);
	await GridNodes.updateNode(tile, { image: PICKED_PICTURE, imageSource: ImageSource.icon });
	await TilePictures.refresh(tile);
	assert.equal(storedPicture(sandbox, tile), PICKED_PICTURE, 'Refresh keeps it');
	assert.equal(tile.imageSource, ImageSource.icon);
	assert.equal(download.calls, 0, 'no screenshot');
	assert.equal(await TilePictures.applyToTiles(TilePicture.siteIcon), 0, 'Apply to tiles leaves it');
	assert.equal(await TilePictures.applyToTiles(TilePicture.page), 0);
	assert.equal(storedPicture(sandbox, tile), PICKED_PICTURE);
});
