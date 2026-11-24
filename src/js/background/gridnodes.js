// Quick Dial NG — background page: the tree of tiles (app.node), kept in sync with the Quick Dial
// bookmarks folder. A folder's children are its cells in order, with { type: empty } for gaps.
/**
 * @typedef {object} GridNode
 * @property {string} [id] bookmark id (none for an empty cell)
 * @property {number} type one of QDCommon.NodeType
 * @property {string} [title]
 * @property {string} [url] bookmarks only
 * @property {GridNode[]} [children] folders only
 * @property {string} [image] '1': picture stored (see images.js), '0': none could be made
 * @property {number} [imageMode] how the picture fills the tile (dial.applyImageMode); none: the default
 * @property {number} [imageSource] where the picture comes from (QDCommon.ImageSource); none: a screenshot of the page
 * @property {boolean} [titleLocked] Refresh and Capture keep the title
 * @property {boolean} [imageLocked] ...and the picture
 */
app.GridNodes = {};

/** Brings the tree under gridNode in line with the bookmarks folder at rootPath, then saves it. Resolves once done;
 * when the bookmarks can't be read, the tree is left as it is. A sync asked for while one runs waits for it, then one
 * more runs with the latest arguments (an import or a new root may have replaced the tree meanwhile), and every
 * caller's promise resolves after that one, in the order they asked.
 * @param {GridNode} gridNode @param {string} rootPath @returns {Promise<void>} */
app.GridNodes.sync = function(gridNode, rootPath){
	return new Promise(resolve => {
		if(app.GridNodes._syncing){
			const queued = app.GridNodes._queued || (app.GridNodes._queued = { waiting: [] });
			queued.gridNode = gridNode;
			queued.rootPath = rootPath;
			queued.waiting.push(resolve);
			return;
		}
		app.GridNodes._runSync(gridNode, rootPath, [resolve]);
	});
};
app.GridNodes._runSync = function(gridNode, rootPath, waiting){ // waiting: the resolve functions of the callers so far
	app.GridNodes._syncing = true;
	app.Bookmarks.load(rootPath).then(bookmarkItem => {
		if(bookmarkItem){
			try {
				app.GridNodes._syncNode(gridNode, bookmarkItem);
			} catch(e) {
				console.error('Quick Dial NG: bookmark sync failed', e);
			}
		}
		const next = app.GridNodes._queued;
		if(next){ // Asked for meanwhile: that one saves, and answers everyone
			delete app.GridNodes._queued;
			app.GridNodes._runSync(next.gridNode, next.rootPath, waiting.concat(next.waiting));
			return;
		}
		delete app.GridNodes._syncing;
		if(bookmarkItem) app.GridNodes.save();
		for(const resolve of waiting) resolve();
	});
};
app.GridNodes._syncNode = function(gridNode, bookmarkItem){ // Copies a bookmark (or folder, with its contents) onto its node
	const NodeType = QDCommon.NodeType;
	gridNode.id = bookmarkItem.id;
	gridNode.title = bookmarkItem.title;
	switch(bookmarkItem.type){
		case 'bookmark':
			gridNode.type = NodeType.bookmark;
			if(gridNode.url != bookmarkItem.url){
				gridNode.url = bookmarkItem.url;
				app.Images.setNodeImage(gridNode, null); // An icon or a letter tile is made again for the new address; a screenshot replaces the user's picture
			}
			break;
		case 'folder':
			gridNode.type = NodeType.folder;
			app.GridNodes._syncChildren(gridNode, bookmarkItem.children || []); // A folder just created has no children list
			break;
		default:
			gridNode.type = NodeType.empty;
			break;
	}
};
// A folder's cells after its bookmarks changed: a tile keeps its cell, a bookmark that is gone leaves a gap
// (none at the end), and new bookmarks fill the gaps first, then go at the end.
app.GridNodes._syncChildren = function(gridNode, bookmarks){
	const NodeType = QDCommon.NodeType;
	const bookmarkIds = new Set(bookmarks.map(child => child.id));
	const emptyNodes = []; // Gaps, in order
	if(!gridNode.children) gridNode.children = [];
	const children = gridNode.children;
	for(let i = children.length - 1; i >= 0; i--){
		if(!children[i]) children[i] = { type: NodeType.empty };
		if(children[i].type == NodeType.empty){
			emptyNodes.unshift(children[i]);
		} else if(!bookmarkIds.has(children[i].id)){ // Bookmark gone: its cell becomes a gap
			app.Images.removeTree(children[i]);
			if(i < children.length - 1){
				children[i] = { type: NodeType.empty };
				emptyNodes.unshift(children[i]);
			} else {
				children.pop();
			}
		}
	}
	const byId = new Map();
	for(const child of children) if(child.id && !byId.has(child.id)) byId.set(child.id, child);
	for(const child of bookmarks){
		let childGridNode = byId.get(child.id);
		if(!childGridNode){
			childGridNode = emptyNodes.shift();
			if(!childGridNode){
				childGridNode = {};
				children.push(childGridNode);
			}
		}
		app.GridNodes._syncNode(childGridNode, child);
	}
};
app.GridNodes.save = function(){ // The tree is saved with the settings (see Settings.save)
	return app.Settings.save();
};

