var app = {};  // App object
app.ready = new Promise(function(resolve){ app._setReady = resolve; }); // Resolves once settings and nodes are loaded; dial pages wait on it

app.init = function(){ // Init module
	app.Settings.init(function(){
		app.Settings.rememberBackground();
		app._setReady();
		app.Messages.init();
		app.Messages.broadcast(app.Messages.Commands.settingsChanged);
		browser.browserAction.onClicked.addListener(function(e){
			if(app.settings.openQuickDialInNewPage) browser.tabs.create({});
			else browser.tabs.update(e.id, {url: '/dial.html'}).then();				
		});
    app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
    app.ContextMenus.initMenu();
    window.setTimeout(function(){
      app.GridNodes.sync(app.node, app.settings.grid.root, function(){
        app.Bookmarks.initListener();
      });
    }, 500);
		// The start page is Firefox's home page, set to dial.html by chrome_settings_overrides in manifest.json
	});
};

app.Messages = {}; // Messages helper object
app.Messages.Commands = {
	getSettings: 0,
	setSettings: 1,
	getNode: 2,
	getNodeByID: 3,
	updateNode: 4,
	setNodeIndex: 5,
	createBookmark: 6,
	createFolder: 7,
	deleteNode: 8,
	refreshNode: 9,
	capturePage: 10,
	getImages: 11,
	exportData: 12,
	importData: 13,
	getThemes: 14,
	setThemes: 15,
	settingsChanged: 100,
	gridNodesLoaded: 101,
	menuCreateBookmark: 200,
	menuCreateFolder: 201,
	menuEditSettings: 202,
	menuEditProperties: 203,
	menuRefreshNode: 204,
	menuCapturePage: 206,
	menuDeleteNode: 207,
	menuImportQuickDial: 208
};
app.Messages.broadcast = function(cmd){ // Notify open Quick Dial pages; having none open is normal
	browser.runtime.sendMessage({ cmd: cmd }).catch(function(){});
};
app.Messages.init = function(){ // Init Messages Listeners
	browser.runtime.onMessage.addListener(function(request, sender, sendResponse){
		switch(request.cmd){
			case app.Messages.Commands.getSettings:
				sendResponse(app.settings);
				break;
			case app.Messages.Commands.setSettings:
				let rootChanged = (app.settings.grid.root!=request.settings.grid.root);
				app.settings = request.settings;
				app.Settings.save();
				sendResponse(app.settings);
				app.Messages.broadcast(app.Messages.Commands.settingsChanged);
				if(rootChanged){
					app.Images.removeTree(app.node);
					app.node = { children: [] };
					app.GridNodes.sync(app.node, app.settings.grid.root, function(){ app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded); });
				} else {
					app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
				}
				app.ContextMenus.updateMenu();
				break;
			case app.Messages.Commands.getNodeByID:
				var nodes = app.GridNodes.getNodeWithParents(request.id);
				if(nodes) sendResponse(nodes[nodes.length-1]);
				else sendResponse(null);
				break;
			case app.Messages.Commands.updateNode:
				app.GridNodes.updateNode(app.GridNodes.getNodeById(request.id), request.value, function(){
					app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
				});
				break;
			case app.Messages.Commands.getNode:
				sendResponse(app.GridNodes.getNode(app.node, request.path.substr(1)));
				break;
			case app.Messages.Commands.setNodeIndex:
				app.GridNodes.setNodeIndex(app.GridNodes.getNode(app.node, request.path.substr(1)), request.index, request.newIndex, function(){
					app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
				});
				break;
			case app.Messages.Commands.createBookmark:
				app.GridNodes.createBookmark(app.GridNodes.getNode(app.node, request.path.substr(1)), request.url, request.title, function(){
					app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
				});
				break;
			case app.Messages.Commands.createFolder:
				app.GridNodes.createFolder(app.GridNodes.getNode(app.node, request.path.substr(1)), request.name, function(){
					app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
				});
				break;
			case app.Messages.Commands.deleteNode:
				app.GridNodes.deleteNode(app.GridNodes.getNode(app.node, request.path.substr(1)), request.id, function(){
					app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
				});
				break;
			case app.Messages.Commands.refreshNode:
				app.GridNodes.refreshNode(app.GridNodes.getChildNode(app.GridNodes.getNode(app.node, request.path.substr(1)), request.id), function(){
					app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
				});
				break;
			case app.Messages.Commands.capturePage:
				app.GridNodes.capturePage(app.GridNodes.getChildNode(app.GridNodes.getNode(app.node, request.path.substr(1)), request.id), function(){
					app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
				});
				break;
			case app.Messages.Commands.getImages:
				return app.Images.get(request.ids);
			case app.Messages.Commands.exportData:
				return app.Backup.export();
			case app.Messages.Commands.importData:
				return app.Backup.import(request.data);
			case app.Messages.Commands.getThemes:
				sendResponse(app.Themes.list);
				break;
			case app.Messages.Commands.setThemes:
				return app.Themes.save(request.themes);
		}
	});
};

