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
	for(const key in defaults) result[key] = app.Backup._mergeDefaults(defaults[key], value[key]);
	for(const key in value) if(!(key in defaults)) result[key] = value[key];
	return result;
};
app.Backup._loadRoot = async function(rootPath){ // Promise<bookmark subtree of the Quick Dial root folder> (created if missing)
	const item = await app.Bookmarks.load(rootPath);
	if(!item) throw new Error(QDCommon.text('backupNoBookmarksFolder', rootPath));
	return (await browser.bookmarks.getSubTree(item.id))[0];
};
// Links each tile to a bookmark (by id, then URL / folder name), creating missing ones; cell positions are kept
app.Backup._attachBookmarks = async function(gridNode, folder, idMap, stats){
	const NodeType = QDCommon.NodeType;
	const claimed = new Set();
	const bookmarks = (folder.children || []).slice();
	const pick = test => {
		const bookmark = bookmarks.find(b => !claimed.has(b.id) && test(b));
		if(!bookmark) return null;
		claimed.add(bookmark.id);
		return bookmark;
	};
	const children = gridNode.children || [];
	for(const child of children){ // Pass 1: tiles whose bookmark still exists with the same id
		if(!child || !child.id) continue;
		const same = pick(b => b.id == child.id && (child.type == NodeType.folder ? b.type == 'folder' : b.url == child.url));
		if(same) child.__match = same;
	}
	for(let i = 0; i < children.length; i++){
		const child = children[i];
		if(!child || (child.type != NodeType.bookmark && child.type != NodeType.folder) || (child.type == NodeType.bookmark && !child.url)){
			children[i] = { type: NodeType.empty }; // Empty cell (or unusable entry): keeps the gap
			continue;
		}
		const oldId = child.id;
		let match = child.__match;
		delete child.__match;
		if(!match){
			match = child.type == NodeType.folder
				? pick(b => b.type == 'folder' && b.title == child.title)
				: pick(b => b.type == 'bookmark' && b.url == child.url);
		}
		if(match){
			stats.matched++;
		} else {
			const info = { parentId: folder.id, title: child.title || child.url || 'Folder' };
			if(child.type == NodeType.bookmark) info.url = child.url;
			match = await browser.bookmarks.create(info);
			if(child.type == NodeType.folder) match.children = [];
			stats.created++;
		}
		child.id = match.id;
		if(oldId) idMap[oldId] = match.id;
		if(child.type == NodeType.folder){
			stats.folders++;
			if(!child.children) child.children = [];
			await app.Backup._attachBookmarks(child, match, idMap, stats);
		} else {
			stats.tiles++;
		}
	}
	gridNode.children = children;
	while(children.length && children[children.length - 1].type == NodeType.empty) children.pop();
};
app.Backup.import = async function(data){ // Accepts a quickdial-ng backup or an original Quick Dial data dump ({ version: 4, settings, node })
	if(!data || !data.settings || !data.node || !data.settings.grid) throw new Error(QDCommon.text('backupNotABackup'));
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
	await app.Language.apply(); // The backup may hold another language
	app.Messages.broadcast(app.Messages.Commands.settingsChanged);
	app.ContextMenus.updateMenu();
	await app.GridNodes.sync(app.node, app.settings.grid.root);
	app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
	return Object.assign({ ok: true }, stats);
};
