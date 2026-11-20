// A tile's title and picture from its site (js/background/siteinfos.js, gridnodes.js): Refresh downloads
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

// A tabs API that opens a "tab", reports it loaded and captures a screenshot; the calls are kept in bg().qdTabs.
// Options: fail (the screenshot fails), loading (the tab never finishes loading), switched (another tab is
// shown by the time of the screenshot), noShow (the tab can't be shown).
const fakeTabs = (t, options) => t.J(o => {
	const w = bg(); w.qdTabs = [];
	let active = false, polls = 0;
	w.browser.tabs.create = c => { w.qdTabs.push(['create', c.url, c.active]); return Promise.resolve({ id: 7 }); };
	w.browser.tabs.update = (id, u) => {
		w.qdTabs.push(['update', Object.keys(u).join()]);
		if (u.active && o.noShow) return Promise.reject(new Error('no'));
		if (u.active) active = !o.switched;
		return Promise.resolve({ id });
	};
	w.browser.tabs.get = id => Promise.resolve({ id, windowId: 1, active, status: polls++ && !o.loading ? 'complete' : 'loading', width: 1200, height: 1600, url: 'https://shot.example/', title: 'Captured title', favIconUrl: null });
	w.browser.tabs.captureVisibleTab = () => { if (o.fail) return Promise.reject(new Error('no')); const c = w.document.createElement('canvas'); c.width = 1200; c.height = 1600; return Promise.resolve(c.toDataURL('image/png')); };
	w.browser.tabs.remove = id => { w.qdTabs.push(['remove', id]); return Promise.resolve(); };
}, options || {});
// Capture page / Refresh for a tile by id; both resolve with the site infos (title, picture) or null
const capture = (t, id) => t.J(id => { const g = bg().app.GridNodes; return g.capturePage(g.getNodeById(id)); }, id);
const refresh = (t, id) => t.J(id => { const g = bg().app.GridNodes; return g.refreshNode(g.getNodeById(id)); }, id);

module.exports = {
	title: 'Refresh (sandboxed download) and Capture page (screenshot of a tab)',
	async run(t) {
		await freshProfile(t);

		// ----- Refresh: the page is drawn in a sandboxed frame; its own scripts never run -----
		const page = sitePage(t, 'page.html', '<!doctype html><html><head><title>Sandboxed page</title>' +
			'<script>top.qdRan = "script";</script></head><body onload="top.qdRan = \'onload\'"><h1>Hello</h1></body></html>');
		await stubDrawWindow(t);
		let st = await t.J(url => bg().app.SiteInfos.fromFrame(url).then(infos => ({ infos: infos && { title: infos.title, pic: !!infos.screenshot },
			drawn: bg().qdDrawn, ran: window.qdRan || bg().qdRan || null, frames: bg().document.querySelectorAll('iframe').length })), page + '?a=1&b="2"');
		t.check('Refresh draws the page in a sandbox without scripts, reads its title, removes the frame', st.infos && st.infos.title === 'Sandboxed page' && st.infos.pic && st.drawn.sandbox === 'allow-same-origin' &&
			st.drawn.base.endsWith('/site/page.html?a=1&b=%222%22') && st.ran === null && st.frames === 0, st);
		st = await t.J(() => Promise.all(['javascript:alert(1)', 'place:sort=8', 'file:///C:/x.html', 'http://a b/'].map(u => bg().app.SiteInfos.fromFrame(u).then(i => i === null))));
		t.check('addresses that aren\'t web pages are not downloaded', st.every(Boolean), st);
		await t.J(() => { delete bg().CanvasRenderingContext2D.prototype.drawWindow; });
		st = await t.J(url => bg().app.SiteInfos.fromFrame(url), page);
		t.check('without drawWindow (refused in recent Firefox) Refresh gives up cleanly', st === null, st);
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
		t.check('capturing a folder takes a picture of its own dial page', t.same(st.tabs, ['create', '/dial.html?path=%2FFolder', false]) && st.image === '1', st);
		await t.J(() => { bg().app.GridNodes.getNodeById('f1').title = 'R&D #1?'; });
		await fakeTabs(t);
		await capture(t, 'f1');
		await t.idle();
		st = await t.J(() => { const url = bg().qdTabs[0][1]; bg().app.GridNodes.getNodeById('f1').title = 'Folder'; return { url, path: new URL(url, 'moz-extension://x/').searchParams.get('path') }; });
		t.check('...whose path keeps a folder name with & # ? in it', st.path === '/R&D #1?', st);
		await fakeTabs(t, { fail: true });
		st = await capture(t, 'b4');
		await t.idle();
		st = { infos: st, tabs: await t.J(() => bg().qdTabs.slice(-1)), node: await t.J(() => bg().app.GridNodes.getNodeById('b4')) };
		t.check('a failed capture closes the tab and marks the tile as having no picture', st.infos == null && t.same(st.tabs, [['remove', 7]]) && st.node.image === '0', st);
		await fakeTabs(t, { switched: true });
		st = await capture(t, 'b4');
		await t.idle();
		st = { infos: st, tabs: await t.J(() => bg().qdTabs.slice(-1)), node: await t.J(() => bg().app.GridNodes.getNodeById('b4')) };
		t.check('when another tab is shown at the moment of the screenshot, nothing is captured and the tab is closed', st.infos == null && t.same(st.tabs, [['remove', 7]]) && st.node.image === '0' && !st.node.__isLoading, st);
		await fakeTabs(t, { noShow: true });
		st = await capture(t, 'b4');
		st = { infos: st, tabs: await t.J(() => bg().qdTabs.slice(-1)) };
		t.check('a tab that can\'t be shown is closed too', st.infos == null && t.same(st.tabs, [['remove', 7]]), st);
		await t.J(() => { const s = bg().app.SiteInfos; s.LOAD_POLL = 20; s.LOAD_TIMEOUT = 200; });
		await fakeTabs(t, { loading: true });
		st = await capture(t, 'b4');
		await t.idle();
		st = { infos: st, tabs: await t.J(() => bg().qdTabs.slice(-1)), node: await t.J(() => bg().app.GridNodes.getNodeById('b4')) };
		t.check('a page that never finishes loading is captured once the waiting time is over', st.infos && st.infos.title === 'Captured title' && t.same(st.tabs, [['remove', 7]]) && st.node.image === '1', st);
		await t.J(() => { const s = bg().app.SiteInfos; s.LOAD_POLL = 300; s.LOAD_TIMEOUT = 30000; });
		await fakeTabs(t);
		st = await t.J(() => { const g = bg().app.GridNodes, n = g.getNodeById('b5'), first = g.capturePage(n), again = [g.capturePage(n), g.refreshNode(n)];
			return Promise.all([first].concat(again)).then(r => ({ same: again.every(p => p === first), title: r[0] && r[0].title, opened: bg().qdTabs.filter(c => c[0] === 'create').length, loading: !!n.__isLoading })); });
		t.check('a tile already loading is not loaded twice: asked again, the load under way answers', st.same && st.title === 'Captured title' && st.opened === 1 && !st.loading, st);
	}
};