/** The folder node at a path like "Work/Tools/" below gridNode. @param {GridNode} gridNode @param {string} path @returns {GridNode|null} */
app.GridNodes.getNode = function(gridNode, path){
	if(path.length == 0 || path == '/') return gridNode;
	for(const child of gridNode.children)
		if(path.startsWith(child.title + '/'))
			return app.GridNodes.getNode(child, path.slice(child.title.length + 1));
	return null;
};
app.GridNodes.getChildNode = function(gridNode, id){ // Child node by id
	return gridNode.children.find(child => child.id == id) || null;
};
/** @param {string} id @returns {GridNode|null} */
app.GridNodes.getNodeById = function(id){
	const nodes = app.GridNodes.getNodeWithParents(id);
	return nodes ? nodes[nodes.length - 1] : null;
};
/** [root, ..., node], or null. @param {string} id @returns {GridNode[]|null} */
app.GridNodes.getNodeWithParents = function(id){
	const find = gridNode => {
		if(gridNode.id == id) return [gridNode];
		for(const child of gridNode.children || []){
			const path = find(child);
			if(path) return [gridNode, ...path];
		}
		return null;
	};
	return find(app.node);
};

/**
 * @typedef {object} NodeChanges what the Properties page sends; a field left out is kept
 * @property {string} [title]
 * @property {string} [url]
 * @property {string|null} [image] data URL or url(...) of a picture, '0' or none (see Images.setNodeImage)
 * @property {number} [imageMode] QDCommon.ImageMode.inherit: back to the default
 * @property {number} [imageSource] where the picture comes from (QDCommon.ImageSource), set with the picture
 * @property {boolean} [capturePage] take a screenshot of the page once saved (Page chosen as the picture's source)
 * @property {boolean} [titleLocked]
 * @property {boolean} [imageLocked]
 */
/** Changes from the Properties page. A new address gets its title and picture first (see refreshNode).
 * Resolves once the bookmark is updated too, and the page captured when asked. @param {GridNode} gridNode @param {NodeChanges} value @returns {Promise<void>} */
