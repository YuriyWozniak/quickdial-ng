// A tile's title and picture from its site (js/background/siteinfos.js, tilepictures.js): Refresh downloads
// the page and draws it in a sandboxed frame; Capture page opens it in a background tab and takes a
// screenshot. Called on the background page directly; the dial's menu commands for them are in dial-edit.js.
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js), no pictures.
// Stand-ins: Chromium has no drawWindow (Firefox's way to draw a page): stubDrawWindow records what it was
// asked to draw, and is removed again to test Firefox versions that refuse it. Capture needs tabs: fakeTabs
// opens a pretend tab (loading once, then complete) and returns a blank screenshot, or fails in one of its ways.
// The steps build on each other only through the tiles: b1 ends without a picture, b2 and b3 captured
// (b3 with a locked title, then b2 with a locked picture), f1 captured, b4 failed captures and then one of
// a page that never finished loading (with shorter waiting times, set back at the end).
'use strict';
const { freshProfile, stubDrawWindow, sitePage, changeSettings } = require('../lib/fixtures');

// The id of the pretend tab fakeTabs opens; the size of its page and screenshot
const FAKE_TAB_ID = 7, FAKE_TAB_SIZE = { width: 1200, height: 1600 };
// A tabs API that opens a "tab", reports it loaded and captures a screenshot; the calls are kept in backgroundPage().qdTabs.
// Options: fail (the screenshot fails), loading (the tab never finishes loading), switched (another tab is
// shown by the time of the screenshot), noShow (the tab can't be shown).
const fakeTabs = (testPage, options) => testPage.inHost(([failure, tabId, tabSize]) => {
	const page = backgroundPage();
	page.qdTabs = [];
	let active = false, statusPolls = 0;
	page.browser.tabs.create = properties => { page.qdTabs.push(['create', properties.url, properties.active]); return Promise.resolve({ id: tabId }); };
	page.browser.tabs.update = (id, changes) => {
		page.qdTabs.push(['update', Object.keys(changes).join()]);
		if (changes.active && failure.noShow) return Promise.reject(new Error('no'));
		if (changes.active) active = !failure.switched;
		return Promise.resolve({ id });
	};
	page.browser.tabs.get = id => Promise.resolve({ id, windowId: 1, active, status: statusPolls++ && !failure.loading ? 'complete' : 'loading', ...tabSize,
		url: 'https://shot.example/', title: 'Captured title', favIconUrl: null });
	page.browser.tabs.captureVisibleTab = () => {
		if (failure.fail) return Promise.reject(new Error('no'));
		const canvas = page.document.createElement('canvas');
		canvas.width = tabSize.width; canvas.height = tabSize.height;
		return Promise.resolve(canvas.toDataURL('image/png'));
	};
	page.browser.tabs.remove = id => { page.qdTabs.push(['remove', id]); return Promise.resolve(); };
}, [options || {}, FAKE_TAB_ID, FAKE_TAB_SIZE]);
// Capture page / Refresh for a tile by id; both resolve with the site infos (title, picture) or null
const capture = (testPage, id) => testPage.inHost(nodeId => { const app = backgroundPage().app; return app.TilePictures.capturePage(app.GridNodes.getNodeById(nodeId)); }, id);
const refresh = (testPage, id) => testPage.inHost(nodeId => { const app = backgroundPage().app; return app.TilePictures.refresh(app.GridNodes.getNodeById(nodeId)); }, id);
// A node of the background page by id
const nodeById = (testPage, id) => testPage.inHost(nodeId => backgroundPage().app.GridNodes.getNodeById(nodeId), id);
// The last call made to the tabs API
const lastTabCall = testPage => testPage.inHost(() => backgroundPage().qdTabs.slice(-1));
// How often and how long SiteInfos checks whether a tab has loaded (ms): shortened for the test, and as shipped
const SHORT_LOAD_WAIT = { poll: 20, timeout: 200 }, SHIPPED_LOAD_WAIT = { poll: 300, timeout: 30000 };
const setLoadWait = (testPage, wait) => testPage.inHost(({ poll, timeout }) => { const SiteInfos = backgroundPage().app.SiteInfos; SiteInfos.LOAD_POLL = poll; SiteInfos.LOAD_TIMEOUT = timeout; }, wait);

