// The toolbar button and the context menus (js/background/app.js, menus.js): what a click opens, the
// Settings tab brought forward instead of opened twice, and every context menu item (web pages, the
// dial page, its tiles, the toolbar button).
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js). The tabs API is replaced by
// one that records the calls (spyTabs), so "what opens" is a list like [['create', { url }]].
// The mock keeps every menu item Firefox would show (mockState.menuItems, with its onclick), so a click is a call
// of that onclick. Items meant for the dial page only send it a command: what the dial does with them is
// in dial-edit.js.
// The steps build on each other: "Add to Quick Dial" adds a tile at the end; the last step turns
// that item off.
'use strict';
const { freshProfile, spyTabs, englishText } = require('../lib/fixtures');

// The tab a click comes from, unless a test gives one
const CLICKED_TAB = { id: 3 };
// The background page's command for new settings (QDCommon.Commands.setSettings); the dial's command to show a Settings section
const SET_SETTINGS = 1, SHOW_SETTINGS_TAB = 209;
// Clicks the menu item with the text of this key (and parent menu, if given), as Firefox would; the tabs record starts empty
const clickMenu = (testPage, key, parentId, clickInfo, tab) => testPage.inHost(([title, parent, info, clickedTab]) => {
	const item = (mockState.menuItems || []).find(menuItem => menuItem.title === title && (!parent || menuItem.parentId === parent));
	if (!item) throw new Error('no menu item ' + title + (parent ? ' in ' + parent : ''));
	backgroundPage().qdTabs = [];
	item.onclick(info || {}, clickedTab);
}, [englishText(key), parentId || null, clickInfo || null, tab || CLICKED_TAB]);
// What the background page asked the tabs API for since then
const tabCalls = testPage => testPage.inHost(() => backgroundPage().qdTabs);

module.exports = {
	title: 'Toolbar button, the Settings tab, and every context menu item',
	async run(testPage) {
		await freshProfile(testPage);
		await spyTabs(testPage);

		// ----- the toolbar button -----
		const opensFor = {};
		for (const action of ['settings', 'newtab', 'current']) {
			await testPage.inHost(([toolbarAction, tab]) => {
				backgroundPage().app.settings.toolbarAction = toolbarAction;
				backgroundPage().qdTabs = [];
				fireEvent('ba.onClicked', tab);
			}, [action, CLICKED_TAB]);
			opensFor[action] = await testPage.waitFor('the tab', () => backgroundPage().qdTabs.length && backgroundPage().qdTabs);
		}
		testPage.check('the toolbar button opens Settings, the dial in a new tab, or the dial in this tab', testPage.same(opensFor,
			{ settings: [['create', { url: 'html/settings.html' }]], newtab: [['create', {}]], current: [['update', CLICKED_TAB.id, { url: '/dial.html' }]] }), opensFor);
		const SETTINGS_TAB_ID = 9;
		await testPage.inHost(tabId => {
			const page = backgroundPage();
			page.app.settings.toolbarAction = 'settings';
			page.qdTabs = [];
			page.qdOpen = [{ id: tabId, windowId: 1, url: 'html/settings.html?tab=grid' }];
			return page.app.openSettings('backup');
		}, SETTINGS_TAB_ID);
		const broughtForward = await tabCalls(testPage);
		testPage.check('Settings already open: that tab comes forward and shows the section', testPage.same(broughtForward,
			[['message', SETTINGS_TAB_ID, SHOW_SETTINGS_TAB, 'backup'], ['update', SETTINGS_TAB_ID, { active: true }]]), broughtForward);
		await testPage.inHost(() => { backgroundPage().qdTabs = []; return backgroundPage().app.openSettings('../../x'); });
		const unknownSection = await tabCalls(testPage);
		testPage.check('a section name that isn\'t one is ignored', testPage.same(unknownSection, [['update', SETTINGS_TAB_ID, { active: true }]]), unknownSection);
		await testPage.inHost(() => { backgroundPage().qdOpen = []; });

		// ----- the menus: every item there, and what each one does -----
		const menuTitles = await testPage.inHost(() => mockState.menus);
		testPage.check('the menus are all there', ['menuAddToQuickDial', 'menuNewBookmark', 'menuNewFolder', 'menuSettings', 'menuImportQuickDial', 'menuProperties', 'menuRefreshItem',
			'menuCapturePage', 'menuDeleteItem', 'menuOpenDial'].every(key => menuTitles.includes(englishText(key))), menuTitles);
		await clickMenu(testPage, 'menuAddToQuickDial', null, { menuItemId: 'AddToQuickDial', pageUrl: 'https://added.example/page' }, { id: 4, title: 'Added page' });
		const addedTile = await testPage.waitFor('the new tile', () => backgroundPage().app.node.children.find(tile => tile.url === 'https://added.example/page'));
		const addedBookmark = await testPage.inHost(() => dialFolderBookmarks().find(bookmark => bookmark.url === 'https://added.example/page'));
		testPage.check('Add to Quick Dial (on a web page) adds a tile and its bookmark', addedTile.title === 'Added page' && addedBookmark && addedBookmark.title === 'Added page', [addedTile, addedBookmark]);
		const commandsSent = {};
		for (const [key, parentId] of [['menuNewBookmark', 'pagemenunew'], ['menuNewFolder', 'itemmenunew'], ['menuProperties'], ['menuRefreshItem'], ['menuCapturePage'], ['menuDeleteItem']]) {
			await clickMenu(testPage, key, parentId);
			commandsSent[key] = (await tabCalls(testPage)).map(call => call[2]).join(); // ['message', tab id, command, section]
		}
		testPage.check('the dial\'s items ask that dial page to act (on the tile under the mouse)', testPage.same(commandsSent,
			{ menuNewBookmark: '200', menuNewFolder: '201', menuProperties: '203', menuRefreshItem: '204', menuCapturePage: '206', menuDeleteItem: '207' }), commandsSent);
		const tabsOpened = [];
		for (const [key, parentId] of [['menuSettings', 'pagemenu'], ['menuImportQuickDial', 'pagemenu'], ['menuSettings', 'itemmenu'], ['menuOpenDial']]) {
			await clickMenu(testPage, key, parentId);
			tabsOpened.push(...await tabCalls(testPage));
		}
		testPage.check('Settings, Import from Quick Dial and Open the dial open their tabs', testPage.same(tabsOpened, [['create', { url: 'html/settings.html' }],
			['create', { url: 'html/settings.html?tab=backup' }], ['create', { url: 'html/settings.html' }], ['create', { url: '/dial.html' }]]), tabsOpened);

		// ----- a settings change builds the menus again: without "Add to Quick Dial" when it is turned off -----
		await testPage.inHost(command => {
			const settings = JSON.parse(JSON.stringify(backgroundPage().app.settings));
			settings.menuShowAdd = false;
			fireEvent('rt.onMessage.bg', { cmd: command, settings }, {}, () => {});
		}, SET_SETTINGS);
		await testPage.idle();
		const menusWithoutAdd = await testPage.inHost(() => mockState.menus);
		testPage.check('turning "Add to Quick Dial" off removes it from the page menu, once', !menusWithoutAdd.includes(englishText('menuAddToQuickDial'))
			&& menusWithoutAdd.filter(title => title === englishText('menuOpenDial')).length === 1, menusWithoutAdd);
	}
};
