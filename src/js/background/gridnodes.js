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
				app.Images.setNodeImage(gridNode, null);
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
 * @property {number} [imageMode] -1: back to the default
 * @property {boolean} [titleLocked]
 * @property {boolean} [imageLocked]
 */
/** Changes from the Properties page. A new address gets its title and picture first (see refreshNode).
 * Resolves once the bookmark is updated too. @param {GridNode} gridNode @param {NodeChanges} value @returns {Promise<void>} */
app.GridNodes.updateNode = async function(gridNode, value){
	const NodeType = QDCommon.NodeType;
	if(!value) return;
	if(value.title) gridNode.title = value.title;
	if(value.titleLocked != null) gridNode.titleLocked = value.titleLocked;
	if(value.imageLocked != null){
		gridNode.imageLocked = value.imageLocked;
		app.Images.setNodeImage(gridNode, value.image);
	} else if(gridNode.imageLocked != true){
		app.Images.setNodeImage(gridNode, value.image);
	}
	if(value.imageMode || value.imageMode == 0){
		if(value.imageMode == -1) delete gridNode.imageMode;
		else gridNode.imageMode = value.imageMode;
	}
	const urlChanged = gridNode.type == NodeType.bookmark && value.url && gridNode.url != value.url;
	if(urlChanged) gridNode.url = value.url;
	app.GridNodes.save();
	if(urlChanged) await app.GridNodes.refreshNode(gridNode);
	await app.Bookmarks.update(gridNode.id, urlChanged ? { title: gridNode.title, url: gridNode.url } : { title: gridNode.title });
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
app.GridNodes._applySiteInfos = function(gridNode, infos){
	if(gridNode.imageLocked != true){
		if(infos){
			if(gridNode.titleLocked != true) gridNode.title = infos.title;
			app.Images.setNodeImage(gridNode, infos.screenshot);
		} else {
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
				return app.SiteInfos.fromFrame(gridNode.url).then(infos => app.GridNodes._applySiteInfos(gridNode, infos));
		}
		return null;
	});
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
				return app.SiteInfos.fromNewTab('/dial.html?path=' + encodeURIComponent(path)).then(infos => { // folder names may hold & # ? or %
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