app.GridNodes.updateNode = async function(gridNode, value){
	const NodeType = QDCommon.NodeType;
	if(!value) return;
	const setPicture = () => {
		app.Images.setNodeImage(gridNode, value.image);
		if(value.imageSource != null) app.GridNodes._setImageSource(gridNode, value.imageSource);
	};
	if(value.title) gridNode.title = value.title;
	if(value.titleLocked != null) gridNode.titleLocked = value.titleLocked;
	if(value.imageLocked != null){
		gridNode.imageLocked = value.imageLocked;
		setPicture();
	} else if(gridNode.imageLocked != true){
		setPicture();
	}
	if(value.imageMode || value.imageMode == 0){
		if(value.imageMode == QDCommon.ImageMode.inherit) delete gridNode.imageMode;
		else gridNode.imageMode = value.imageMode;
	}
	const urlChanged = gridNode.type == NodeType.bookmark && value.url && gridNode.url != value.url;
	if(urlChanged) gridNode.url = value.url;
	app.GridNodes.save();
	if(urlChanged) await app.GridNodes.refreshNode(gridNode);
	await app.Bookmarks.update(gridNode.id, urlChanged ? { title: gridNode.title, url: gridNode.url } : { title: gridNode.title });
	if(value.capturePage && gridNode.type == NodeType.bookmark) await app.GridNodes.capturePage(gridNode);
};
app.GridNodes._setImageSource = function(gridNode, source){ // A screenshot of the page is the default: not stored
	if(source == QDCommon.ImageSource.page) delete gridNode.imageSource;
	else gridNode.imageSource = source;
};
app.GridNodes.setNodeIndex = function(gridNode, index, newIndex){ // Swap two cells (drag and drop)
	const children = gridNode.children;
	while(newIndex >= children.length) children.push({ type: QDCommon.NodeType.empty });
	const node1 = children[index];
	children[index] = children[newIndex];
	children[newIndex] = node1;
	app.GridNodes._trimEmpty(gridNode);
	app.GridNodes.save();
};
app.GridNodes._trimEmpty = function(gridNode){ // No gaps at the end of a folder
	const children = gridNode.children;
	while(children.length && children[children.length - 1].type == QDCommon.NodeType.empty) children.pop();
};
app.GridNodes._place = function(gridNode, newGridNode){ // Into the first gap, or at the end
	const NodeType = QDCommon.NodeType;
	const gap = gridNode.children.findIndex(child => child.type == NodeType.empty);
	if(gap >= 0) gridNode.children[gap] = newGridNode;
	else gridNode.children.push(newGridNode);
	app.GridNodes.save();
};
/** New bookmark in a folder. Resolves with its node, or null when the bookmark could not be created.
 * @param {GridNode} gridNode @param {string} url @param {string} title @returns {Promise<GridNode|null>} */
app.GridNodes.createBookmark = function(gridNode, url, title){
	const fullUrl = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : 'http://' + url; // "example.com" gets a scheme; "about:config" keeps its own
	return app.Bookmarks.quietly('onCreated', () => browser.bookmarks.create({ parentId: gridNode.id, title: title || url, url: fullUrl })).then(bookmarkItem => {
		const newGridNode = { id: bookmarkItem.id, type: QDCommon.NodeType.bookmark, url: fullUrl, title };
		app.GridNodes._place(gridNode, newGridNode);
		return newGridNode;
	}, () => null);
};
/** New folder in a folder. Resolves with its node, or null when the folder could not be created.
 * @param {GridNode} gridNode @param {string} name @returns {Promise<GridNode|null>} */
app.GridNodes.createFolder = function(gridNode, name){
	return app.Bookmarks.quietly('onCreated', () => browser.bookmarks.create({ parentId: gridNode.id, title: name })).then(bookmarkItem => {
		const newGridNode = { id: bookmarkItem.id, type: QDCommon.NodeType.folder, title: name, children: [] };
		app.GridNodes._place(gridNode, newGridNode);
		return newGridNode;
	}, () => null);
};
app.GridNodes.deleteNode = function(gridNode, id){ // Delete a tile and its bookmark (or folder)
	const i = gridNode.children.findIndex(child => child.id == id);
	if(i >= 0){
		app.Images.removeTree(gridNode.children[i]);
		gridNode.children[i] = { type: QDCommon.NodeType.empty };
		app.GridNodes.save();
	}
	app.GridNodes._trimEmpty(gridNode);
	app.Bookmarks.quietly('onRemoved', () => browser.bookmarks.removeTree(id)).catch(() => {});
};

