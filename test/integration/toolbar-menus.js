// The toolbar button and the context menus (js/background/app.js, menus.js): what a click opens, the
// Settings tab brought forward instead of opened twice, and every context menu item (web pages, the
// dial page, its tiles, the toolbar button).
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js). The tabs API is replaced by
// one that records the calls (spyTabs), so "what opens" is a list like [['create', { url }]].
// The mock keeps every menu item Firefox would show (S.menuItems, with its onclick), so a click is a call
// of that onclick. Items meant for the dial page only send it a command: what the dial does with them is
// in dial-edit.js.
// The steps build on each other: "Add to Quick Dial" adds a tile at the end; the last step turns
// that item off.
'use strict';
const { freshProfile, spyTabs } = require('../lib/fixtures');

// Clicks the menu item with this title (and parent menu, if given), as Firefox would; the tabs record starts empty
const click = (t, title, parentId, info, tab) => t.J(([title, parentId, info, tab]) => {
	const item = (S.menuItems || []).find(m => m.title === title && (!parentId || m.parentId === parentId));
	if (!item) throw new Error('no menu item ' + title + (parentId ? ' in ' + parentId : ''));
	bg().qdTabs = [];
	item.onclick(info || {}, tab || { id: 3 });
}, [title, parentId || null, info || null, tab || null]);
// What the background page asked the tabs API for since then
const tabs = t => t.J(() => bg().qdTabs);

module.exports = {
	title: 'Toolbar button, the Settings tab, and every context menu item',
	async run(t) {
		await freshProfile(t);
		await spyTabs(t);

		// ----- the toolbar button -----
		const clicks = {};
		for (const action of ['settings', 'newtab', 'current']) {
			await t.J(action => { bg().app.settings.toolbarAction = action; bg().qdTabs = []; fire('ba.onClicked', { id: 3 }); }, action);
			clicks[action] = await t.waitFor('the tab', () => bg().qdTabs.length && bg().qdTabs);
		}
		t.check('the toolbar button opens Settings, the dial in a new tab, or the dial in this tab', t.same(clicks, { settings: [['create', { url: 'html/settings.html' }]], newtab: [['create', {}]], current: [['update', 3, { url: '/dial.html' }]] }), clicks);
		await t.J(() => { bg().app.settings.toolbarAction = 'settings'; bg().qdTabs = []; bg().qdOpen = [{ id: 9, windowId: 1, url: 'html/settings.html?tab=grid' }]; return bg().app.openSettings('backup'); });
		let st = await tabs(t);
		t.check('Settings already open: that tab comes forward and shows the section', t.same(st, [['message', 9, 209, 'backup'], ['update', 9, { active: true }]]), st);
		await t.J(() => { bg().qdTabs = []; return bg().app.openSettings('../../x'); });
		st = await tabs(t);
		t.check('a section name that isn\'t one is ignored', t.same(st, [['update', 9, { active: true }]]), st);
		await t.J(() => { bg().qdOpen = []; });

		// ----- the menus: every item there, and what each one does -----
		st = await t.J(() => S.menus);
		t.check('the menus are all there', ['menuAddToQuickDial', 'menuNewBookmark', 'menuNewFolder', 'menuSettings', 'menuImportQuickDial', 'menuProperties', 'menuRefreshItem', 'menuCapturePage', 'menuDeleteItem', 'menuOpenDial'].every(m => st.includes(m)), st);
		await click(t, 'menuAddToQuickDial', null, { menuItemId: 'AddToQuickDial', pageUrl: 'https://added.example/page' }, { id: 4, title: 'Added page' });
		st = await t.waitFor('the new tile', () => bg().app.node.children.find(c => c.url === 'https://added.example/page'));
		const bookmark = await t.J(() => S.bm.children[0].children[0].children.find(c => c.url === 'https://added.example/page'));
		t.check('Add to Quick Dial (on a web page) adds a tile and its bookmark', st.title === 'Added page' && bookmark && bookmark.title === 'Added page', [st, bookmark]);
		const sent = {};
		for (const [title, parent] of [['menuNewBookmark', 'pagemenunew'], ['menuNewFolder', 'itemmenunew'], ['menuProperties'], ['menuRefreshItem'], ['menuCapturePage'], ['menuDeleteItem']]) {
			await click(t, title, parent);
			sent[title] = (await tabs(t)).map(c => c[2]).join();
		}
		t.check('the dial\'s items ask that dial page to act (on the tile under the mouse)', t.same(sent, { menuNewBookmark: '200', menuNewFolder: '201', menuProperties: '203', menuRefreshItem: '204', menuCapturePage: '206', menuDeleteItem: '207' }), sent);
		await click(t, 'menuSettings', 'pagemenu');
		st = await tabs(t);
		await click(t, 'menuImportQuickDial', 'pagemenu');
		st = st.concat(await tabs(t));
		await click(t, 'menuSettings', 'itemmenu');
		st = st.concat(await tabs(t));
		await click(t, 'menuOpenDial');
		st = st.concat(await tabs(t));
		t.check('Settings, Import from Quick Dial and Open the dial open their tabs', t.same(st, [['create', { url: 'html/settings.html' }], ['create', { url: 'html/settings.html?tab=backup' }], ['create', { url: 'html/settings.html' }], ['create', { url: '/dial.html' }]]), st);

		// ----- a settings change builds the menus again: without "Add to Quick Dial" when it is turned off -----
		await t.J(() => { const s = JSON.parse(JSON.stringify(bg().app.settings)); s.menuShowAdd = false; fire('rt.onMessage.bg', { cmd: 1, settings: s }, {}, () => {}); });
		await t.idle();
		st = await t.J(() => S.menus);
		t.check('turning "Add to Quick Dial" off removes it from the page menu, once', !st.includes('menuAddToQuickDial') && st.filter(m => m === 'menuOpenDial').length === 1, st);
	}
};
