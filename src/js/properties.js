var app = {};

var Image = null; // The picture being edited: a CSS "url(...)" value, a data URL, or null

document.addEventListener("DOMContentLoaded", function(event) {
	app.init();
});

app.init = function(){
	document.addEventListener('keydown', function(e){
		if(e.key == 'Escape') QDUI.closePopup();
		else if(e.key == 'Enter' && (e.target === Title || e.target === Url)){ e.preventDefault(); BtnOk.onclick(); }
	});
	app.changes = QDUI.changes(BtnApply, Status);
	app.Messages.getSettings(function(settings){
		app.settings = settings;
		QDUI.setAccent(settings.accentColor);
		app.sizePreview();
		app.Messages.getNodeByID(new URL(window.location).searchParams.get('id'), function(node){
			app.Messages.getImages([node.id], function(images){ // Images are stored separately: get this one
				if(node.image == '1') node.image = images[node.id] || null;
				app.initNode(node);
				app.changes.start();
			});
		});
	});
	app.initButtons();
};

// Preview box in the same proportions as the tiles on the dial
app.sizePreview = function(){
	var rx = +app.settings.grid.ratioX || 4, ry = +app.settings.grid.ratioY || 3;
	var w = 240, h = w * ry / rx;
	if(h > 190){ h = 190; w = h * rx / ry; }
	ImageZone.style.width = Math.round(w) + 'px';
	ImageZone.style.height = Math.round(h) + 'px';
	ImageZone.style.aspectRatio = 'auto';
};

app.cssUrl = function(img){ // node images are data URLs; folder defaults are already url(...)
	if(!img || img == '0') return null;
	return img.indexOf('url(') >= 0 ? img : 'url("' + img + '")';
};

app.showImage = function(){
	var isFolder = app.node.type == app.GridNodes.GridNodeType.folder;
	var css = app.cssUrl(Image);
	if(!css && isFolder) css = app.settings.grid.folderIcon;
	ImagePreview.style.backgroundImage = css || 'none';
	ImageEmpty.hidden = !!css;
	var mode = +ImageMode.value;
	if(mode == -1) mode = isFolder ? app.settings.grid.folderIconMode : 0; // what "Default" means on the dial
	QDUI.applyMode(ImagePreview, mode);
	ImageDefault.disabled = isFolder && !Image;
};

app.initNode = function(node){
	app.node = node;
	var isFolder = node.type == app.GridNodes.GridNodeType.folder;
	Title.value = node.title;
	ImageMode.value = (node.imageMode || node.imageMode == 0) ? node.imageMode : -1;
	IconBookmark.toggleAttribute('hidden', isFolder); // SVG elements have no .hidden property
	IconFolder.toggleAttribute('hidden', !isFolder);
	HeaderTitle.textContent = isFolder ? 'Folder properties' : 'Bookmark properties';
	if(isFolder){
		HeaderSubtitle.textContent = node.title || 'Folder';
		TitleLockBox.hidden = true;
		ImageLockRow.hidden = true;
		UrlRow.hidden = true;
	} else {
		var host = '';
		try { host = new URL(node.url).host; } catch(e) {}
		HeaderSubtitle.textContent = host || node.url || '';
		HeaderSubtitle.title = node.url || '';
		TitleLocked.checked = (node.titleLocked == true);
		ImageLocked.checked = (node.imageLocked == true);
		ImageDefault.hidden = true;
		Url.value = node.url;
	}
	Image = (node.image && node.image != '0') ? node.image : null;
	app.showImage();
	if(window.frameElement && window.frameElement.popup && window.frameElement.popup.fit) window.frameElement.popup.fit();
	setTimeout(function(){ Title.focus(); Title.select(); }, 0);
};

app.initButtons = function(){
	BtnOk.onclick = function(){
		if(BtnApply.onclick() === false) return;
		QDUI.closePopup();
	};
	BtnApply.onclick = function(){
		if(!app.node) return false;
		var isFolder = app.node.type == app.GridNodes.GridNodeType.folder;
		if(!isFolder && !Url.value.trim()){
			Url.classList.add('is-invalid');
			Url.focus();
			return false;
		}
		var image = Image; // Stored as a plain data URL: the dial adds url("...") itself
		if(image && /^url\(/.test(image)) image = image.replace(/^url\(\s*["']?/, '').replace(/["']?\s*\)$/, '');
		if(isFolder){
			app.Messages.updateNode(app.node.id, { title: Title.value, image: image, imageMode: +(ImageMode.value) });
		} else {
			app.Messages.updateNode(app.node.id, { title: Title.value, titleLocked: TitleLocked.checked, imageLocked: ImageLocked.checked, url: Url.value.trim(), image: image, imageMode: +(ImageMode.value) });
		}
		app.changes.saved();
	};
	BtnCancel.onclick = BtnClose.onclick = function(){ QDUI.closePopup(); };
	Url.addEventListener('input', function(){ Url.classList.remove('is-invalid'); });

	ImageMode.onchange = function(){ app.showImage(); };
	ImageReset.onclick = function(){ // Back to the picture the tile had when this window opened
		Image = (app.node.image && app.node.image != '0') ? app.node.image : null;
		app.showImage();
		app.changes.mark();
	};
	ImageDefault.onclick = function(){ // Folders only: use the folder picture from the settings
		Image = null;
		app.showImage();
		app.changes.mark();
	};
	ImageChoose.onkeydown = function(e){ if(e.key == 'Enter' || e.key == ' '){ e.preventDefault(); ImageFile.click(); } };
	ImageFile.onclick = function(){ this.value = null; };
	ImageFile.onchange = function(){
		var file = ImageFile.files[0];
		if(!file) return;
		var fileReader = new FileReader();
		fileReader.onload = function(e){
			app.toWebp(e.target.result, function(webp){ // Store uploads as compact WebP
				Image = webp;
				ImageFile.value = null;
				app.showImage();
				app.changes.mark();
			});
		};
		fileReader.readAsDataURL(file);
	};
	QDUI.imageDrop(ImageZone, ImageFile, { paste: true });
};

app.Messages = {};
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
	settingsChanged: 100,
	gridNodesLoaded: 101
};
app.Messages.getSettings = function(callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getSettings }).then(callback);
};
app.Messages.getNodeByID = function(id, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getNodeByID, id: id }).then(callback);
};
app.Messages.getImages = function(ids, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getImages, ids: ids }).then(callback, function(){ callback({}); });
};
app.Messages.updateNode = function(id, value, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.updateNode, id: id, value: value }).then(callback);
};

app.GridNodes = {};
app.GridNodes.GridNodeType = { // GridNodeType
	back: -1,
	empty: 0,
	folder: 1,
	bookmark: 2
}

app.toWebp = function(dataUrl, callback){ // Re-encode an image to WebP (longest side max 1200 px)
	var img = document.createElement('img'); // (the global "Image" is reused by this page)
	img.onload = function(){
		var w = img.naturalWidth || 300, h = img.naturalHeight || 150, max = 1200;
		if(Math.max(w, h) > max){ var r = max / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
		var canvas = document.createElement('canvas');
		canvas.width = w; canvas.height = h;
		canvas.getContext('2d').drawImage(img, 0, 0, w, h);
		var webp = canvas.toDataURL('image/webp', 0.85);
		callback(webp.startsWith('data:image/webp') && webp.length < dataUrl.length ? webp : dataUrl);
	};
	img.onerror = function(){ callback(dataUrl); };
	img.src = dataUrl;
};
