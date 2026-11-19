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

/** Brings the tree under gridNode in line with the bookmarks folder at rootPath, then saves it.
 * @param {GridNode} gridNode @param {string} rootPath @param {() => void} [callback] */
app.GridNodes.sync = function(gridNode, rootPath, callback){
	const NodeType = QDCommon.NodeType;
	if(app.GridNodes._syncing){ // One more sync once this one is done (the latest arguments win); every callback runs
		const queued = app.GridNodes._queued || { callbacks: [] };
		queued.gridNode = gridNode;
		queued.rootPath = rootPath;
		if(callback) queued.callbacks.push(callback);
		app.GridNodes._queued = queued;
		return;
	}
	app.GridNodes._syncing = true;
	app.Bookmarks.load(rootPath, bookmarkItem => {
		if(!bookmarkItem){ // Bookmarks unavailable: don't stay locked
			if(!app.GridNodes._runQueued(callback) && callback) callback();
			return;
		}
		const syncNode = (gridNode, bookmarkItem) => {
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
				case 'folder': {
					gridNode.type = NodeType.folder;
					const bookmarks = bookmarkItem.children || []; // A folder just created has no children list
					const emptyNodes = []; // Gaps, in order: new bookmarks fill them first
					if(!gridNode.children) gridNode.children = [];
					const children = gridNode.children;
					for(let i = children.length - 1; i >= 0; i--){
						if(!children[i]) children[i] = { type: NodeType.empty };
						if(children[i].type == NodeType.empty){
							emptyNodes.unshift(children[i]);
						} else if(!bookmarks.some(child => child.id == children[i].id)){ // Bookmark gone: its cell becomes a gap
							app.Images.removeTree(children[i]);
							if(i < children.length - 1){
								children[i] = { type: NodeType.empty };
								emptyNodes.unshift(children[i]);
							} else {
								children.pop();
							}
						}
					}
					for(const child of bookmarks){
						let childGridNode = app.GridNodes.getChildNode(gridNode, child.id);
						if(!childGridNode){
							childGridNode = emptyNodes.shift();
							if(!childGridNode){
								childGridNode = {};
								children.push(childGridNode);
							}
						}
						syncNode(childGridNode, child);
					}
					break;
				}
				default:
					gridNode.type = NodeType.empty;
					break;
			}
		};
		try {
			syncNode(gridNode, bookmarkItem);
		} catch(e) {
			console.error('Quick Dial NG: bookmark sync failed', e);
		}
		if(!app.GridNodes._runQueued(callback)){
			app.GridNodes.save();
			if(callback) callback();
		}
	});
};
// After a sync: runs the one asked for meanwhile, if any, with the latest tree and root path, then calls back
// the finished sync's caller and every caller that asked meanwhile. Returns false when nothing was queued.
app.GridNodes._runQueued = function(callback){
	delete app.GridNodes._syncing;
	const next = app.GridNodes._queued;
	if(!next) return false;
	delete app.GridNodes._queued;
	app.GridNodes.sync(next.gridNode, next.rootPath, () => {
		if(callback) callback();
		for(const cb of next.callbacks) cb();
	});
	return true;
};
app.GridNodes.save = function(callback){ // The tree is saved with the settings
	app.Settings.save(callback);
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

app.GridNodes.updateNode = function(gridNode, value, callback){ // Changes from the Properties page
	const NodeType = QDCommon.NodeType;
	if(value){
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
		const done = () => {
			app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
			app.GridNodes.save();
			app.Bookmarks.update(gridNode.id, urlChanged ? { title: gridNode.title, url: gridNode.url } : { title: gridNode.title });
		};
		if(urlChanged){ // New address: get its title and picture first
			gridNode.url = value.url;
			app.GridNodes.refreshNode(gridNode, done);
		} else {
			done();
		}
	}
	if(callback) callback(gridNode);
};
app.GridNodes.setNodeIndex = function(gridNode, index, newIndex, callback){ // Swap two cells (drag and drop). callback(gridNode, node1, node2)
	const children = gridNode.children;
	while(newIndex >= children.length) children.push({ type: QDCommon.NodeType.empty });
	const node1 = children[index];
	const node2 = children[newIndex];
	children[index] = node2;
	children[newIndex] = node1;
	app.GridNodes._trimEmpty(gridNode);
	app.GridNodes.save();
	if(callback) callback(gridNode, node1, node2);
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
app.GridNodes.createBookmark = function(gridNode, url, title, callback){ // New bookmark in a folder. callback(gridNode, newGridNode)
	const fullUrl = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : 'http://' + url; // "example.com" gets a scheme; "about:config" keeps its own
	app.Bookmarks.quietly('onCreated', () => browser.bookmarks.create({ parentId: gridNode.id, title: title || url, url: fullUrl })).then(bookmarkItem => {
		const newGridNode = { id: bookmarkItem.id, type: QDCommon.NodeType.bookmark, url: fullUrl, title };
		app.GridNodes._place(gridNode, newGridNode);
		if(callback) callback(gridNode, newGridNode);
	}, () => {});
};
app.GridNodes.createFolder = function(gridNode, name, callback){ // New folder in a folder. callback(gridNode, newGridNode)
	app.Bookmarks.quietly('onCreated', () => browser.bookmarks.create({ parentId: gridNode.id, title: name })).then(bookmarkItem => {
		const newGridNode = { id: bookmarkItem.id, type: QDCommon.NodeType.folder, title: name, children: [] };
		app.GridNodes._place(gridNode, newGridNode);
		if(callback) callback(gridNode, newGridNode);
	}, () => {});
};
app.GridNodes.deleteNode = function(gridNode, id, callback){ // Delete a tile and its bookmark (or folder). callback(gridNode, id)
	const i = gridNode.children.findIndex(child => child.id == id);
	if(i >= 0){
		app.Images.removeTree(gridNode.children[i]);
		gridNode.children[i] = { type: QDCommon.NodeType.empty };
		app.GridNodes.save();
	}
	app.GridNodes._trimEmpty(gridNode);
	app.Bookmarks.quietly('onRemoved', () => browser.bookmarks.removeTree(id)).catch(() => {});
	if(callback) callback(gridNode, id);
};

// Title and picture from a site: Refresh downloads the page, Capture page opens it in a tab.
// Both call back with the site infos (or nothing when it failed); a folder gets its picture cleared or captured.
app.GridNodes._applySiteInfos = function(gridNode, infos, callback){
	if(gridNode.imageLocked != true){
		if(infos){
			if(gridNode.titleLocked != true) gridNode.title = infos.title;
			app.Images.setNodeImage(gridNode, infos.screenshot);
		} else {
			app.Images.setNodeImage(gridNode, '0');
		}
	}
	delete gridNode.__isLoading;
	app.GridNodes.save();
	if(callback) callback(infos);
	app.Bookmarks.update(gridNode.id, { title: gridNode.title, url: gridNode.url });
};
app.GridNodes.refreshNode = function(gridNode, callback){
	const NodeType = QDCommon.NodeType;
	if(gridNode.__isLoading == true) return;
	gridNode.__isLoading = true;
	switch(gridNode.type){
		case NodeType.folder:
			app.Images.setNodeImage(gridNode, null);
			delete gridNode.__isLoading;
			app.GridNodes.save();
			if(callback) callback({ title: gridNode.title });
			break;
		case NodeType.bookmark:
			app.SiteInfos.fromFrame(gridNode.url, infos => app.GridNodes._applySiteInfos(gridNode, infos, callback));
			break;
	}
};
app.GridNodes.capturePage = function(gridNode, callback){
	const NodeType = QDCommon.NodeType;
	if(gridNode.__isLoading == true) return;
	gridNode.__isLoading = true;
	switch(gridNode.type){
		case NodeType.folder: { // The folder's own dial page
			const nodes = app.GridNodes.getNodeWithParents(gridNode.id);
			if(!nodes){
				delete gridNode.__isLoading;
				break;
			}
			const path = nodes.slice(1).map(n => '/' + n.title).join('');
			app.SiteInfos.fromNewTab('/dial.html?path=' + encodeURIComponent(path), infos => { // folder names may hold & # ? or %
				app.Images.setNodeImage(gridNode, infos ? infos.screenshot : null);
				delete gridNode.__isLoading;
				app.GridNodes.save();
				if(callback) callback({ title: gridNode.title });
			});
			break;
		}
		case NodeType.bookmark:
			app.SiteInfos.fromNewTab(gridNode.url, infos => app.GridNodes._applySiteInfos(gridNode, infos, callback));
			break;
	}
};
