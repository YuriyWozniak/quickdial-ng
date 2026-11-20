// Quick Dial NG — background page: tile pictures. One storage key per node ("img_<bookmarkId>"),
// WebP encoded and loaded on demand. In the node tree, node.image is '1' (stored), '0' (no picture
// could be made) or absent.
app.Images = {};
app.Images._cache = new Map();
app.Images.quality = QDCommon.WEBP_QUALITY; // Screenshots (SiteInfos) too
app.Images.maxSize = QDCommon.IMAGE_MAX_SIZE; // Longest side in pixels for imported/uploaded images
app.Images.storageKey = id => 'img_' + id;

app.Images.unwrap = QDCommon.fromCssUrl; // 'url("data:...")' -> 'data:...'
app.Images.get = function(ids){ // Promise<{ id: dataUrl }>
	const result = {};
	const missing = [];
	for(const id of ids || []){
		if(app.Images._cache.has(id)) result[id] = app.Images._cache.get(id);
		else missing.push(id);
	}
	if(missing.length == 0) return Promise.resolve(result);
	return browser.storage.local.get(missing.map(app.Images.storageKey)).then(data => {
		for(const id of missing){
			const image = data[app.Images.storageKey(id)];
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
	return browser.storage.local.set({ [app.Images.storageKey(id)]: image });
};
app.Images.remove = function(ids){
	if(ids.length == 0) return Promise.resolve();
	for(const id of ids) app.Images._cache.delete(id);
	return browser.storage.local.remove(ids.map(app.Images.storageKey));
};
app.Images.idsInTree = function(gridNode){ // Ids of a node and its descendants that have a stored picture
	const ids = [];
	(function collect(node){
		if(!node) return;
		if(node.id && node.image == '1') ids.push(node.id);
		if(node.children) for(const child of node.children) collect(child);
	})(gridNode);
	return ids;
};
app.Images.removeTree = function(gridNode){ // Remove stored images of a node and all its descendants
	return app.Images.remove(app.Images.idsInTree(gridNode));
};
app.Images.setNodeImage = function(gridNode, image){ // Set (or clear) the image of a node. image: data URL, url(...), '0' (failed) or falsy (none)
	image = app.Images.unwrap(image);
	if(!image || image == '0' || image == '1'){
		if(image == '1') return Promise.resolve(); // Unchanged, already stored
		const hadImage = (gridNode.image == '1');
		if(image == '0') gridNode.image = '0';
		else delete gridNode.image;
		return hadImage ? app.Images.remove([gridNode.id]) : Promise.resolve();
	}
	gridNode.image = '1';
	if(app.Images._cache.get(gridNode.id) == image) return Promise.resolve();
	return app.Images.set(gridNode.id, image);
};
app.Images.toWebp = QDCommon.toWebp; // (dataUrl, maxSize): see js/common.js
app.Images.extractFromTree = function(gridNode, images){ // Move inline images (old format) or images from a backup into the store
	const jobs = [];
	(function walk(node){
		if(!node) return;
		if(node.id){
			let image = images ? images[node.id] : null;
			if(!image && node.image && node.image != '0' && node.image != '1') image = node.image;
			if(image){
				image = app.Images.unwrap(image);
				jobs.push(app.Images.toWebp(image, app.Images.maxSize).then(webp => app.Images.setNodeImage(node, webp)));
			} else if(node.image == '1'){
				delete node.image; // Image missing from the backup: will be refreshed
			}
		}
		if(node.children) for(const child of node.children) walk(child);
	})(gridNode);
	return Promise.all(jobs);
};
