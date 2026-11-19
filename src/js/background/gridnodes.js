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
app.GridNodes.GridNodeType = QDCommon.NodeType;

/** Brings the tree under gridNode in line with the bookmarks folder at rootPath, then saves it.
 * @param {GridNode} gridNode @param {string} rootPath @param {() => void} [callback] */
app.GridNodes.sync = function(gridNode, rootPath, callback){
	const T = app.GridNodes.GridNodeType;
	if(app.GridNodes._syncing){
		app.GridNodes._needSync = true;
		return;
	}
	app.GridNodes._syncing = true;
	app.Bookmarks.load(rootPath, bookmarkItem => {
		if(!bookmarkItem){ // Bookmarks unavailable: don't stay locked
			delete app.GridNodes._syncing;
			delete app.GridNodes._needSync;
			if(callback) callback();
			return;
		}
		const syncNode = (gridNode, bookmarkItem) => {
			gridNode.id = bookmarkItem.id;
			gridNode.title = bookmarkItem.title;
			switch(bookmarkItem.type){
				case 'bookmark':
					gridNode.type = T.bookmark;
					if(gridNode.url != bookmarkItem.url){
						gridNode.url = bookmarkItem.url;
						app.Images.setNodeImage(gridNode, null);
					}
					break;
				case 'folder': {
					gridNode.type = T.folder;
					const bookmarks = bookmarkItem.children || []; // A folder just created has no children list
					const emptyNodes = []; // Gaps, in order: new bookmarks fill them first
					if(!gridNode.children) gridNode.children = [];
					const children = gridNode.children;
					for(let i = children.length - 1; i >= 0; i--){
						if(!children[i]) children[i] = { type: T.empty };
						if(children[i].type == T.empty){
							emptyNodes.unshift(children[i]);
						} else if(!bookmarks.some(child => child.id == children[i].id)){ // Bookmark gone: its cell becomes a gap
							app.Images.removeTree(children[i]);
							if(i < children.length - 1){
								children[i] = { type: T.empty };
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
					gridNode.type = T.empty;
					break;
			}
		};
		try {
			syncNode(gridNode, bookmarkItem);
		} catch(e) {
			console.error('Quick Dial NG: bookmark sync failed', e);
		}
		delete app.GridNodes._syncing;
		if(app.GridNodes._needSync == true){
			delete app.GridNodes._needSync;
			app.GridNodes.sync(gridNode, rootPath, callback);
		} else {
			app.GridNodes.save();
			if(callback) callback();
		}
	});
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
	const T = app.GridNodes.GridNodeType;
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
		const urlChanged = gridNode.type == T.bookmark && value.url && gridNode.url != value.url;
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
	while(newIndex >= children.length) children.push({ type: app.GridNodes.GridNodeType.empty });
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
	while(children.length && children[children.length - 1].type == app.GridNodes.GridNodeType.empty) children.pop();
};
app.GridNodes._place = function(gridNode, newGridNode){ // Into the first gap, or at the end
	const T = app.GridNodes.GridNodeType;
	const gap = gridNode.children.findIndex(child => child.type == T.empty);
	if(gap >= 0) gridNode.children[gap] = newGridNode;
	else gridNode.children.push(newGridNode);
	app.GridNodes.save();
};
app.GridNodes.createBookmark = function(gridNode, url, title, callback){ // New bookmark in a folder. callback(gridNode, newGridNode)
	const fullUrl = url.includes('://') ? url : 'http://' + url;
	app.Bookmarks.quietly('onCreated', () => browser.bookmarks.create({ parentId: gridNode.id, title: title || url, url: fullUrl })).then(bookmarkItem => {
		const newGridNode = { id: bookmarkItem.id, type: app.GridNodes.GridNodeType.bookmark, url: fullUrl, title };
		app.GridNodes._place(gridNode, newGridNode);
		if(callback) callback(gridNode, newGridNode);
	}, () => {});
};
app.GridNodes.createFolder = function(gridNode, name, callback){ // New folder in a folder. callback(gridNode, newGridNode)
	app.Bookmarks.quietly('onCreated', () => browser.bookmarks.create({ parentId: gridNode.id, title: name })).then(bookmarkItem => {
		const newGridNode = { id: bookmarkItem.id, type: app.GridNodes.GridNodeType.folder, title: name, children: [] };
		app.GridNodes._place(gridNode, newGridNode);
		if(callback) callback(gridNode, newGridNode);
	}, () => {});
};
app.GridNodes.deleteNode = function(gridNode, id, callback){ // Delete a tile and its bookmark (or folder). callback(gridNode, id)
	const i = gridNode.children.findIndex(child => child.id == id);
	if(i >= 0){
		app.Images.removeTree(gridNode.children[i]);
		gridNode.children[i] = { type: app.GridNodes.GridNodeType.empty };
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
	const T = app.GridNodes.GridNodeType;
	if(gridNode.__isLoading == true) return;
	gridNode.__isLoading = true;
	switch(gridNode.type){
		case T.folder:
			app.Images.setNodeImage(gridNode, null);
			delete gridNode.__isLoading;
			app.GridNodes.save();
			if(callback) callback({ title: gridNode.title });
			break;
		case T.bookmark:
			app.SiteInfos.fromFrame(gridNode.url, infos => app.GridNodes._applySiteInfos(gridNode, infos, callback));
			break;
	}
};
app.GridNodes.capturePage = function(gridNode, callback){
	const T = app.GridNodes.GridNodeType;
	if(gridNode.__isLoading == true) return;
	gridNode.__isLoading = true;
	switch(gridNode.type){
		case T.folder: { // The folder's own dial page
			const nodes = app.GridNodes.getNodeWithParents(gridNode.id);
			if(!nodes){
				delete gridNode.__isLoading;
				break;
			}
			const path = nodes.slice(1).map(n => '/' + n.title).join('');
			app.SiteInfos.fromNewTab('/dial.html?path=' + path, infos => {
				app.Images.setNodeImage(gridNode, infos ? infos.screenshot : null);
				delete gridNode.__isLoading;
				app.GridNodes.save();
				if(callback) callback({ title: gridNode.title });
			});
			break;
		}
		case T.bookmark:
			app.SiteInfos.fromNewTab(gridNode.url, infos => app.GridNodes._applySiteInfos(gridNode, infos, callback));
			break;
	}
};