module.exports = {
	title: 'Refresh (sandboxed download) and Capture page (screenshot of a tab)',
	async run(testPage) {
		await freshProfile(testPage);

		// ----- Refresh: the page is drawn in a sandboxed frame; its own scripts never run -----
		const pageAddress = sitePage(testPage, 'page.html', '<!doctype html><html><head><title>Sandboxed page</title>' +
			'<script>top.qdRan = "script";</script></head><body onload="top.qdRan = \'onload\'"><h1>Hello</h1></body></html>');
		await stubDrawWindow(testPage);
		const sandboxed = await testPage.inHost(url => backgroundPage().app.SiteInfos.fromFrame(url).then(infos => ({ infos: infos && { title: infos.title, picture: !!infos.screenshot },
			drawn: backgroundPage().qdDrawn, ran: window.qdRan || backgroundPage().qdRan || null, frames: backgroundPage().document.querySelectorAll('iframe').length })), pageAddress + '?a=1&b="2"');
		testPage.check('Refresh draws the page in a sandbox without scripts, reads its title, removes the frame', sandboxed.infos && sandboxed.infos.title === 'Sandboxed page' && sandboxed.infos.picture
			&& sandboxed.drawn.sandbox === 'allow-same-origin' && sandboxed.drawn.base.endsWith('/site/page.html?a=1&b=%222%22') && sandboxed.ran === null && sandboxed.frames === 0, sandboxed);
		const notDownloaded = await testPage.inHost(() => Promise.all(['javascript:alert(1)', 'place:sort=8', 'file:///C:/x.html', 'http://a b/']
			.map(address => backgroundPage().app.SiteInfos.fromFrame(address).then(infos => infos === null))));
		testPage.check('addresses that aren\'t web pages are not downloaded', notDownloaded.every(Boolean), notDownloaded);
		await testPage.inHost(() => { delete backgroundPage().CanvasRenderingContext2D.prototype.drawWindow; });
		const withoutDrawWindow = await testPage.inHost(url => backgroundPage().app.SiteInfos.fromFrame(url), pageAddress);
		testPage.check('without drawWindow (refused in recent Firefox) Refresh gives up cleanly', withoutDrawWindow === null, withoutDrawWindow);
		await refresh(testPage, 'b1');
		await testPage.idle();
		const refreshedTile = await nodeById(testPage, 'b1');
		testPage.check('...and the tile is marked as having no picture', refreshedTile.image === '0' && !refreshedTile.__isLoading, refreshedTile);

		// ----- Capture page: a background tab, shown once loaded, captured after the snapshot delay, then closed -----
		await changeSettings(testPage, { grid: { cells: { snapshotDelay: 50 } } });
		await fakeTabs(testPage);
		const captured = await capture(testPage, 'b2');
		await testPage.idle();
		const tabCalls = await testPage.inHost(() => backgroundPage().qdTabs);
		const capturedTile = await nodeById(testPage, 'b2');
		const storedPicture = await testPage.inHost(() => (mockState.storage.img_b2 || '').slice(0, 15));
		testPage.check('Capture opens the page in a background tab, shows it, captures it and closes it', testPage.same(tabCalls,
			[['create', 'https://site2.example/', false], ['update', 'muted'], ['update', 'active'], ['remove', FAKE_TAB_ID]]), tabCalls);
		testPage.check('...and the tile gets the tab\'s title and a WebP picture', captured && captured.title === 'Captured title' && capturedTile.title === 'Captured title'
			&& capturedTile.image === '1' && storedPicture === 'data:image/webp', [capturedTile, storedPicture]);
		await testPage.inHost(() => { backgroundPage().app.GridNodes.getNodeById('b3').titleLocked = true; });
		await fakeTabs(testPage);
		await capture(testPage, 'b3');
		await testPage.idle();
		const titleLockedTile = await nodeById(testPage, 'b3');
		testPage.check('a locked title is kept', titleLockedTile.title === 'Site 3' && titleLockedTile.image === '1', titleLockedTile);
		await testPage.inHost(() => { backgroundPage().app.GridNodes.getNodeById('b2').imageLocked = true; });
		await fakeTabs(testPage);
		const storedPictureSize = () => testPage.inHost(() => mockState.storage.img_b2.length);
		const sizeBefore = await storedPictureSize();
		await capture(testPage, 'b2');
		await testPage.idle();
		testPage.check('a kept picture is not replaced', (await storedPictureSize()) === sizeBefore);
		await fakeTabs(testPage);
		await capture(testPage, 'f1');
		await testPage.idle();
		const folderCapture = { firstTabCall: await testPage.inHost(() => backgroundPage().qdTabs[0]), image: (await nodeById(testPage, 'f1')).image };
		testPage.check('capturing a folder takes a picture of its own dial page', testPage.same(folderCapture.firstTabCall, ['create', '/dial.html?path=%2FFolder', false]) && folderCapture.image === '1', folderCapture);
		await testPage.inHost(() => { backgroundPage().app.GridNodes.getNodeById('f1').title = 'R&D #1?'; });
		await fakeTabs(testPage);
		await capture(testPage, 'f1');
		await testPage.idle();
		const folderAddress = await testPage.inHost(() => {
			const url = backgroundPage().qdTabs[0][1];
			backgroundPage().app.GridNodes.getNodeById('f1').title = 'Folder';
			return { url, path: new URL(url, 'moz-extension://x/').searchParams.get('path') };
		});
		testPage.check('...whose path keeps a folder name with & # ? in it', folderAddress.path === '/R&D #1?', folderAddress);

		// ----- failed captures -----
		// Captures b4 with a failing tabs API; what it answered, the last tab call and the tile
		const failedCapture = async failure => {
			await fakeTabs(testPage, failure);
			const infos = await capture(testPage, 'b4');
			await testPage.idle();
			return { infos, lastTabCall: await lastTabCall(testPage), node: await nodeById(testPage, 'b4') };
		};
		const tabClosed = outcome => testPage.same(outcome.lastTabCall, [['remove', FAKE_TAB_ID]]);
		const screenshotFailed = await failedCapture({ fail: true });
		testPage.check('a failed capture closes the tab and marks the tile as having no picture', screenshotFailed.infos == null && tabClosed(screenshotFailed) && screenshotFailed.node.image === '0', screenshotFailed);
		const tabSwitched = await failedCapture({ switched: true });
		testPage.check('when another tab is shown at the moment of the screenshot, nothing is captured and the tab is closed', tabSwitched.infos == null && tabClosed(tabSwitched)
			&& tabSwitched.node.image === '0' && !tabSwitched.node.__isLoading, tabSwitched);
		const notShown = await failedCapture({ noShow: true });
		testPage.check('a tab that can\'t be shown is closed too', notShown.infos == null && tabClosed(notShown), notShown);
		await setLoadWait(testPage, SHORT_LOAD_WAIT);
		const neverLoaded = await failedCapture({ loading: true });
		testPage.check('a page that never finishes loading is captured once the waiting time is over', neverLoaded.infos && neverLoaded.infos.title === 'Captured title'
			&& tabClosed(neverLoaded) && neverLoaded.node.image === '1', neverLoaded);
		await setLoadWait(testPage, SHIPPED_LOAD_WAIT);

		// ----- a tile already loading -----
		await fakeTabs(testPage);
		const loadedOnce = await testPage.inHost(() => {
			const { GridNodes, TilePictures } = backgroundPage().app, tile = GridNodes.getNodeById('b5');
			const firstLoad = TilePictures.capturePage(tile), askedAgain = [TilePictures.capturePage(tile), TilePictures.refresh(tile)];
			return Promise.all([firstLoad].concat(askedAgain)).then(results => ({ same: askedAgain.every(load => load === firstLoad), title: results[0] && results[0].title,
				opened: backgroundPage().qdTabs.filter(call => call[0] === 'create').length, loading: !!tile.__isLoading }));
		});
		testPage.check('a tile already loading is not loaded twice: asked again, the load under way answers', loadedOnce.same && loadedOnce.title === 'Captured title' && loadedOnce.opened === 1 && !loadedOnce.loading, loadedOnce);
	}
};
