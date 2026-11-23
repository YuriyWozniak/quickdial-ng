// Quick Dial NG — background page.
// The scripts in this folder share the global `app` and are loaded in the order listed in
// manifest.json: app.js first, then one file per part of `app`, and main.js last, which starts it.
//   messages.js   messages from the dial, Settings and Properties pages
//   settings.js   stored settings (and their upgrades from older versions) and the user's themes
//   language.js   the language of the texts: Firefox's, or the one chosen in Settings
//   images.js     tile pictures, one storage key each
//   backup.js     export and import
//   menus.js      context menus
//   bookmarks.js  the Quick Dial bookmarks folder and its events
//   siteinfos.js  page title and picture of a site
//   gridnodes.js  the tree of tiles, kept in sync with the bookmarks

/* exported app */
// eslint-disable-next-line no-var -- a window property: shared by the background scripts; the dial page and the tests read it too
var app = {};
app.SYNC_DELAY = 500; // ms after start before the tiles are checked against the bookmarks: the first dial is drawn first
app.ready = new Promise(resolve => { app._setReady = resolve; }); // Resolves once settings and nodes are loaded; dial pages wait on it

app.init = function(){
	app.Settings.init().then(() => app.Language.apply()).then(() => {
		app.Settings.rememberBackground();
		app._setReady();
		app.Messages.init();
		app.Messages.broadcast(app.Messages.Commands.settingsChanged);
		browser.browserAction.onClicked.addListener(tab => {
			switch(app.settings.toolbarAction){
				case 'settings': app.openSettings(); break;
				case 'current': browser.tabs.update(tab.id, { url: QDCommon.DIAL_PAGE }); break;
				default: browser.tabs.create({});
			}
		});
		app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
		app.ContextMenus.initMenu();
		setTimeout(() => {
			app.GridNodes.sync(app.node, app.settings.grid.root).then(() => app.Bookmarks.initListener());
		}, app.SYNC_DELAY);
		// The start page is Firefox's home page, set to dial.html by chrome_settings_overrides in manifest.json
	});
};

// Opens Settings in its own tab, or brings the tab forward when it is already open.
// section: optional 'page', 'grid', 'tiles', 'themes' or 'backup'.
app.openSettings = function(section){
	section = typeof section == 'string' && /^[a-z]+$/.test(section) ? section : '';
	const page = browser.runtime.getURL('html/settings.html');
	return browser.tabs.query({}).then(tabs => {
		const open = tabs.find(t => t.url && t.url.split(/[?#]/)[0] == page);
		if(!open) return browser.tabs.create({ url: page + (section ? '?tab=' + section : '') });
		if(section) browser.tabs.sendMessage(open.id, { cmd: app.Messages.Commands.showSettingsSection, tab: section }).catch(() => {});
		if(browser.windows) browser.windows.update(open.windowId, { focused: true }).catch(() => {}); // no windows API on Android
		return browser.tabs.update(open.id, { active: true });
	});
};