app.Settings = {}; // Settings helper object
app.Settings.defaults = function(){ // Default settings of a new install: layout and behaviour here, the look from the Classic theme
	return QDThemes.apply({
		backgroundImage: null,
		backgroundMode: 0,
		menuShowAdd: true,
		openQuickDialInNewPage: true,
		grid: {
			rows: 4,
			columns: 5,
			ratioX: 4,
			ratioY: 3,
			backNode: true,
			backIcon: 'url(/img/back.png)',
			backIconMode: 3,
			folderIcon: 'url(/img/folder.png)',
			folderIconMode: 0,
			loadingIcon: 'url(/img/throbber.gif)',
			openBookmarkMethod: 0,
			openFolderMethod: 0,
			cells: {
				previewWidth: 1200,
				previewHeight: 710,
				snapshotDelay: 2000
			},
			root: 'Quick Dial',
		}
	}, QDThemes.CLASSIC);
};
app.Settings.init = function(callback){ // Load settings and nodes
	browser.storage.local.get(['version', 'settings', 'node', 'themes']).then(function(data){ // Images are stored under their own keys and loaded on demand (see app.Images)
		app.Themes.list = QDThemes.cleanList(data.themes);
		delete data.themes;
		if(Object.keys(data).length == 0 || ! data.settings) {
			data = { version: 3, settings: app.Settings.defaults(), node: { children: [] } };
		}
		if(!data.version){ // Upgrade Data Version
			data.version = 2;
			data.grid.backNode = true;
			data.grid.backIcon = 'url(/img/back.png)';
			data.grid.folderIcon = 'url(/img/folder.png)';
			data.grid.loadingIcon = 'url(/img/throbber.gif)';
			data.grid.cells.backgroundColor = null;
			data.grid.cells.backgroundColorHover = null;
			data.grid.cells.titleBackgroundColor = null;
			data.grid.cells.titleBackgroundColorHover = null;
			delete data.grid.cells.backIcon;
			delete data.grid.cells.folderIcon;
			delete data.grid.cells.loadingIcon;
			delete data.grid.cells.backPanel;
		}
		if(data.version == 2){ // Upgrade Data Version
			var oldData = data;
			data = {};
			data.version = 3;
			data.settings = oldData;
			data.node = oldData.grid.node;
			delete data.settings.version;
			delete data.settings.grid.node;
			app.settings = data.settings;
			app.node = data.node;
			browser.storage.local.clear().then(function(){
				app.Settings.save();
			});
		}
		if(data.version == 3){ // Upgrade Data Version
			data.version = 4;
			data.settings.backgroundMode = 0;
			data.settings.grid.backIconMode = 3;
			data.settings.grid.folderIconMode = 0;
			data.settings.grid.cells.opacity = 1;
			data.settings.grid.cells.opacityHover = 1;
			data.settings.grid.cells.borderSize = 1;
			data.settings.grid.cells.borderSizeHover = data.settings.grid.cells.borderSize;
			data.settings.grid.cells.titleHover = data.settings.grid.cells.title;
			data.settings.grid.cells.titleHeightHover = data.settings.grid.cells.titleHeight;
			data.settings.grid.cells.titleFontSizeHover = data.settings.grid.cells.titleFontSize;
			data.settings.grid.cells.titleBorderSize = 1;
			data.settings.grid.cells.titleBorderSizeHover = data.settings.grid.cells.titleBorderSize;
			app.Settings.save();
		}
		if(data.version == 4){ // Upgrade Data Version
			if(!data.settings.grid.cells.snapshotDelay) data.settings.grid.cells.snapshotDelay = 2000;
			if(data.settings.grid.ratioAuto == true || data.settings.grid.ratioAuto == false){
				delete data.settings.grid.ratioAuto;
				data.settings.grid.ratioX = 4;
				data.settings.grid.ratioY = 3;
			}
			if(!data.settings.grid.ratioX){
				data.settings.grid.ratioX = 4;
				data.settings.grid.ratioY = 3;
			}
			if(!(data.settings.menuShowAdd == true) && !(data.settings.menuShowAdd == false)){
				data.settings.menuShowAdd = true;
			}
			if(!data.settings.grid.openBookmarkMethod && data.settings.grid.openBookmarkMethod != 0){
				data.settings.grid.openBookmarkMethod = 0;
				data.settings.grid.openFolderMethod = 0;
			}
			if(!data.settings.openQuickDialInNewPage && data.settings.openQuickDialInNewPage != false){
				data.settings.openQuickDialInNewPage = true;
			}
			//app.Settings.save();
		}
		app.settings = data.settings;
		app.node = data.node;
		var obsolete = ('startpageTimeout' in app.settings); // Start page timer, replaced by the home page override (0.3.5)
		delete app.settings.startpageTimeout;
		QDThemes.complete(app.settings); // Style settings added in later versions (0.4.0: glass, shadows, title font...) start at their Classic values
		if(data.version == 4){ // Upgrade Data Version: move inline images out of the node tree into their own keys (WebP)
			app.Images.extractFromTree(app.node).then(function(){
				app.Settings.save(callback);
			});
			return;
		}
		app.Settings._lastSaved = app.Settings._serialize();
		if(obsolete){ app.Settings._lastSaved = null; app.Settings.save(); } // Drop the old field from storage once
		if(callback) callback();
	}, function(){ console.log('Error loading data'); });
};
app.Settings.update = function(settings, callback){ // Save new settings
	app.settings = settings;
	app.Settings.save(callback);
};
app.Settings._serialize = function(){ // Settings and node tree only (no images, no transient "__" fields)
	return JSON.stringify({ version: 5, settings: app.settings, node: app.node }, function(key, value){
		if(key.startsWith('__')) return undefined;
		return value;
	});
};
app.Settings._saveCallbacks = [];
app.Settings.rememberBackground = function(){ // Keep the background colour where dial pages can read it before settings load (see dialbg.js)
	try {
		var color = app.settings && app.settings.backgroundColor;
		if(!color) localStorage.removeItem('dialBackgroundColor');
		else if(localStorage.getItem('dialBackgroundColor') != color) localStorage.setItem('dialBackgroundColor', color);
	} catch(e){}
};
app.Settings.save = function(callback){ // Save settings (batched, and skipped when nothing changed)
	if(! app.settings) return;
	app.Settings.rememberBackground(); // Every settings change (settings page, import, migration) passes through here
	if(callback) app.Settings._saveCallbacks.push(callback);
	if(app.Settings._saveTimer) return;
	app.Settings._saveTimer = setTimeout(function(){
		delete app.Settings._saveTimer;
		var callbacks = app.Settings._saveCallbacks;
		app.Settings._saveCallbacks = [];
		function done(){ for(var cb of callbacks) cb(); }
		var json = app.Settings._serialize();
		if(json == app.Settings._lastSaved){
			done();
			return;
		}
		browser.storage.local.set(JSON.parse(json)).then(function(){
			app.Settings._lastSaved = json;
			done();
		}, function(){ console.log('Error saving settings'); });
	}, 100);
};

