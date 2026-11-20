// Quick Dial NG — background page: the Quick Dial bookmarks folder and its events.
// Changes made outside the Quick Dial tree are ignored; changes inside it re-sync the tiles.
app.Bookmarks = {};

app.Bookmarks._isTracked = function(...ids){ // True if any of the given bookmark ids belongs to the Quick Dial tree (or the tree is not loaded yet)
	if(!app.node || !app.node.id) return true;
	return ids.some(id => id && app.GridNodes.getNodeById(id));
};
app.Bookmarks._resync = function(){
	app.GridNodes.sync(app.node, app.settings.grid.root).then(() => app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded));
};
app.Bookmarks._onCreated = function(id, bookmark){ if(app.Bookmarks._isTracked(bookmark && bookmark.parentId)) app.Bookmarks._resync(); };
app.Bookmarks._onChanged = function(id){ if(app.Bookmarks._isTracked(id)) app.Bookmarks._resync(); };
app.Bookmarks._onMoved = function(id, moveInfo){ if(app.Bookmarks._isTracked(id, moveInfo && moveInfo.parentId, moveInfo && moveInfo.oldParentId)) app.Bookmarks._resync(); };
app.Bookmarks._onRemoved = function(id, removeInfo){ if(app.Bookmarks._isTracked(id, removeInfo && removeInfo.parentId)) app.Bookmarks._resync(); };
app.Bookmarks._listeners = { // browser.bookmarks event -> listener
	onCreated: app.Bookmarks._onCreated,
	onChanged: app.Bookmarks._onChanged,
	onMoved: app.Bookmarks._onMoved,
	onRemoved: app.Bookmarks._onRemoved
};

app.Bookmarks.initListener = function(){ // (Called from app.init) Listen to bookmark events
	for(const [event, listener] of Object.entries(app.Bookmarks._listeners)) browser.bookmarks[event].addListener(listener);
};
app.Bookmarks.removeListener = function(){ // Stop listening, e.g. while an import rebuilds the tree
	for(const [event, listener] of Object.entries(app.Bookmarks._listeners)) browser.bookmarks[event].removeListener(listener);
};
// Runs a bookmark change of our own without reacting to its event, e.g. quietly('onChanged', () => browser.bookmarks.update(...)).
// The listener comes back once the change is done, or has failed. Returns the change's promise.
app.Bookmarks.quietly = function(event, change){
	const listener = app.Bookmarks._listeners[event];
	browser.bookmarks[event].removeListener(listener);
	const restore = () => browser.bookmarks[event].addListener(listener);
	let result;
	try { result = change(); } catch(e){ restore(); throw e; }
	return result.then(value => { restore(); return value; }, e => { restore(); throw e; });
};
app.Bookmarks.update = function(id, changes){ // Rename or re-address a bookmark (the tile already shows the change)
	return app.Bookmarks.quietly('onChanged', () => browser.bookmarks.update(id, changes)).catch(() => {});
};

/** The root folder of the dial (a path like "Quick Dial" or "/toolbar/Dial"), with the folders missing on the way created.
 * Resolves with its bookmark item (with its children, unless just created), or with null when the bookmarks can't be read or written; never rejects.
 * @param {string} rootPath @returns {Promise<browser.bookmarks.BookmarkTreeNode|null>} */
app.Bookmarks.load = async function(rootPath){
	const absolute = rootPath.startsWith('/');
	let path = absolute ? rootPath.slice(1) : rootPath;
	try {
		let item = (await browser.bookmarks.getSubTree(absolute ? 'root________' : 'menu________'))[0];
		while(path.length){
			const child = (item.children || []).find(child => (path + '/').startsWith(child.title + '/')); // A folder just created has no children list
			item = child || await browser.bookmarks.create({ parentId: item.id, title: path.slice(0, (path + '/').indexOf('/')) });
			path = path.slice(item.title.length + 1);
		}
		return item;
	} catch(e){
		return null;
	}
};
