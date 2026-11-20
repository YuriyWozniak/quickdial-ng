// Editing from the dial (js/dial.js, js/ui.js dialogs and popup frame): the commands of its context menu (new bookmark
// or folder, delete, refresh, capture, properties), its dialogs by keyboard, and its Settings items.
// The menu itself lives in the background page (toolbar-menus.js); here its commands are sent to the
// dial as the background page does, after a mousedown on the tile, as a right-click would.
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js) and no pictures; drawing
// pages works (stubDrawWindow), so on opening, the dial fetches every site: the tiles then have pictures
// and are titled with their host ("site2.example", the test server's stub pages). A local page
// (/site/news.html) stands for a real site where its title matters.
// The steps build on each other: "News page" (cell 7) stays and is refreshed later; the other tiles and
// folders made here are deleted again. Capture is only checked up to the request (siteinfos.js tests it).
'use strict';
const { freshProfile, spyTabs, stubDrawWindow, sitePage } = require('../lib/fixtures');

// The titles of the tiles the dial shows
const shown = t => t.inDial(() => [...document.querySelectorAll('table.qd-grid a:not(.is-empty)')].map(a => a.lastChild.innerText));
// What the context menu does: the dial remembers the tile under the mouse, the background page sends the command.
// Returns the tile's class right after the command (e.g. is-loading).
const menu = (t, cmd, title) => t.inDial(([cmd, title]) => {
	const link = title && [...document.querySelectorAll('table.qd-grid a:not(.is-empty)')].find(a => a.lastChild.innerText === title);
	if (title && !link) throw new Error('no tile "' + title + '"');
	if (link) link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
	top.fire('rt.onMessage.dial', { cmd }, {}, () => {});
	return link && link.className;
}, [cmd, title || null]);
const C = { createBookmark: 200, createFolder: 201, editProperties: 203, refresh: 204, capture: 206, delete: 207 };