app.Images = {}; // Image store: one storage key per node ("img_<bookmarkId>"), WebP encoded, loaded on demand
app.Images._cache = new Map();
app.Images.quality = 0.85;
app.Images.maxSize = 1200; // Longest side in pixels for imported/uploaded images
app.Images.key = function(id){ return 'img_' + id; };
app.Images.unwrap = function(image){ // 'url("data:...")' -> 'data:...'
	if(typeof image != 'string') return image;
	var m = image.match(/^\s*url\(\s*["']?(.*?)["']?\s*\)\s*$/);
	return m ? m[1] : image;
};
app.Images.get = function(ids){ // Promise<{ id: dataUrl }>
	var result = {};
	var missing = [];
	for(var id of ids || []){
		if(app.Images._cache.has(id)) result[id] = app.Images._cache.get(id);
		else missing.push(id);
	}
	if(missing.length == 0) return Promise.resolve(result);
	return browser.storage.local.get(missing.map(app.Images.key)).then(function(data){
		for(var id of missing){
			var image = data[app.Images.key(id)];
			if(image){
				app.Images._cache.set(id, image);
				result[id] = image;
			}
		}
		return result;
	});
};
app.Images.set = function(id, image){
	app.Images._cache.set(id, image);
	var data = {};
	data[app.Images.key(id)] = image;
	return browser.storage.local.set(data);
};
app.Images.remove = function(ids){
	if(ids.length == 0) return Promise.resolve();
	for(var id of ids) app.Images._cache.delete(id);
	return browser.storage.local.remove(ids.map(app.Images.key));
};
app.Images.removeTree = function(gridNode){ // Remove stored images of a node and all its descendants
	var ids = [];
	(function collect(node){
		if(!node) return;
		if(node.id && node.image == '1') ids.push(node.id);
		if(node.children) for(var child of node.children) collect(child);
	})(gridNode);
	return app.Images.remove(ids);
};
app.Images.setNodeImage = function(gridNode, image){ // Set (or clear) the image of a node. image: data URL, url(...), '0' (failed) or falsy (none)
	image = app.Images.unwrap(image);
	if(!image || image == '0' || image == '1'){
		if(image == '1') return Promise.resolve(); // Unchanged, already stored
		var hadImage = (gridNode.image == '1');
		if(image == '0') gridNode.image = '0';
		else delete gridNode.image;
		return hadImage ? app.Images.remove([gridNode.id]) : Promise.resolve();
	}
	gridNode.image = '1';
	if(app.Images._cache.get(gridNode.id) == image) return Promise.resolve();
	return app.Images.set(gridNode.id, image);
};
app.Images.toWebp = function(dataUrl, maxSize){ // Re-encode any image to WebP, optionally limiting its longest side
	return new Promise(function(resolve){
		if(typeof dataUrl != 'string' || !dataUrl.startsWith('data:image/')){
			resolve(dataUrl);
			return;
		}
		var img = new Image();
		img.onload = function(){
			var w = img.naturalWidth || 300;
			var h = img.naturalHeight || 150;
			var tooBig = maxSize && Math.max(w, h) > maxSize;
			if(dataUrl.startsWith('data:image/webp') && !tooBig){ // Already WebP: don't re-encode
				resolve(dataUrl);
				return;
			}
			if(tooBig){
				var ratio = maxSize / Math.max(w, h);
				w = Math.round(w * ratio);
				h = Math.round(h * ratio);
			}
			var canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			canvas.getContext('2d').drawImage(img, 0, 0, w, h);
			var webp = canvas.toDataURL('image/webp', app.Images.quality);
			resolve(webp.startsWith('data:image/webp') && webp.length < dataUrl.length ? webp : dataUrl);
		};
		img.onerror = function(){ resolve(dataUrl); };
		img.src = dataUrl;
	});
};
app.Images.extractFromTree = function(gridNode, images){ // Move inline images (old format) or images from a backup into the store
	var jobs = [];
	(function walk(node){
		if(!node) return;
		if(node.id){
			var image = images ? images[node.id] : null;
			if(!image && node.image && node.image != '0' && node.image != '1') image = node.image;
			if(image){
				image = app.Images.unwrap(image);
				jobs.push(app.Images.toWebp(image, app.Images.maxSize).then(function(webp){
					return app.Images.setNodeImage(node, webp);
				}));
			} else if(node.image == '1'){
				delete node.image; // Image missing from the backup: will be refreshed
			}
		}
		if(node.children) for(var child of node.children) walk(child);
	})(gridNode);
	return Promise.all(jobs);
};

app.Themes = { list: [] }; // The user's own themes ({ name, description, style }); built-in ones live in themes.js
app.Themes.save = function(list){ // Promise<saved list>
	app.Themes.list = QDThemes.cleanList(list);
	var done = function(){ return app.Themes.list; };
	return (app.Themes.list.length ? browser.storage.local.set({ themes: app.Themes.list }) : browser.storage.local.remove('themes')).then(done, done);
};

app.Backup = {}; // Export / import of settings, tiles and images
app.Backup.export = function(){
	var ids = [];
	(function collect(node){
		if(!node) return;
		if(node.id && node.image == '1') ids.push(node.id);
		if(node.children) for(var child of node.children) collect(child);
	})(app.node);
	return app.Images.get(ids).then(function(images){
		var data = { format: 'quickdial-ng', version: 5, settings: app.settings, node: JSON.parse(app.Settings._serialize()).node, images: images };
		if(app.Themes.list.length) data.themes = app.Themes.list;
		return data;
	});
};
app.Backup._clean = function(value){ // Deep copy without transient "__" fields
	return JSON.parse(JSON.stringify(value), function(key, v){ return key.startsWith('__') ? undefined : v; });
};
app.Backup._mergeDefaults = function(defaults, value){ // Imported values win; anything missing (older backups) falls back to defaults
	if(value === undefined) return defaults;
	if(!defaults || typeof defaults != 'object' || Array.isArray(defaults) || !value || typeof value != 'object' || Array.isArray(value)) return value;
	var result = {};
	for(var k in defaults) result[k] = app.Backup._mergeDefaults(defaults[k], value[k]);
	for(var k in value) if(!(k in defaults)) result[k] = value[k];
	return result;
};
app.Backup._loadRoot = function(rootPath){ // Promise<bookmark subtree of the Quick Dial root folder> (created if missing)
	return new Promise(function(resolve, reject){
		app.Bookmarks.load(rootPath, function(item){
			if(!item) return reject(new Error('Cannot open the bookmarks folder "' + rootPath + '"'));
			browser.bookmarks.getSubTree(item.id).then(function(items){ resolve(items[0]); }, reject);
		});
	});
};
app.Backup._attachBookmarks = async function(gridNode, folder, idMap, stats){ // Link each tile to a bookmark (by id, then URL / folder name), creating missing ones; cell positions are kept
	var T = app.GridNodes.GridNodeType;
	var claimed = new Set();
	var bookmarks = (folder.children || []).slice();
	function pick(test){
		for(var b of bookmarks) if(!claimed.has(b.id) && test(b)){ claimed.add(b.id); return b; }
		return null;
	}
	var children = gridNode.children || [];
	for(var i=0; i<children.length; i++){ // Pass 1: tiles whose bookmark still exists with the same id
		var c = children[i];
		if(!c || !c.id) continue;
		var same = pick(function(b){ return b.id == c.id && (c.type == T.folder ? b.type == 'folder' : b.url == c.url); });
		if(same) c.__match = same;
	}
	for(var i=0; i<children.length; i++){
		var c = children[i];
		if(!c || (c.type != T.bookmark && c.type != T.folder) || (c.type == T.bookmark && !c.url)){
			children[i] = { type: T.empty }; // Empty cell (or unusable entry): keeps the gap
			continue;
		}
		var oldId = c.id;
		var match = c.__match;
		delete c.__match;
		if(!match){
			match = c.type == T.folder
				? pick(function(b){ return b.type == 'folder' && b.title == c.title; })
				: pick(function(b){ return b.type == 'bookmark' && b.url == c.url; });
		}
		if(match){
			stats.matched++;
		} else {
			var info = { parentId: folder.id, title: c.title || c.url || 'Folder' };
			if(c.type == T.bookmark) info.url = c.url;
			match = await browser.bookmarks.create(info);
			if(c.type == T.folder) match.children = [];
			stats.created++;
		}
		c.id = match.id;
		if(oldId) idMap[oldId] = match.id;
		if(c.type == T.folder){
			stats.folders++;
			if(!c.children) c.children = [];
			await app.Backup._attachBookmarks(c, match, idMap, stats);
		} else {
			stats.tiles++;
		}
	}
	gridNode.children = children;
	while(children.length && children[children.length-1].type == T.empty) children.pop();
};
app.Backup.import = async function(data){ // Accepts a quickdial-ng backup or an original Quick Dial data dump ({ version: 4, settings, node })
	if(!data || !data.settings || !data.node || !data.settings.grid) throw new Error('Not a Quick Dial backup');
	var settings = app.Backup._mergeDefaults(app.Settings.defaults(), app.Backup._clean(data.settings));
	delete settings.startpageTimeout; // Obsolete (start page timer), found in older exports and backups
	QDThemes.apply(settings, QDThemes.extract(settings)); // Style values end up in CSS text: keep only valid ones
	var node = app.Backup._clean(data.node);
	var stats = { tiles: 0, folders: 0, matched: 0, created: 0, images: 0 };
	var idMap = {};
	app.Bookmarks._onImportBegan(); // No bookmark events while the tree is rebuilt
	try {
		var folder = await app.Backup._loadRoot(settings.grid.root);
		await app.Backup._attachBookmarks(node, folder, idMap, stats);
		node.id = folder.id;
		var images = null;
		if(data.images){ // Backup images are keyed by the old bookmark ids
			images = {};
			for(var oldId in data.images) if(idMap[oldId]) images[idMap[oldId]] = data.images[oldId];
		}
		await app.Images.removeTree(app.node);
		app.Images._cache.clear();
		app.settings = settings;
		app.node = node;
		await app.Images.extractFromTree(app.node, images);
		(function count(n){ if(n.image == '1') stats.images++; for(var c of n.children || []) count(c); })(app.node);
		await new Promise(function(resolve){ app.Settings.save(resolve); });
		if(Array.isArray(data.themes) && data.themes.length){ // Themes from the backup are added; a theme with the same name is replaced
			var names = data.themes.map(function(t){ return String(t && t.name).trim().toLowerCase(); });
			await app.Themes.save(data.themes.concat(app.Themes.list.filter(function(t){ return names.indexOf(t.name.toLowerCase()) < 0; })));
		}
	} finally {
		app.Bookmarks.initListener();
	}
	app.Messages.broadcast(app.Messages.Commands.settingsChanged);
	app.ContextMenus.updateMenu();
	await new Promise(function(resolve){
		app.GridNodes.sync(app.node, app.settings.grid.root, resolve);
	});
	app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
	return Object.assign({ ok: true }, stats);
};

app.init();

app.ContextMenus = {} // ContextMenu helper Object
app.ContextMenus.menuItemClicked = function(info, tab){
	if (info.menuItemId == "AddToQuickDial") app.GridNodes.createBookmark(app.node, info.pageUrl, tab.title, function(){
		app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
	});
};
app.ContextMenus.initMenu = function(){ // (Called from app.init) Init context menu in all pages
	// Create Add Context menu for all pages
	if(app.settings.menuShowAdd){
		browser.contextMenus.create({
			id: 'AddToQuickDial',
			title: browser.i18n.getMessage("menuAddToQuickDial"),
			contexts: ["all"],
			documentUrlPatterns: [ 'http://*/*', 'https://*/*', 'file://*/*', 'ftp://*/*' ],
			onclick(info, tab) { app.ContextMenus.menuItemClicked(info, tab)	}
		});
	}
	// Create WebExt Page Context menu
	browser.contextMenus.create({
		id: "pagemenu",
		title: "Quick Dial NG",
		documentUrlPatterns: [ 'moz-extension://*/dial.html', 'moz-extension://*/dial.html?*' ],
		contexts: ["page"]
	});
	browser.contextMenus.create({
		id: "pagemenunew",
		parentId: "pagemenu",
		title: browser.i18n.getMessage("menuNew")
	});
	browser.contextMenus.create({
		parentId: "pagemenunew",
		title: browser.i18n.getMessage("menuNewBookmark"),
		onclick(info, tab) { 
			browser.tabs.sendMessage(tab.id, { cmd: app.Messages.Commands.menuCreateBookmark });	
		}
	});
	browser.contextMenus.create({
		parentId: "pagemenunew",
		title: browser.i18n.getMessage("menuNewFolder"),
		onclick(info, tab) {
			browser.tabs.sendMessage(tab.id, { cmd: app.Messages.Commands.menuCreateFolder });	
		}
	});
	browser.contextMenus.create({	parentId: "pagemenu", type: "separator" });
	browser.contextMenus.create({
		parentId: "pagemenu",
		title: browser.i18n.getMessage("menuSettings"),
		onclick(info, tab) {
			browser.tabs.sendMessage(tab.id, { cmd: app.Messages.Commands.menuEditSettings });	
		}
	});
	browser.contextMenus.create({
		parentId: "pagemenu",
		title: browser.i18n.getMessage("menuImportQuickDial"),
		onclick(info, tab) {
			browser.tabs.sendMessage(tab.id, { cmd: app.Messages.Commands.menuImportQuickDial });	
		}
	});
	// Create WebExt Link Context menu
	browser.contextMenus.create({
		id: "itemmenu",
		title: "Quick Dial NG",
		documentUrlPatterns: [ 'moz-extension://*/dial.html', 'moz-extension://*/dial.html?*' ],
		contexts: ["link"]
	});
	browser.contextMenus.create({
		id: "itemmenunew",
		parentId: "itemmenu",
		title: browser.i18n.getMessage("menuNew")
	});
	browser.contextMenus.create({
		parentId: "itemmenunew",
		title: browser.i18n.getMessage("menuNewBookmark"),
		onclick(info, tab) {
			browser.tabs.sendMessage(tab.id, { cmd: app.Messages.Commands.menuCreateBookmark });	
		}
	});
	browser.contextMenus.create({
		parentId: "itemmenunew",
		title: browser.i18n.getMessage("menuNewFolder"),
		onclick(info, tab) {
			browser.tabs.sendMessage(tab.id, { cmd: app.Messages.Commands.menuCreateFolder });	
		}
	});
	browser.contextMenus.create({	parentId: "itemmenu", type: "separator" });
	browser.contextMenus.create({
		parentId: "itemmenu",
		title: browser.i18n.getMessage("menuProperties"),
		onclick(info, tab) {
			browser.tabs.sendMessage(tab.id, { cmd: app.Messages.Commands.menuEditProperties });	
		}
	});
	browser.contextMenus.create({
		parentId: "itemmenu",
		title: browser.i18n.getMessage("menuRefreshItem"),
		onclick(info, tab) {
			browser.tabs.sendMessage(tab.id, { cmd: app.Messages.Commands.menuRefreshNode });	
		}
	});
	browser.contextMenus.create({
		parentId: "itemmenu",
		title: browser.i18n.getMessage("menuCapturePage"),
		onclick(info, tab) {
			browser.tabs.sendMessage(tab.id, { cmd: app.Messages.Commands.menuCapturePage });	
		}
	});
	browser.contextMenus.create({
		parentId: "itemmenu",
		title: browser.i18n.getMessage("menuDeleteItem"),
		onclick(info, tab) {
			browser.tabs.sendMessage(tab.id, { cmd: app.Messages.Commands.menuDeleteNode });	
		}
	});
	browser.contextMenus.create({	parentId: "itemmenu", type: "separator" });
	browser.contextMenus.create({
		parentId: "itemmenu",
		title: browser.i18n.getMessage("menuSettings"),
		onclick(info, tab) {
			browser.tabs.sendMessage(tab.id, { cmd: app.Messages.Commands.menuEditSettings });	
		}
	});
};
app.ContextMenus.updateMenu = function(){
	browser.contextMenus.onClicked.removeListener(app.ContextMenus.menuItemClicked);
	browser.contextMenus.removeAll();
	app.ContextMenus.initMenu();
};

app.Bookmarks = {} // Bookmarks helper object
app.Bookmarks._isTracked = function(){ // True if any of the given bookmark ids belongs to the Quick Dial tree (or the tree is not loaded yet)
	if(!app.node || !app.node.id) return true;
	for(var i=0; i<arguments.length; i++){
		if(arguments[i] && app.GridNodes.getNodeById(arguments[i])) return true;
	}
	return false;
}
app.Bookmarks._resync = function(){ app.GridNodes.sync(app.node, app.settings.grid.root, function(){ app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded); }); }
app.Bookmarks._onCreated = function(id, bookmark){ if(app.Bookmarks._isTracked(bookmark && bookmark.parentId)) app.Bookmarks._resync(); }
app.Bookmarks._onChanged = function(id){ if(app.Bookmarks._isTracked(id)) app.Bookmarks._resync(); }
app.Bookmarks._onMoved = function(id, moveInfo){ if(app.Bookmarks._isTracked(id, moveInfo && moveInfo.parentId, moveInfo && moveInfo.oldParentId)) app.Bookmarks._resync(); }
app.Bookmarks._onRemoved = function(id, removeInfo){ if(app.Bookmarks._isTracked(id, removeInfo && removeInfo.parentId)) app.Bookmarks._resync(); }
app.Bookmarks._onImportBegan = function(){
	browser.bookmarks.onCreated.removeListener(app.Bookmarks._onCreated);
	browser.bookmarks.onChanged.removeListener(app.Bookmarks._onChanged);
	browser.bookmarks.onMoved.removeListener(app.Bookmarks._onMoved);
	browser.bookmarks.onRemoved.removeListener(app.Bookmarks._onRemoved);		
}
app.Bookmarks._onImportEnded = function(){
	app.GridNodes.sync(app.node, app.settings.grid.root, function(){ app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded); });
	app.Bookmarks.initListener();
}
app.Bookmarks.initListener = function(){ // (Called from app.init) Init listener of bookmarks (events outside the Quick Dial tree are ignored)
	browser.bookmarks.onCreated.addListener(app.Bookmarks._onCreated);
	browser.bookmarks.onChanged.addListener(app.Bookmarks._onChanged);
	browser.bookmarks.onMoved.addListener(app.Bookmarks._onMoved);
	browser.bookmarks.onRemoved.addListener(app.Bookmarks._onRemoved);		
}
app.Bookmarks.load = function(rootPath, callback){ // Load root bookmark and create it if not exist
	if(!callback) return;
	var root = 'menu________';
	if(rootPath.substr(0,1)=='/') root = 'root________';
	browser.bookmarks.getSubTree(root).then(function(bookmarkItems){
		function getChildItem(bookmarkItem, path, callback){
			if(path.length == 0){
				callback(bookmarkItem);
				return;
			}
			for(var child of bookmarkItem.children || []) // A folder just created has no children list
				if((path + '/').startsWith(child.title + '/'))
					return getChildItem(child, path.substr(child.title.length + 1), callback);
			browser.bookmarks.create({
				parentId: bookmarkItem.id,
				title: path.substr(0, (path + '/').indexOf('/'))
			}).then(function(bookmarkItem){
				return getChildItem(bookmarkItem, path.substr(bookmarkItem.title.length + 1), callback);
			}, function(){ callback(); });
		}
		if(rootPath.substr(0,1)=='/') getChildItem(bookmarkItems[0], rootPath.substr(1), callback);
		else getChildItem(bookmarkItems[0], rootPath, callback);
	}, function(){ callback(); });
}

app.SiteInfos = {} // Siteinfos helper object
app.SiteInfos.fromNewTab = function(url, callback){  // Retrieve infos from a new tab. callback( { url, title, icon, screenshot } || error: callback() )
	browser.tabs.create({url: url, active: false}).then(function(tab){
		browser.tabs.update(tab.id, {muted: true}).then();
		function whaitLoaded(){
			browser.tabs.get(tab.id).then(function(tab){
				if(tab.status == 'loading') setTimeout(whaitLoaded, 300);
				else {
					browser.tabs.update(tab.id, {active: true}).then(function(){
						setTimeout(function(){
							browser.tabs.captureVisibleTab().then(function(img){
								browser.tabs.remove(tab.id);
								
								var imgObj = new Image;
								imgObj.src = img;

								var previewWidth = 1200; // Need to be linked to settings
								var previewHeight = previewWidth / app.settings.grid.ratioX * app.settings.grid.ratioY;
								if(app.settings.grid.title == true) previewHeight -= app.settings.grid.titleHeight;

								var canvas = document.createElement('canvas');
								canvas.style.width = previewWidth.toString() + 'px';
								canvas.style.height = previewHeight.toString() + 'px';
								canvas.width = previewWidth / 2;
								canvas.height = previewHeight / 2;

								var ctx = canvas.getContext('2d');
								ctx.clearRect(0, 0, previewWidth, previewHeight);
								ctx.save();
								ctx.scale(0.5, 0.5);
								setTimeout(function(){
									if(tab.height * previewWidth / previewHeight >= tab.width){
										// Cut the bottom of the page
										ctx.drawImage(imgObj, 0, 0, tab.width, tab.width / previewWidth * previewHeight, 0, 0, previewWidth, previewHeight);
									} else {
										// Stretch or cutting right part of the page ? actualy Stretch
										ctx.drawImage(imgObj, 0, 0, tab.width, tab.height, 0, 0, previewWidth, previewHeight);
										//ctx.drawImage(imgObj, 0, 0, tab.height / previewHeight * previewWidth, tab.height, 0, 0, previewWidth, previewHeight);
									}
									ctx.restore();
									img = canvas.toDataURL('image/webp', app.Images.quality);
									if(callback) callback( { url: tab.url, title: tab.title, icon: tab.favIconUrl, screenshot: img } );
								}, 100);
							}, function(){
								browser.tabs.remove(tab.id);
								if(callback) callback();
							});
						}, app.settings.grid.cells.snapshotDelay);
					}, function(){ if(callback) callback(); });
				}
			}, function(){ if(callback) callback(); });
		}
		setTimeout(whaitLoaded, 300);
	}, function(){ if(callback) callback(); });
}
app.SiteInfos.fromFrame = function(url, callback){ // Retrieve infos from an iframe. callback( { url, title, (/!\ Not handled now)icon, screenshot } || error: callback() )
	function pageLoaded(){
		if(!iframe) return;
		var docTitle = iframe.contentWindow.document.title;
		var docIcon = null;
		var docScreenshot = null;
		//title
		if(docTitle == '') docTitle = url;
		//icon
		//screenshot
		var canvas = document.createElement('canvas');
		canvas.style.width = previewWidth.toString() + 'px';
		canvas.style.height = previewHeight.toString() + 'px';
		canvas.width = previewWidth / 2;
		canvas.height = previewHeight / 2;
		var ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, previewWidth, previewHeight);
		ctx.save();
		ctx.scale(0.5, 0.5);
		try {
			ctx.drawWindow(iframe.contentWindow, 0, 0, previewWidth, previewHeight, 'rgb(255, 255, 255)');
		} catch(e) { // drawWindow is not available to extensions in recent Firefox versions
			document.body.removeChild(iframe);
			iframe = null;
			if(callback) callback();
			return;
		}
		ctx.restore();
		docScreenshot = canvas.toDataURL('image/webp', app.Images.quality);

		document.body.removeChild(iframe);
		iframe = null;
		if(callback) callback({ url: url, title: docTitle, icon: docIcon, screenshot:docScreenshot });
	}

	var previewWidth = 1200; // Need to be linked to settings
	var previewHeight = previewWidth / app.settings.grid.ratioX * app.settings.grid.ratioY;
	if(app.settings.grid.title == true) previewHeight -= app.settings.grid.titleHeight;
	var iframe;
	var xmlHttp = new XMLHttpRequest();
	xmlHttp.timeout = 10000
	xmlHttp.open('GET', url, true);
	xmlHttp.onload = function(){
		iframe = document.createElement('iframe');
		iframe.width = previewWidth
		iframe.height = previewHeight
		iframe.style.position = 'absolute';
		iframe.scrolling = 'no';
		var content = xmlHttp.responseText.replace('<head>', '<head><base href="' + url + '">');
		document.body.appendChild(iframe);
		iframe.onload = function(){ pageLoaded(); }
		iframe.srcdoc = content;
		setTimeout(function(){ pageLoaded(); }, 6000);
	}
	xmlHttp.onabort = function(){ if(callback) callback(); }
	xmlHttp.onerror = function(){ if(callback) callback(); }
	xmlHttp.ontimeout = function(){ if(callback) callback(); }
	xmlHttp.send();
}
app.SiteInfos.fromWS = function(url, callback){ // Retrieve infos from a Web Service. callback( { url, title, (/!\ Not handled now)icon, screenshot } || error: callback() )
	console.log('Not implemented');
	return app.SiteInfos.fromFrame(url, callback);
}

