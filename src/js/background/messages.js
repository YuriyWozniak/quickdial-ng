// Quick Dial NG — background page: messages from the dial, Settings and Properties pages.
// app.Messages.handlers has one handler per command (QDCommon.Commands): it gets the request and answers with a value
// or a promise of one, which the page's QDClient call resolves with. A new command is a new entry here, and a method
// of QDClient (js/common.js).
app.Messages = {};
app.Messages.Commands = QDCommon.Commands;

app.Messages.broadcast = function(cmd){ // Notify open Quick Dial pages; having none open is normal
	browser.runtime.sendMessage({ cmd }).catch(() => {});
};
app.Messages.tilesChanged = function(){ // The pages show the tiles again
	app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
};

// The folder of the dial at a path the pages send ("/", "/Work/"), or null when it is gone (renamed or deleted meanwhile)
app.Messages.folderAt = function(path){
	return typeof path == 'string' ? app.GridNodes.getNode(app.node, path.slice(1)) : null;
};
// The tile request.id in the folder request.path, or null when it is gone
app.Messages.tileAt = function(request){
	const folder = app.Messages.folderAt(request.path);
	return folder ? app.GridNodes.getChildNode(folder, request.id) : null;
};
// Handlers that act on a folder of the dial (request.path) or on a tile (request.path, request.id): `action` runs only
// while it is still there, and its answer is the handler's; a folder or tile that is gone answers null
app.Messages._inFolder = action => request => {
	const folder = app.Messages.folderAt(request.path);
	return folder ? action(folder, request) : null;
};
app.Messages._onTile = action => request => {
	const tile = app.Messages.tileAt(request);
	return tile ? action(tile, request) : null;
};
// A change that takes a while (a new bookmark, a tile's picture): the pages show the tiles again once it is done. Answers true.
app.Messages._thenTilesChanged = promise => Promise.resolve(promise).then(() => { app.Messages.tilesChanged(); return true; });

// New settings from the Settings page. Answers them; the pages, the menus and (for another root folder) the tiles follow.
app.Messages._setSettings = function(settings){
	const rootChanged = app.settings.grid.root != settings.grid.root;
	app.Settings.update(settings);
	app.Language.apply().then(() => { // The pages and the menus get the texts of a new language with the change
		app.Messages.broadcast(app.Messages.Commands.settingsChanged);
		if(rootChanged){
			app.Images.removeTree(app.node);
			app.node = { children: [] };
			app.GridNodes.sync(app.node, app.settings.grid.root).then(app.Messages.tilesChanged);
		} else {
			app.Messages.tilesChanged();
		}
		app.ContextMenus.updateMenu();
	});
	return app.settings;
};
// Changes from Properties. Answers false when the tile is gone (deleted while its Properties window was open).
app.Messages._updateNode = function(request){
	const gridNode = app.GridNodes.getNodeById(request.id);
	if(!gridNode) return false;
	app.Messages._thenTilesChanged(app.GridNodes.updateNode(gridNode, request.value)); // and again once a new address has its title and picture
	app.Messages.tilesChanged();
	return true;
};

app.Messages.handlers = (function(){
	const Commands = app.Messages.Commands, Messages = app.Messages, inFolder = Messages._inFolder, onTile = Messages._onTile;
	const thenTilesChanged = Messages._thenTilesChanged;
	return Object.freeze({
		// Settings, themes, backups
		[Commands.getSettings]: () => app.settings,
		[Commands.setSettings]: request => Messages._setSettings(request.settings),
		[Commands.getThemes]: () => app.Themes.list,
		[Commands.setThemes]: request => app.Themes.save(request.themes),
		[Commands.openSettings]: request => app.openSettings(request.tab),
		[Commands.exportData]: () => app.Backup.export(),
		[Commands.importData]: request => app.Backup.import(request.data),
		// Tiles
		[Commands.getNode]: request => Messages.folderAt(request.path),
		[Commands.getNodeById]: request => app.GridNodes.getNodeById(request.id),
		[Commands.getNodeFolders]: request => { // The folders between the dial's own folder and the tile (Properties shows them)
			const nodes = app.GridNodes.getNodeWithParents(request.id);
			return nodes ? nodes.slice(1, -1).map(gridNode => gridNode.title) : [];
		},
		[Commands.getImages]: request => app.Images.get(request.ids),
		[Commands.updateNode]: request => Messages._updateNode(request),
		[Commands.setNodeIndex]: inFolder((folder, request) => {
			app.GridNodes.setNodeIndex(folder, request.index, request.newIndex);
			Messages.tilesChanged();
			return true;
		}),
		[Commands.createBookmark]: inFolder((folder, request) => thenTilesChanged(app.GridNodes.createBookmark(folder, request.url, request.title))),
		[Commands.createFolder]: inFolder((folder, request) => thenTilesChanged(app.GridNodes.createFolder(folder, request.name))),
		[Commands.deleteNode]: inFolder((folder, request) => {
			app.GridNodes.deleteNode(folder, request.id);
			Messages.tilesChanged();
			return true;
		}),
		// Tile pictures
		[Commands.refreshNode]: onTile(tile => thenTilesChanged(app.GridNodes.refreshNode(tile))),
		[Commands.capturePage]: onTile(tile => thenTilesChanged(app.GridNodes.capturePage(tile))),
		[Commands.useSiteIcon]: onTile(tile => thenTilesChanged(app.GridNodes.useSiteIcon(tile))),
		// Settings: the dial pages show each tile's new picture as soon as it is made. Answers the number of tiles.
		[Commands.applyTilePicture]: request => app.GridNodes.applyTilePicture(Number(request.kind), Messages.tilesChanged),
		// Properties: the site's icons to choose from, and a letter tile
		[Commands.findSiteIcons]: request => app.SiteIcons.find(request.url).then(found => Object.assign(found, { letter: app.SiteIcons.letter(request.url, request.title) })),
		// Properties: the icon picker's sets, and one of their icons as a tile picture
		[Commands.drawIcon]: request => app.SiteIcons.drawIcon(request.icon),
		[Commands.iconSets]: () => app.IconSets.list(),
		[Commands.iconSet]: request => app.IconSets.get(request.name),
		// Answers { error: null } when the set is kept, else { error: why not, gone: the file isn't there any more }
		[Commands.downloadIconSet]: request => app.IconSets.download(request.name).then(() => ({ error: null }), e => ({ error: String(e && e.message || e), gone: !!(e && e.gone) })),
		[Commands.removeIconSet]: request => app.IconSets.remove(request.name).then(() => true)
	});
})();

app.Messages.init = function(){
	browser.runtime.onMessage.addListener(request => {
		const handlers = app.Messages.handlers;
		if(!request || !Object.prototype.hasOwnProperty.call(handlers, request.cmd)) return undefined; // Not a command of ours
		return Promise.resolve().then(() => handlers[request.cmd](request)); // A handler that throws: the page's promise rejects
	});
};
