// A tile's title and picture from its site (js/background/siteinfos.js, gridnodes.js): Refresh downloads
// the page and draws it in a sandboxed frame; Capture page opens it in a background tab and takes a
// screenshot. Called on the background page directly; the dial's menu commands for them are in dial-edit.js.
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js), no pictures.
// Stand-ins: Chromium has no drawWindow (Firefox's way to draw a page): stubDrawWindow records what it was
// asked to draw, and is removed again to test Firefox versions that refuse it. Capture needs tabs: fakeTabs
// opens a pretend tab (loading once, then complete) and returns a blank screenshot, or fails.
// The steps build on each other only through the tiles: b1 ends without a picture, b2 and b3 captured
// (b3 with a locked title, then b2 with a locked picture), f1 captured, b4 a failed capture.
'use strict';
const { freshProfile, stubDrawWindow, sitePage, changeSettings } = require('../lib/fixtures');

// A tabs API that opens a "tab", reports it loaded and captures a screenshot (or fails to); the calls are kept in bg().qdTabs
const fakeTabs = (t, fail) => t.J(fail => {
	const w = bg(); w.qdTabs = [];
	w.browser.tabs.create = o => { w.qdTabs.push(['create', o.url, o.active]); return Promise.resolve({ id: 7 }); };
	w.browser.tabs.update = (id, o) => { w.qdTabs.push(['update', Object.keys(o).join()]); return Promise.resolve({ id }); };
	let polls = 0;
	w.browser.tabs.get = id => Promise.resolve({ id, status: polls++ ? 'complete' : 'loading', width: 1200, height: 1600, url: 'https://shot.example/', title: 'Captured title', favIconUrl: null });
	w.browser.tabs.captureVisibleTab = () => { if (fail) return Promise.reject(new Error('no')); const c = w.document.createElement('canvas'); c.width = 1200; c.height = 1600; return Promise.resolve(c.toDataURL('image/png')); };
	w.browser.tabs.remove = id => { w.qdTabs.push(['remove', id]); return Promise.resolve(); };
}, !!fail);
// Capture page / Refresh for a tile by id; both resolve with the site infos (title, picture) or nothing
const capture = (t, id) => t.J(id => new Promise(r => { const g = bg().app.GridNodes; g.capturePage(g.getNodeById(id), r); }), id);
const refresh = (t, id) => t.J(id => new Promise(r => { const g = bg().app.GridNodes; g.refreshNode(g.getNodeById(id), r); }), id);

module.exports = {
	title: 'Refresh (sandboxed download) and Capture page (screenshot of a tab)',
	async run(t) {
		await freshProfile(t);

		// ----- Refresh: the page is drawn in a sandboxed frame; its own scripts never run -----
		const page = sitePage(t, 'page.html', '<!doctype html><html><head><title>Sandboxed page</title>' +
			'<script>top.qdRan = "script";</script></head><body onload="top.qdRan = \'onload\'"><h1>Hello</h1></body></html>');
		await stubDrawWindow(t);
		let st = await t.J(url => new Promise(r => bg().app.SiteInfos.fromFrame(url, infos => r({ infos: infos && { title: infos.title, pic: !!infos.screenshot },
			drawn: bg().qdDrawn, ran: window.qdRan || bg().qdRan || null, frames: bg().document.querySelectorAll('iframe').length }))), page + '?a=1&b="2"');
		t.check('Refresh draws the page in a sandbox without scripts, reads its title, removes the frame', st.infos && st.infos.title === 'Sandboxed page' && st.infos.pic && st.drawn.sandbox === 'allow-same-origin' &&
			st.drawn.base.endsWith('/site/page.html?a=1&b=%222%22') && st.ran === null && st.frames === 0, st);
		st = await t.J(() => Promise.all(['javascript:alert(1)', 'place:sort=8', 'file:///C:/x.html', 'http://a b/'].map(u => new Promise(r => bg().app.SiteInfos.fromFrame(u, i => r(i === undefined))))));
		t.check('addresses that aren\'t web pages are not downloaded', st.every(Boolean), st);
		await t.J(() => { delete bg().CanvasRenderingContext2D.prototype.drawWindow; });
		st = await t.J(url => new Promise(r => bg().app.SiteInfos.fromFrame(url, r)), page);
		t.check('without drawWindow (refused in recent Firefox) Refresh gives up cleanly', st === null || st === undefined, st);
		st = await refresh(t, 'b1');
		await t.idle();
		st = await t.J(() => bg().app.GridNodes.getNodeById('b1'));
		t.check('...and the tile is marked as having no picture', st.image === '0' && !st.__isLoading, st);

		// ----- Capture page: a background tab, shown once loaded, captured after the snapshot delay, then closed -----
		await changeSettings(t, { grid: { cells: { snapshotDelay: 50 } } });
		await fakeTabs(t);
		st = await capture(t, 'b2');
		await t.idle();
		const tabs = await t.J(() => bg().qdTabs);
		const node = await t.J(() => bg().app.GridNodes.getNodeById('b2'));
		const stored = await t.J(() => (S.storage.img_b2 || '').slice(0, 15));
		t.check('Capture opens the page in a background tab, shows it, captures it and closes it', t.same(tabs, [['create', 'https://site2.example/', false], ['update', 'muted'], ['update', 'active'], ['remove', 7]]), tabs);
		t.check('...and the tile gets the tab\'s title and a WebP picture', st && st.title === 'Captured title' && node.title === 'Captured title' && node.image === '1' && stored === 'data:image/webp', [node, stored]);
		await t.J(() => { const n = bg().app.GridNodes.getNodeById('b3'); n.titleLocked = true; });
		await fakeTabs(t);
		await capture(t, 'b3');
		await t.idle();
		st = await t.J(() => bg().app.GridNodes.getNodeById('b3'));
		t.check('a locked title is kept', st.title === 'Site 3' && st.image === '1', st);
		await t.J(() => { const n = bg().app.GridNodes.getNodeById('b2'); n.imageLocked = true; });
		await fakeTabs(t);
		const before = await t.J(() => S.storage.img_b2.length);
		await capture(t, 'b2');
		await t.idle();
		t.check('a kept picture is not replaced', (await t.J(() => S.storage.img_b2.length)) === before);
		await fakeTabs(t);
		await capture(t, 'f1');
		await t.idle();
		st = { tabs: await t.J(() => bg().qdTabs[0]), image: await t.J(() => bg().app.GridNodes.getNodeById('f1').image) };
		t.check('capturing a folder takes a picture of its own dial page', t.same(st.tabs, ['create', '/dial.html?path=/Folder', false]) && st.image === '1', st);
		await fakeTabs(t, true);
		st = await capture(t, 'b4');
		await t.idle();
		st = { infos: st, tabs: await t.J(() => bg().qdTabs.slice(-1)), node: await t.J(() => bg().app.GridNodes.getNodeById('b4')) };
		t.check('a failed capture closes the tab and marks the tile as having no picture', st.infos == null && t.same(st.tabs, [['remove', 7]]) && st.node.image === '0', st);
		st = await t.J(() => { const g = bg().app.GridNodes, n = g.getNodeById('b5'); n.__isLoading = true; let called = false; g.capturePage(n, () => { called = true; }); g.refreshNode(n, () => { called = true; }); return called; });
		t.check('a tile already loading is not loaded twice', st === false);
	}
};