app.GridNodes = {}; // GridNodes helper object
app.GridNodes.GridNodeType = { // GridNodeType
	back: -1,
	empty: 0,
	folder: 1,
	bookmark: 2
}
app.GridNodes.sync = function(gridNode, rootPath, callback){ // Sync GridNodes with Bookmarks
	if(app.GridNodes._syncing) {
		app.GridNodes._needSync = true;
		return;
	}
	app.GridNodes._syncing = true;
	app.Bookmarks.load(rootPath, function(bookmarkItem){
		if(!bookmarkItem){ // Bookmarks unavailable: don't stay locked
			delete app.GridNodes._syncing;
			delete app.GridNodes._needSync;
			if(callback) callback();
			return;
		}
		function syncNode(gridNode, bookmarkItem){
			gridNode.id = bookmarkItem.id;
			gridNode.title = bookmarkItem.title;
			switch(bookmarkItem.type){
				case 'bookmark':
					gridNode.type = app.GridNodes.GridNodeType.bookmark;
					if(gridNode.url != bookmarkItem.url){
						gridNode.url = bookmarkItem.url;
						app.Images.setNodeImage(gridNode, null);
					}
					break;
				case 'folder':
					gridNode.type = app.GridNodes.GridNodeType.folder;
					if(!bookmarkItem.children) bookmarkItem.children = []; // A folder just created has no children list
					var EmptyNodes = [];
					if(! gridNode.children) gridNode.children = [];
					else {
						for(var i=gridNode.children.length-1; i>=0; i--){
							if(!gridNode.children[i]) gridNode.children[i] = { type: app.GridNodes.GridNodeType.empty };
							if(gridNode.children[i].type==app.GridNodes.GridNodeType.empty){
								EmptyNodes.unshift(gridNode.children[i]);
							} else {
								var found = false;
								for(var child of bookmarkItem.children){
									if(child.id==gridNode.children[i].id){
										found = true;
										break;
									}
								}
								if(! found){
									app.Images.removeTree(gridNode.children[i]);
									if(i<gridNode.children.length - 1){
										gridNode.children[i] = { type: app.GridNodes.GridNodeType.empty };
										EmptyNodes.unshift(gridNode.children[i]);
									} else {
										gridNode.children.pop();
									}
								}
							}
						}
					}
					for(var child of bookmarkItem.children){
						var childGridNode = app.GridNodes.getChildNode(gridNode, child.id);
						if(!childGridNode){
							if(EmptyNodes.length>0){
								childGridNode = EmptyNodes[0];
								EmptyNodes.shift();
							}else {
								childGridNode = {};
								gridNode.children.push(childGridNode)
							}
						}
						syncNode(childGridNode, child);
					}
					EmptyNodes.length = 0;
					break;
				default:
					gridNode.type = app.GridNodes.GridNodeType.empty;
					break;
			}
		}
		
		try {
			syncNode(gridNode, bookmarkItem);
		} catch(e) {
			console.error('Quick Dial NG: bookmark sync failed', e);
		}
		delete app.GridNodes._syncing;
		if(app.GridNodes._needSync == true) {
			delete app.GridNodes._needSync;
      app.GridNodes.sync(gridNode, rootPath, callback);
		} else {
			app.GridNodes.save();			
			if(callback) callback();
		}
	});
}
app.GridNodes.save = function(callback){ // Save GridNodes
	app.Settings.save(callback);
}
app.GridNodes.getNode = function(gridNode, path){ // Return GridNode from RootGridNode path
	if(path.length == 0 || path == '/') return gridNode;
	for(var child of gridNode.children)
		if(path.startsWith(child.title + '/'))
			return app.GridNodes.getNode(child, path.substr(child.title.length + 1));
	return null;
}
app.GridNodes.getNodeById = function(id){
	var nodes = app.GridNodes.getNodeWithParents(id);
	if(nodes) return nodes[nodes.length-1];
	return null;
}
app.GridNodes.getNodeWithParents = function(id){
	
	var parents = [];

	function findNode(gridNode){
		if(gridNode.id == id){
			parents.unshift(gridNode);
			return gridNode;
		}
		if(gridNode.children){
			for(var i=0; i<gridNode.children.length; i++){
				var result = findNode(gridNode.children[i]);
				if(result){
					parents.unshift(gridNode);
					return result;
				}
			}
		}
		return null;
	}

	findNode(app.node, id);
	if(parents.length>0) return parents;
	return null;
}
app.GridNodes.updateNode = function(gridNode, value, callback){
	if(value){
		if(value.title) gridNode.title = value.title;
		if(value.titleLocked!=null) gridNode.titleLocked = value.titleLocked;
		if(value.imageLocked!=null){
			gridNode.imageLocked = value.imageLocked;
			app.Images.setNodeImage(gridNode, value.image);
		} else if(gridNode.imageLocked != true){
			app.Images.setNodeImage(gridNode, value.image);
		}
		if(value.imageMode || value.imageMode == 0) {
			if(value.imageMode == -1) delete gridNode.imageMode;
			else gridNode.imageMode = value.imageMode;
		}
		if(gridNode.type == app.GridNodes.GridNodeType.bookmark && value.url && gridNode.url != value.url){
			gridNode.url = value.url;
			app.GridNodes.refreshNode(gridNode, function(){
				app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
				app.GridNodes.saveNode(gridNode);
				var data = { title: gridNode.title };
				//if(gridNode.imageMode) data.imageMode = gridNode.imageMode;
				//if(gridNode.type == app.GridNodes.GridNodeType.bookmark) data.url = gridNode.url;
				data.url = gridNode.url;
				browser.bookmarks.onChanged.removeListener(app.Bookmarks._onChanged);
				browser.bookmarks.update(gridNode.id, data).then(function(){
					browser.bookmarks.onChanged.addListener(app.Bookmarks._onChanged);
				});
			});
		} else {
			app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
			app.GridNodes.saveNode(gridNode);
			var data = { title: gridNode.title };
			//if(gridNode.imageMode) data.imageMode = gridNode.imageMode;
			browser.bookmarks.onChanged.removeListener(app.Bookmarks._onChanged);
			browser.bookmarks.update(gridNode.id, data).then(function(){
				browser.bookmarks.onChanged.addListener(app.Bookmarks._onChanged);
			});
		}
	}
	if(callback) callback(gridNode);
}
app.GridNodes.getChildNode = function(gridNode, id){ // Return child node by ID
	for(var child of gridNode.children) if(child.id == id) return child;
	return null;
}
app.GridNodes.saveNode = function(gridNode, callback){ // Save GridNode
	app.Settings.save(callback);
}
app.GridNodes.setNodeIndex = function(gridNode, index, newIndex, callback){ // Set Child GridNodeIndex. callback(gridNode, node1, node2)
	while(newIndex>=gridNode.children.length)
		gridNode.children.push({ type: app.GridNodes.GridNodeType.empty });
	var node1 = gridNode.children[index];
	var node2 = gridNode.children[newIndex];
	gridNode.children[index] = node2;
	gridNode.children[newIndex] = node1;
	for(var i=gridNode.children.length-1; i>=0; i--){
		if(gridNode.children[i].type != app.GridNodes.GridNodeType.empty) break;
		gridNode.children.pop();
	}
	app.GridNodes.saveNode(gridNode);
	if(callback) callback(gridNode, node1, node2);
}
app.GridNodes.createBookmark = function(gridNode, url, title, callback){ // Create a new Bookmark in a GridNode.  callback(gridNode, newGridNode)
	browser.bookmarks.onCreated.removeListener(app.Bookmarks._onCreated);
	var prefix = '';
	if(url.indexOf('://')<0) prefix = 'http://';
	browser.bookmarks.create({
		parentId: gridNode.id,
		title: title || url,
		url: prefix + url
	}).then(function(bookmarkItem){
		if(!gridNode) return; // ??? Why this method are called a second time with gridNode = null ???
		browser.bookmarks.onCreated.addListener(app.Bookmarks._onCreated);
		var newGridNode = { id: bookmarkItem.id, type: app.GridNodes.GridNodeType.bookmark, url: prefix + url, title };
		var EmptyCellFound = false;
		for(var i=0; i<gridNode.children.length; i++){
			if(gridNode.children[i].type == app.GridNodes.GridNodeType.empty){
				EmptyCellFound = true;
				gridNode.children[i] = newGridNode;
				break;
			}
		}
		if(EmptyCellFound == false) gridNode.children.push(newGridNode);
		app.GridNodes.saveNode(newGridNode);
		if(callback) callback(gridNode, newGridNode);
	}, function(){
		browser.bookmarks.onCreated.addListener(app.Bookmarks._onCreated);
	});
}
app.GridNodes.createFolder = function(gridNode, name, callback){ // Create a new folder in a GridNode. callback(gridNode, newGridNode)
	browser.bookmarks.onCreated.removeListener(app.Bookmarks._onCreated);
	browser.bookmarks.create({
		parentId: gridNode.id,
		title: name
	}).then(function(bookmarkItem){
		if(!gridNode) return; // ??? Why this method are called a second time with gridNode = null ???
		browser.bookmarks.onCreated.addListener(app.Bookmarks._onCreated);
		var newGridNode = { id: bookmarkItem.id, type: app.GridNodes.GridNodeType.folder, title: name, children: [] };
		var EmptyCellFound = false;
		for(var i=0; i<gridNode.children.length; i++){
			if(gridNode.children[i].type == app.GridNodes.GridNodeType.empty){
				EmptyCellFound = true;
				gridNode.children[i] = newGridNode;
				break;
			}
		}
		if(EmptyCellFound == false) gridNode.children.push(newGridNode);
		app.GridNodes.saveNode(newGridNode);
		if(callback) callback(gridNode, newGridNode);
	}, function(){
		browser.bookmarks.onCreated.addListener(app.Bookmarks._onCreated);
	});
}
app.GridNodes.deleteNode = function(gridNode, id, callback){ // Delete a GridNode. callback(gridNode, id)
	for(var i=0; i<gridNode.children.length; i++){
		if(gridNode.children[i].id == id){
			app.Images.removeTree(gridNode.children[i]);
			gridNode.children[i] = { type: app.GridNodes.GridNodeType.empty };
			app.GridNodes.saveNode(gridNode);
			break;
		}
	}
	for(var i=gridNode.children.length-1; i>=0; i--){
		if(gridNode.children[i].type != app.GridNodes.GridNodeType.empty) break;
		gridNode.children.pop();
	}
	browser.bookmarks.onRemoved.removeListener(app.Bookmarks._onRemoved);
	browser.bookmarks.removeTree(id).then(function(){
		browser.bookmarks.onRemoved.addListener(app.Bookmarks._onRemoved);
	}, function(){
		browser.bookmarks.onRemoved.addListener(app.Bookmarks._onRemoved);
	});
	if(callback) callback(gridNode, id);
}

