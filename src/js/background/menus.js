// Quick Dial NG — background page: context menus (web pages, the dial page, its tiles and the toolbar button)
app.ContextMenus = {};

app.ContextMenus.menuItemClicked = function(info, tab){
	if(info.menuItemId == 'AddToQuickDial') app.GridNodes.createBookmark(app.node, info.pageUrl, tab.title).then(created => {
		if(created) app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
	});
};

app.ContextMenus.initMenu = function(){ // (Called from app.init) Creates all menus
	const Commands = app.Messages.Commands;
	const create = props => browser.contextMenus.create(props);
	const text = key => browser.i18n.getMessage(key);
	const toDial = cmd => (info, tab) => { browser.tabs.sendMessage(tab.id, { cmd }); }; // the dial page acts on the tile under the mouse
	const openSettings = () => { app.openSettings(); };
	const dialPages = ['moz-extension://*' + QDCommon.DIAL_PAGE, 'moz-extension://*' + QDCommon.DIAL_PAGE + '?*'];
	const newItems = parentId => { // "New" › Bookmark, Folder
		create({ id: parentId + 'new', parentId, title: text('menuNew') });
		create({ parentId: parentId + 'new', title: text('menuNewBookmark'), onclick: toDial(Commands.menuCreateBookmark) });
		create({ parentId: parentId + 'new', title: text('menuNewFolder'), onclick: toDial(Commands.menuCreateFolder) });
		create({ parentId, type: 'separator' });
	};

	// Web pages: add the page to the dial
	if(app.settings.menuShowAdd){
		create({
			id: 'AddToQuickDial',
			title: text('menuAddToQuickDial'),
			contexts: ['all'],
			documentUrlPatterns: ['http://*/*', 'https://*/*', 'file://*/*', 'ftp://*/*'],
			onclick: (info, tab) => app.ContextMenus.menuItemClicked(info, tab)
		});
	}
	// The dial page's background
	create({ id: 'pagemenu', title: 'Quick Dial NG', documentUrlPatterns: dialPages, contexts: ['page'] });
	newItems('pagemenu');
	create({ parentId: 'pagemenu', title: text('menuSettings'), onclick: openSettings });
	create({ parentId: 'pagemenu', title: text('menuImportQuickDial'), onclick: () => { app.openSettings('backup'); } });
	// A tile on the dial
	create({ id: 'itemmenu', title: 'Quick Dial NG', documentUrlPatterns: dialPages, contexts: ['link'] });
	newItems('itemmenu');
	create({ parentId: 'itemmenu', title: text('menuProperties'), onclick: toDial(Commands.menuEditProperties) });
	create({ parentId: 'itemmenu', title: text('menuRefreshItem'), onclick: toDial(Commands.menuRefreshNode) });
	create({ parentId: 'itemmenu', title: text('menuCapturePage'), onclick: toDial(Commands.menuCapturePage) });
	create({ parentId: 'itemmenu', title: text('menuDeleteItem'), onclick: toDial(Commands.menuDeleteNode) });
	create({ parentId: 'itemmenu', type: 'separator' });
	create({ parentId: 'itemmenu', title: text('menuSettings'), onclick: openSettings });
	// Right-click menu of the toolbar button: both places, whatever a click on it opens
	create({ id: 'toolbarOpenDial', title: text('menuOpenDial'), contexts: ['browser_action'], onclick: () => { browser.tabs.create({ url: QDCommon.DIAL_PAGE }); } });
	create({ id: 'toolbarSettings', title: text('menuSettings'), contexts: ['browser_action'], onclick: openSettings });
};

app.ContextMenus.updateMenu = function(){ // Settings changed (e.g. menuShowAdd): build the menus again
	browser.contextMenus.removeAll();
	app.ContextMenus.initMenu();
};