module.exports = {
	title: 'Dial menu: new bookmark and folder, delete, refresh, capture, properties, Settings',
	async run(t) {
		await freshProfile(t);
		await stubDrawWindow(t);
		await t.loadDial();
		await t.waitFor('the tiles to fetch their sites (titled with their host)', () => bg().app.node.children.filter(c => c.image === '1').length === 6);
		const page = sitePage(t, 'news.html', '<!doctype html><html><head><title>News page</title></head><body><h1>News</h1></body></html>');

		// ----- New bookmark: the address is checked; the new tile fetches its title and picture -----
		await menu(t, C.createBookmark);
		let d = await t.answer({ values: ['javascript:alert(1)'] });
		t.check('New bookmark refuses an address that isn\'t a web page', /web address/.test(d.error), d);
		d = await t.answer({ ok: false });
		await menu(t, C.createBookmark);
		await t.answer({ values: [page] });
		await t.waitFor('the new tile with its picture', () => { const n = bg().app.node.children.find(c => c.url && c.url.includes('news.html')); return n && n.image === '1'; });
		await t.waitFor('the dial to show it', () => [...win('dial').document.querySelectorAll('table.qd-grid a.is-bookmark')].some(a => a.lastChild.innerText === 'News page' && a.firstChild.style.backgroundImage));
		let st = await t.J(() => ({ tile: bg().app.node.children[7], bookmark: S.bm.children[0].children[0].children.find(c => c.url && c.url.includes('news.html')) }));
		t.check('New bookmark adds a tile at the end and fetches its title and picture', st.tile && st.tile.title === 'News page' && st.bookmark && st.bookmark.title === 'News page', st);
		await menu(t, C.createBookmark);
		await t.answer({ values: ['example.org'] });
		st = await t.waitFor('the tile', () => { const n = bg().app.node.children[8]; return n && n.url; });
		t.check('an address without a scheme gets https://', st === 'https://example.org', st);
		await t.J(() => bg().browser.bookmarks.removeTree(bg().app.node.children[8].id));
		await t.idle();

		// ----- New folder, Delete -----
		await menu(t, C.createFolder);
		d = await t.answer();
		await t.waitFor('the new folder', () => bg().app.node.children.some(c => c.title === 'New Folder'));
		await t.waitFor('the dial to show it', () => win('dial').document.querySelectorAll('table.qd-grid a.is-folder').length === 2);
		st = await t.J(() => S.bm.children[0].children[0].children.some(c => c.title === 'New Folder' && !c.url));
		t.check('New folder adds a folder tile and its bookmarks folder', st && d.error === null);

		await menu(t, C.delete, 'New Folder');
		d = await t.answer({ ok: false });
		await t.idle();
		t.check('Delete asks first; Cancel keeps the tile', d.title === 'dialogDeleteConfirmation' && (await shown(t)).includes('New Folder'), d);
		await menu(t, C.delete, 'New Folder');
		await t.answer();
		await t.waitFor('the tile to go', () => !bg().app.node.children.some(c => c.title === 'New Folder'));
		await t.waitFor('the dial to follow', () => ![...win('dial').document.querySelectorAll('table.qd-grid a:not(.is-empty)')].some(a => a.lastChild.innerText === 'New Folder'));
		st = await t.J(() => S.bm.children[0].children[0].children.some(c => c.title === 'New Folder'));
		t.check('Delete removes the tile and its bookmark', !st);

		// ----- the dialogs by keyboard: Enter accepts, Escape cancels -----
		await menu(t, C.createFolder);
		await t.dial().locator('.qd-dialog input').fill('Keyboard');
		await t.dial().locator('.qd-dialog input').press('Enter');
		await t.waitFor('the folder', () => bg().app.node.children.some(c => c.title === 'Keyboard'));
		await t.waitFor('the dial to show it', () => [...win('dial').document.querySelectorAll('table.qd-grid a.is-folder')].some(a => a.lastChild.innerText === 'Keyboard'));
		await menu(t, C.delete, 'Keyboard');
		await t.dial().locator('.qd-overlay:not(.is-closing) .qd-dialog').waitFor();
		st = await t.inDial(() => document.activeElement.textContent);
		await t.dial().locator('.qd-dialog .qd-btn').first().press('Escape');
		await t.waitFor('the dialog to close', () => !win('dial').document.querySelector('.qd-overlay:not(.is-closing)'));
		await t.idle();
		t.check('dialogs: Enter accepts, Escape cancels; a delete has Cancel focused', (await t.J(() => bg().app.node.children.some(c => c.title === 'Keyboard'))) && st === 'Cancel', st);

		// ----- Refresh: the page is fetched again (here with a new title); the tile shows the loading picture meanwhile -----
		sitePage(t, 'news.html', '<!doctype html><html><head><title>News, updated</title></head><body></body></html>');
		st = await menu(t, C.refresh, 'News page');
		await t.waitFor('the new title', () => [...win('dial').document.querySelectorAll('table.qd-grid a')].some(a => a.lastChild.innerText === 'News, updated'));
		t.check('Refresh shows the loading picture, then the new title', st === 'is-loading', st);
		const spinner = await t.inDial(() => dial.styles.grid.linkLoading.backgroundImage);
		t.check('the loading picture is the built-in spinner', spinner.includes('/img/loading.svg'), spinner);

		// ----- Capture page and Properties: the dial asks the background page / opens the popup for the tile under the mouse -----
		await t.J(() => { const g = bg().app.GridNodes; bg().qdCaptured = []; g.capturePage = node => { bg().qdCaptured.push(node.id); return Promise.resolve(null); }; });
		await menu(t, C.capture, 'site2.example');
		st = await t.waitFor('the capture request', () => bg().qdCaptured.length && bg().qdCaptured);
		t.check('Capture page asks for the tile under the mouse', t.same(st, ['b2']), st);
		await menu(t, C.editProperties, 'site3.example');
		st = await t.waitFor('the Properties popup', () => { const f = win('dial').document.querySelector('.qd-frame iframe'); return f && f.getAttribute('src'); });
		t.check('Properties opens in a popup for that tile', st === '/html/properties.html?id=b3', st);
		await t.waitFor('the popup to load', () => { const f = win('dial').document.querySelector('.qd-frame iframe'); return f && f.contentWindow.app && f.contentWindow.app.node; });
		await t.dial().locator('body').press('Escape');
		await t.waitFor('the popup to close', () => !win('dial').document.querySelector('.qd-overlay'));
		t.check('Escape closes the popup', true);

		// ----- the dial's Settings items open the Settings tab (0.5.0) -----
		await spyTabs(t);
		await t.inDial(() => { app.editSettings('backup'); app.editSettings(new MouseEvent('click')); });
		st = await t.waitFor('the tabs', () => bg().qdTabs.length === 2 && bg().qdTabs);
		t.check('the dial\'s Settings items open the Settings tab', t.same(st, [['create', { url: 'html/settings.html?tab=backup' }], ['create', { url: 'html/settings.html' }]]), st);

		// ----- the tile menu also opens on a folder's Back tile: its items do nothing there -----
		await t.loadDial('?path=%2FFolder');
		await t.J(() => { bg().qdCaptured = []; });
		const classes = [];
		for (const cmd of [C.refresh, C.capture, C.editProperties, C.delete]) classes.push(await menu(t, cmd, 'Back'));
		await t.idle();
		st = await t.inDial(() => ({ back: document.querySelector('table.qd-grid a').className, popup: !!document.querySelector('.qd-overlay') }));
		st.classes = classes;
		st.captured = await t.J(() => bg().qdCaptured.length);
		t.check('Refresh, Capture, Properties and Delete on the Back tile change nothing', t.same(classes, ['is-back', 'is-back', 'is-back', 'is-back']) && st.back === 'is-back' && !st.popup && st.captured === 0, st);
	}
};
