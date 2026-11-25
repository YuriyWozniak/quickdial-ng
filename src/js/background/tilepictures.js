// Quick Dial NG — background page: how a tile gets its title and picture from its site. Refresh downloads the page
// (or, for a tile with an icon or the user's own picture, makes that kind of picture again), Capture page opens it in a
// tab, Use site icon takes the site's own icon; new tiles get the kind chosen in Settings › Tiles › New tiles get, and
// Apply to tiles gives that kind to the tiles there are. The tree itself (finding, editing, saving): gridnodes.js.
app.TilePictures = {};

// Refresh, Capture page and Use site icon resolve with the site infos, or null when it failed; a folder gets its
// picture cleared or captured, and resolves with its title. One at a time per tile: asked again while one is under
// way, they answer with that one.
app.TilePictures._loading = new WeakMap(); // tile -> promise of its Refresh or Capture page under way
app.TilePictures._loadOnce = function(gridNode, load){
	const running = app.TilePictures._loading.get(gridNode);
	if(running) return running;
	gridNode.__isLoading = true; // Not saved ("__"); tells the tile is loading to whoever reads it meanwhile
	const finish = infos => {
		delete gridNode.__isLoading;
		app.TilePictures._loading.delete(gridNode);
		// Deleted meanwhile (or its folder, or the whole tree by an import or another root): the picture just made
		// would stay in storage with nothing pointing at it
		if(gridNode.id && !app.GridNodes.getNodeById(gridNode.id)) app.Images.removeTree(gridNode);
		return infos;
	};
	const promise = Promise.resolve().then(load).then(finish, e => {
		console.error('Quick Dial NG: loading the tile failed', e);
		return finish(null);
	});
	app.TilePictures._loading.set(gridNode, promise);
	return promise;
};
// The tile and its bookmark after its title or picture changed
app.TilePictures._saved = function(gridNode){
	app.GridNodes.save();
	app.Bookmarks.update(gridNode.id, { title: gridNode.title, url: gridNode.url });
};
app.TilePictures._applySiteInfos = function(gridNode, infos){ // A screenshot from Refresh or Capture page, or null when it failed
	if(gridNode.imageLocked != true){
		if(infos){
			if(gridNode.titleLocked != true) gridNode.title = infos.title;
			app.Images.setNodeImage(gridNode, infos.screenshot);
			delete gridNode.imageSource; // A screenshot of the page now
		} else if(gridNode.imageSource == null || gridNode.image != '1'){ // A failed capture leaves an icon or the user's own picture as it was
			app.Images.setNodeImage(gridNode, '0');
		}
	}
	app.TilePictures._saved(gridNode);
	return infos;
};
/** Refresh. @param {GridNode} gridNode @returns {Promise<object|null>} */
app.TilePictures.refresh = function(gridNode){
	const NodeType = QDCommon.NodeType, TilePictures = app.TilePictures;
	return TilePictures._loadOnce(gridNode, () => {
		switch(gridNode.type){
			case NodeType.folder: // The dial shows the folder icon again
				app.Images.setNodeImage(gridNode, null);
				delete gridNode.imageSource;
				app.GridNodes.save();
				return { title: gridNode.title };
			case NodeType.bookmark:
				if(TilePictures._hasOwnPicture(gridNode)) return TilePictures._refreshFromSite(gridNode, false);
				if(!gridNode.image && gridNode.imageLocked != true) return TilePictures._make(gridNode, TilePictures.newTileKind()); // A new tile, or one whose picture went with its old address
				return TilePictures._screenshot(gridNode);
		}
		return null;
	});
};
app.TilePictures._screenshot = function(gridNode){ // Title and picture from the page downloaded in a frame
	return app.SiteInfos.fromFrame(gridNode.url).then(infos => app.TilePictures._applySiteInfos(gridNode, infos));
};
/** The picture new tiles get (Settings › Tiles › New tiles get): one of QDCommon.TilePicture. @returns {number} */
app.TilePictures.newTileKind = function(){
	const kind = app.settings && app.settings.grid && app.settings.grid.newTilePicture;
	return QDCommon.isTilePicture(kind) ? kind : QDCommon.TilePicture.page;
};
// A bookmark tile's picture of the kind `kind` (QDCommon.TilePicture), with the title from the site: a screenshot, the
// site's icon (a letter tile when it has none), or the icon with a screenshot when it has none. A tile that shows a
// screenshot already keeps it then (resolves with null). Not for a kept picture (imageLocked): the caller checks.
app.TilePictures._make = async function(gridNode, kind){
	const TilePicture = QDCommon.TilePicture, ImageSource = QDCommon.ImageSource;
	if(kind == TilePicture.siteIcon || kind == TilePicture.siteIconOrPage){
		const found = await app.SiteIcons.find(gridNode.url);
		if(found.icons.length || kind == TilePicture.siteIcon){
			gridNode.imageSource = ImageSource.siteIcon;
			return app.TilePictures._refreshFromSite(gridNode, true, found);
		}
		if(gridNode.imageSource == null && gridNode.image == '1') return null;
	}
	delete gridNode.imageSource;
	return app.TilePictures._screenshot(gridNode);
};
// Whether "Apply to tiles" gives a tile a new picture of the kind `kind`: not a folder, a kept picture (imageLocked) or the
// user's own picture, nor a tile that has that kind already (a screenshot, or an icon or a letter tile for the icon kinds).
app.TilePictures._takes = function(gridNode, kind){
	const ImageSource = QDCommon.ImageSource, source = gridNode.imageSource;
	if(gridNode.type != QDCommon.NodeType.bookmark || gridNode.imageLocked == true) return false;
	if(app.TilePictures._hasUserPicture(gridNode)) return false;
	const isIcon = source == ImageSource.siteIcon || source == ImageSource.letter;
	if(kind == QDCommon.TilePicture.page) return isIcon || gridNode.image != '1';
	return !isIcon;
};
/** Settings › Tiles › Apply to tiles: every tile in every folder that takes a picture of the kind `kind` (see _takes)
 * gets one, a tile at a time; onTile() is called after each. Resolves with the number of those tiles.
 * @param {number} kind one of QDCommon.TilePicture @param {() => void} [onTile] @returns {Promise<number>} */
