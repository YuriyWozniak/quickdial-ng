// Quick Dial NG — background page: export and import of settings, tiles, pictures and themes
app.Backup = {};

app.Backup.export = function(){
	return app.Images.get(app.Images.idsInTree(app.node)).then(images => {
		const data = { format: QDCommon.BACKUP_FORMAT, version: app.Settings.DATA_VERSION, settings: app.settings, node: JSON.parse(app.Settings._serialize()).node, images };
		if(app.Themes.list.length) data.themes = app.Themes.list;
		return data;
	});
};
app.Backup._clean = function(value){ // Deep copy without transient "__" fields
	return JSON.parse(JSON.stringify(value), (key, v) => key.startsWith('__') ? undefined : v);
};
app.Backup._mergeDefaults = function(defaults, value){ // Imported values win; anything missing (older backups) falls back to defaults
	if(value === undefined) return defaults;
	const isObject = v => v && typeof v == 'object' && !Array.isArray(v);
	if(!isObject(defaults) || !isObject(value)) return value;
	const result = {};
	for(const k in defaults) result[k] = app.Backup._mergeDefaults(defaults[k], value[k]);
	for(const k in value) if(!(k in defaults)) result[k] = value[k];
	return result;
};
app.Backup._loadRoot = async function(rootPath){ // Promise<bookmark subtree of the Quick Dial root folder> (created if missing)
	const item = await app.Bookmarks.load(rootPath);
	if(!item) throw new Error('Cannot open the bookmarks folder "' + rootPath + '"');
	return (await browser.bookmarks.getSubTree(item.id))[0];
};
// Links each tile to a bookmark (by id, then URL / folder name), creating missing ones; cell positions are kept
app.Backup._attachBookmarks = async function(gridNode, folder, idMap, stats){
	const NodeType = QDCommon.NodeType;
	const claimed = new Set();
	const bookmarks = (folder.children || []).slice();
	const pick = test => {
		const b = bookmarks.find(b => !claimed.has(b.id) && test(b));
		if(!b) return null;
		claimed.add(b.id);
		return b;
	};
	const children = gridNode.children || [];
	for(const c of children){ // Pass 1: tiles whose bookmark still exists with the same id
		if(!c || !c.id) continue;
		const same = pick(b => b.id == c.id && (c.type == NodeType.folder ? b.type == 'folder' : b.url == c.url));
		if(same) c.__match = same;
	}
	for(let i = 0; i < children.length; i++){
		const c = children[i];
		if(!c || (c.type != NodeType.bookmark && c.type != NodeType.folder) || (c.type == NodeType.bookmark && !c.url)){
			children[i] = { type: NodeType.empty }; // Empty cell (or unusable entry): keeps the gap
			continue;
		}
		const oldId = c.id;
		let match = c.__match;
		delete c.__match;
		if(!match){
			match = c.type == NodeType.folder
				? pick(b => b.type == 'folder' && b.title == c.title)
				: pick(b => b.type == 'bookmark' && b.url == c.url);
		}
		if(match){
			stats.matched++;
		} else {
			const info = { parentId: folder.id, title: c.title || c.url || 'Folder' };
			if(c.type == NodeType.bookmark) info.url = c.url;
			match = await browser.bookmarks.create(info);
			if(c.type == NodeType.folder) match.children = [];
			stats.created++;
		}
		c.id = match.id;
		if(oldId) idMap[oldId] = match.id;
		if(c.type == NodeType.folder){
			stats.folders++;
			if(!c.children) c.children = [];
			await app.Backup._attachBookmarks(c, match, idMap, stats);
		} else {
			stats.tiles++;
		}
	}
	gridNode.children = children;
	while(children.length && children[children.length - 1].type == NodeType.empty) children.pop();
};
app.Backup.import = async function(data){ // Accepts a quickdial-ng backup or an original Quick Dial data dump ({ version: 4, settings, node })
	if(!data || !data.settings || !data.node || !data.settings.grid) throw new Error('Not a Quick Dial backup');
	const imported = app.Backup._clean(data.settings);
	app.Settings.migrateToolbar(imported); // older backups and the original Quick Dial: the toolbar switch becomes toolbarAction
	app.Settings.migrateIcons(imported); // and the old PNG folder and Back pictures become the SVG ones
	const settings = app.Backup._mergeDefaults(app.Settings.defaults(), imported);
	app.Settings.dropObsolete(settings); // found in older exports and backups
	app.Settings.resolvePictures(settings, null); // Backups carry the pictures inline; a stored-picture mark without one becomes the default
	QDThemes.apply(settings, QDThemes.extract(settings)); // Style values end up in CSS text: keep only valid ones
	const node = app.Backup._clean(data.node);
	const stats = { tiles: 0, folders: 0, matched: 0, created: 0, images: 0 };
	const idMap = {};
	app.Bookmarks.removeListener(); // No bookmark events while the tree is rebuilt
	try {
		const folder = await app.Backup._loadRoot(settings.grid.root);
		await app.Backup._attachBookmarks(node, folder, idMap, stats);
		node.id = folder.id;
		let images = null;
		if(data.images){ // Backup images are keyed by the old bookmark ids
			images = {};
			for(const oldId in data.images) if(idMap[oldId]) images[idMap[oldId]] = data.images[oldId];
		}
		await app.Images.removeTree(app.node);
		app.Images._cache.clear();
		app.settings = settings;
		app.node = node;
		await app.Images.extractFromTree(app.node, images);
		stats.images = app.Images.idsInTree(app.node).length;
		delete app.Settings._loadFailed; // The user replaces the data: saved even after a failed load (see Settings.init)
		await app.Settings.save();
		if(Array.isArray(data.themes) && data.themes.length){ // Themes from the backup are added; a theme with the same name is replaced
			const names = data.themes.map(t => String(t && t.name).trim().toLowerCase());
			await app.Themes.save(data.themes.concat(app.Themes.list.filter(t => !names.includes(t.name.toLowerCase()))));
		}
	} finally {
		app.Bookmarks.initListener();
	}
	app.Messages.broadcast(app.Messages.Commands.settingsChanged);
	app.ContextMenus.updateMenu();
	await app.GridNodes.sync(app.node, app.settings.grid.root);
	app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
	return Object.assign({ ok: true }, stats);
};