// Title and picture from a site: Refresh downloads the page, Capture page opens it in a tab. Both resolve with
// the site infos, or null when it failed; a folder gets its picture cleared or captured, and resolves with its title.
// One at a time per tile: asked again while one is under way, they answer with that one.
app.GridNodes._loading = new WeakMap(); // tile -> promise of its Refresh or Capture page under way
app.GridNodes._loadOnce = function(gridNode, load){
	const running = app.GridNodes._loading.get(gridNode);
	if(running) return running;
	gridNode.__isLoading = true; // Not saved ("__"); tells the tile is loading to whoever reads it meanwhile
	const finish = infos => {
		delete gridNode.__isLoading;
		app.GridNodes._loading.delete(gridNode);
		return infos;
	};
	const promise = Promise.resolve().then(load).then(finish, e => {
		console.error('Quick Dial NG: loading the tile failed', e);
		return finish(null);
	});
	app.GridNodes._loading.set(gridNode, promise);
	return promise;
};
app.GridNodes._applySiteInfos = function(gridNode, infos){ // A screenshot from Refresh or Capture page, or null when it failed
	if(gridNode.imageLocked != true){
		if(infos){
			if(gridNode.titleLocked != true) gridNode.title = infos.title;
			app.Images.setNodeImage(gridNode, infos.screenshot);
			delete gridNode.imageSource; // A screenshot of the page now
		} else if(gridNode.imageSource == null || gridNode.image != '1'){ // A failed capture leaves an icon or the user's own picture as it was
			app.Images.setNodeImage(gridNode, '0');
		}
	}
	app.GridNodes.save();
	app.Bookmarks.update(gridNode.id, { title: gridNode.title, url: gridNode.url });
	return infos;
};
/** @param {GridNode} gridNode @returns {Promise<object|null>} */
app.GridNodes.refreshNode = function(gridNode){
	const NodeType = QDCommon.NodeType;
	return app.GridNodes._loadOnce(gridNode, () => {
		switch(gridNode.type){
			case NodeType.folder: // The dial shows the folder icon again
				app.Images.setNodeImage(gridNode, null);
				app.GridNodes.save();
				return { title: gridNode.title };
			case NodeType.bookmark:
				if(app.GridNodes._hasOwnPicture(gridNode)) return app.GridNodes._refreshFromSite(gridNode, false);
				if(!gridNode.image && gridNode.imageLocked != true) return app.GridNodes._makePicture(gridNode, app.GridNodes.newTilePicture()); // A new tile, or one whose picture went with its old address
				return app.GridNodes._screenshot(gridNode);
		}
		return null;
	});
};
app.GridNodes._screenshot = function(gridNode){ // Title and picture from the page downloaded in a frame
	return app.SiteInfos.fromFrame(gridNode.url).then(infos => app.GridNodes._applySiteInfos(gridNode, infos));
};
/** The picture new tiles get (Settings › Tiles › New tiles get): one of QDCommon.TilePicture. @returns {number} */
app.GridNodes.newTilePicture = function(){
	const kind = app.settings && app.settings.grid && app.settings.grid.newTilePicture;
	return QDCommon.isTilePicture(kind) ? kind : QDCommon.TilePicture.page;
};
// A bookmark tile's picture of the kind `kind` (QDCommon.TilePicture), with the title from the site: a screenshot, the
// site's icon (a letter tile when it has none), or the icon with a screenshot when it has none. A tile that shows a
// screenshot already keeps it then (resolves with null). Not for a kept picture (imageLocked): the caller checks.
app.GridNodes._makePicture = async function(gridNode, kind){
	const TilePicture = QDCommon.TilePicture, ImageSource = QDCommon.ImageSource;
	if(kind == TilePicture.siteIcon || kind == TilePicture.siteIconOrPage){
		const found = await app.SiteIcons.find(gridNode.url);
		if(found.icons.length || kind == TilePicture.siteIcon){
			gridNode.imageSource = ImageSource.siteIcon;
			return app.GridNodes._refreshFromSite(gridNode, true, found);
		}
		if(gridNode.imageSource == null && gridNode.image == '1') return null;
	}
	delete gridNode.imageSource;
	return app.GridNodes._screenshot(gridNode);
};
// Whether "Apply to tiles" gives a tile a new picture of the kind `kind`: not a folder, a kept picture (imageLocked) or the
// user's own picture, nor a tile that has that kind already (a screenshot, or an icon or a letter tile for the icon kinds).
app.GridNodes._takesPicture = function(gridNode, kind){
	const ImageSource = QDCommon.ImageSource, source = gridNode.imageSource;
	if(gridNode.type != QDCommon.NodeType.bookmark || gridNode.imageLocked == true) return false;
	if(source == ImageSource.file && gridNode.image == '1') return false;
	const isIcon = source == ImageSource.siteIcon || source == ImageSource.letter;
	if(kind == QDCommon.TilePicture.page) return isIcon || gridNode.image != '1';
	return !isIcon;
};
/** Settings › Tiles › Apply to tiles: every tile in every folder that takes a picture of the kind `kind` (see _takesPicture)
 * gets one, a tile at a time; onTile() is called after each. Resolves with the number of those tiles.
 * @param {number} kind one of QDCommon.TilePicture @param {() => void} [onTile] @returns {Promise<number>} */