app.TilePictures.applyToTiles = async function(kind, onTile){
	const TilePictures = app.TilePictures;
	if(!QDCommon.isTilePicture(kind)) return 0;
	const tiles = [];
	const collect = gridNode => {
		for(const child of gridNode.children || []){
			if(TilePictures._takes(child, kind)) tiles.push(child);
			collect(child);
		}
	};
	collect(app.node);
	for(const gridNode of tiles){
		await TilePictures._loadOnce(gridNode, () => TilePictures._takes(gridNode, kind) ? TilePictures._make(gridNode, kind) : null); // It may have changed meanwhile
		if(onTile) onTile();
	}
	return tiles.length;
};
/** "Use site icon": the tile's picture becomes the site's icon (a letter tile when the site has none), and Refresh
 * keeps it one. A kept picture (imageLocked) is left alone. @param {GridNode} gridNode @returns {Promise<object|null>} */
app.TilePictures.useSiteIcon = function(gridNode){
	return app.TilePictures._loadOnce(gridNode, () => {
		if(gridNode.type != QDCommon.NodeType.bookmark || gridNode.imageLocked == true) return null;
		gridNode.imageSource = QDCommon.ImageSource.siteIcon;
		return app.TilePictures._refreshFromSite(gridNode, true);
	});
};
// Whether Refresh makes the tile's picture some other way than with a screenshot: an icon, a letter tile, or the
// user's own picture (kept). A tile whose own picture is gone (its address changed) gets a screenshot again.
app.TilePictures._hasOwnPicture = function(gridNode){
	const ImageSource = QDCommon.ImageSource;
	return gridNode.imageSource == ImageSource.siteIcon || gridNode.imageSource == ImageSource.letter || app.TilePictures._hasUserPicture(gridNode);
};
// Whether the tile shows a picture the user chose: a file, or an icon from the icon picker. Nothing replaces it but the user.
app.TilePictures._hasUserPicture = function(gridNode){
	const ImageSource = QDCommon.ImageSource;
	return (gridNode.imageSource == ImageSource.file || gridNode.imageSource == ImageSource.icon) && gridNode.image == '1';
};
// Refresh of a tile with its own picture: the title from the page, and the same kind of picture again. A site icon
// tile gets the site's best icon; when the site has none it keeps its picture, or gets a letter tile if it has no
// picture yet or the icon was just asked for (isNewIcon). A letter tile is drawn again; the user's own picture is kept.
// found: the site's icons when they were looked for already (SiteIcons.find).
app.TilePictures._refreshFromSite = async function(gridNode, isNewIcon, found){
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
	app.TilePictures._saved(gridNode);
	return { url: gridNode.url, title: gridNode.title, icon: null, screenshot: picture };
};
/** Capture page. @param {GridNode} gridNode @returns {Promise<object|null>} */
app.TilePictures.capturePage = function(gridNode){
	const NodeType = QDCommon.NodeType;
	return app.TilePictures._loadOnce(gridNode, () => {
		switch(gridNode.type){
			case NodeType.folder: { // The folder's own dial page
				const nodes = app.GridNodes.getNodeWithParents(gridNode.id);
				if(!nodes) return null;
				const path = nodes.slice(1).map(n => '/' + n.title).join('');
				return app.SiteInfos.fromNewTab(QDCommon.DIAL_PAGE + '?path=' + encodeURIComponent(path)).then(infos => { // folder names may hold & # ? or %
					app.Images.setNodeImage(gridNode, infos ? infos.screenshot : null);
					delete gridNode.imageSource; // Its own page now, or the folder picture
					app.GridNodes.save();
					return { title: gridNode.title };
				});
			}
			case NodeType.bookmark:
				return app.SiteInfos.fromNewTab(gridNode.url).then(infos => app.TilePictures._applySiteInfos(gridNode, infos));
		}
		return null;
	});
};