app.GridNodes.refreshNode = function(gridNode, callback){ // Refresh content of a GridNode
	if(gridNode.__isLoading == true) return;
	gridNode.__isLoading = true;
	switch(gridNode.type){
		case app.GridNodes.GridNodeType.folder:
			app.Images.setNodeImage(gridNode, null);
			delete gridNode.__isLoading;
			app.GridNodes.saveNode(gridNode);
			if(callback) callback({ title: gridNode.title });
			/*
			browser.bookmarks.onChanged.removeListener(app.Bookmarks._onChanged);
			browser.bookmarks.update(gridNode.id, { title: gridNode.title }).then(function(){
				browser.bookmarks.onChanged.addListener(app.Bookmarks._onChanged);
			});
			*/
			break;
		case app.GridNodes.GridNodeType.bookmark:
			app.SiteInfos.fromFrame(gridNode.url, function(infos){
				if(gridNode.imageLocked!=true){
					if(infos){
						if(gridNode.titleLocked!=true) gridNode.title = infos.title;
						app.Images.setNodeImage(gridNode, infos.screenshot);
					} else {
						app.Images.setNodeImage(gridNode, '0');
					}
				}
			
				delete gridNode.__isLoading;
				app.GridNodes.saveNode(gridNode);
				if(callback) callback(infos);
				browser.bookmarks.onChanged.removeListener(app.Bookmarks._onChanged);
				browser.bookmarks.update(gridNode.id, { title: gridNode.title, url: gridNode.url }).then(function(){
					browser.bookmarks.onChanged.addListener(app.Bookmarks._onChanged);
				});
			});
			break;
	}
}
app.GridNodes.capturePage = function(gridNode, callback){
	if(gridNode.__isLoading == true) return;
	gridNode.__isLoading = true;
	switch(gridNode.type){
		case app.GridNodes.GridNodeType.folder:
			var nodes = app.GridNodes.getNodeWithParents(gridNode.id);
			if(nodes){
				var path = '';
				for(var i=1; i<nodes.length; i++) path = path + '/' + nodes[i].title;
				app.SiteInfos.fromNewTab('/dial.html?path=' + path, function(infos){
					app.Images.setNodeImage(gridNode, infos ? infos.screenshot : null);
					delete gridNode.__isLoading;
					app.GridNodes.saveNode(gridNode);
					if(callback) callback({ title: gridNode.title });
				});
			}
			break;
		case app.GridNodes.GridNodeType.bookmark:
			app.SiteInfos.fromNewTab(gridNode.url, function(infos){
				if(gridNode.imageLocked!=true){
					if(infos){
						if(gridNode.titleLocked!=true) gridNode.title = infos.title;
						app.Images.setNodeImage(gridNode, infos.screenshot);
					} else {
						app.Images.setNodeImage(gridNode, '0');
					}
				}
				delete gridNode.__isLoading;
				app.GridNodes.saveNode(gridNode);
				if(callback) callback(infos);
				browser.bookmarks.onChanged.removeListener(app.Bookmarks._onChanged);
				browser.bookmarks.update(gridNode.id, { title: gridNode.title, url: gridNode.url }).then(function(){
					browser.bookmarks.onChanged.addListener(app.Bookmarks._onChanged);
				});
			});
			break;
	}
}