app.GridNodes.applyTilePicture = async function(kind, onTile){
	if(!QDCommon.isTilePicture(kind)) return 0;
	const tiles = [];
	const collect = gridNode => {
		for(const child of gridNode.children || []){
			if(app.GridNodes._takesPicture(child, kind)) tiles.push(child);
			collect(child);
		}
	};
	collect(app.node);
	for(const gridNode of tiles){
		await app.GridNodes._loadOnce(gridNode, () => app.GridNodes._takesPicture(gridNode, kind) ? app.GridNodes._makePicture(gridNode, kind) : null); // It may have changed meanwhile
		if(onTile) onTile();
	}
	return tiles.length;
};
/** "Use site icon": the tile's picture becomes the site's icon (a letter tile when the site has none), and Refresh
 * keeps it one. A kept picture (imageLocked) is left alone. @param {GridNode} gridNode @returns {Promise<object|null>} */
app.GridNodes.useSiteIcon = function(gridNode){
	return app.GridNodes._loadOnce(gridNode, () => {
		if(gridNode.type != QDCommon.NodeType.bookmark || gridNode.imageLocked == true) return null;
		gridNode.imageSource = QDCommon.ImageSource.siteIcon;
		return app.GridNodes._refreshFromSite(gridNode, true);
	});
};
// Whether Refresh makes the tile's picture some other way than with a screenshot: an icon, a letter tile, or the
// user's own picture (kept). A tile whose own picture is gone (its address changed) gets a screenshot again.
app.GridNodes._hasOwnPicture = function(gridNode){
	const ImageSource = QDCommon.ImageSource;
	return gridNode.imageSource == ImageSource.siteIcon || gridNode.imageSource == ImageSource.letter || (gridNode.imageSource == ImageSource.file && gridNode.image == '1');
};
// Refresh of a tile with its own picture: the title from the page, and the same kind of picture again. A site icon
// tile gets the site's best icon; when the site has none it keeps its picture, or gets a letter tile if it has no
// picture yet or the icon was just asked for (isNewIcon). A letter tile is drawn again; the user's own picture is kept.
// found: the site's icons when they were looked for already (SiteIcons.find).
app.GridNodes._refreshFromSite = async function(gridNode, isNewIcon, found){
	const ImageSource = QDCommon.ImageSource;
	if(!found) found = await app.SiteIcons.find(gridNode.url);
	let picture = null; // none: the picture stays as it is
	if(gridNode.imageLocked != true){
		if(found.title && gridNode.titleLocked != true) gridNode.title = found.title;
		if(gridNode.imageSource == ImageSource.siteIcon){
			if(found.icons.length) picture = found.icons[0].picture;
			else if(isNewIcon || gridNode.image != '1') picture = app.SiteIcons.letter(gridNode.url, gridNode.title);
		} else if(gridNode.imageSource == ImageSource.letter){
			picture = app.SiteIcons.letter(gridNode.url, gridNode.title);
		}
		if(picture) app.Images.setNodeImage(gridNode, picture);
	}
	app.GridNodes.save();
	app.Bookmarks.update(gridNode.id, { title: gridNode.title, url: gridNode.url });
	return { url: gridNode.url, title: gridNode.title, icon: null, screenshot: picture };
};
/** @param {GridNode} gridNode @returns {Promise<object|null>} */
app.GridNodes.capturePage = function(gridNode){
	const NodeType = QDCommon.NodeType;
	return app.GridNodes._loadOnce(gridNode, () => {
		switch(gridNode.type){
			case NodeType.folder: { // The folder's own dial page
				const nodes = app.GridNodes.getNodeWithParents(gridNode.id);
				if(!nodes) return null;
				const path = nodes.slice(1).map(n => '/' + n.title).join('');
				return app.SiteInfos.fromNewTab(QDCommon.DIAL_PAGE + '?path=' + encodeURIComponent(path)).then(infos => { // folder names may hold & # ? or %
					app.Images.setNodeImage(gridNode, infos ? infos.screenshot : null);
					app.GridNodes.save();
					return { title: gridNode.title };
				});
			}
			case NodeType.bookmark:
				return app.SiteInfos.fromNewTab(gridNode.url).then(infos => app.GridNodes._applySiteInfos(gridNode, infos));
		}
		return null;
	});
};
