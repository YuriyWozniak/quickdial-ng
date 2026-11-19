// The Properties popup of a tile (in a frame on the dial). Form elements are reached by their id (window.Title...).
/* exported app */
// eslint-disable-next-line no-var -- a window property, like on the other pages
var app = {};

let picture = null; // The picture being edited: a CSS "url(...)" value, a data URL, or null

document.addEventListener('DOMContentLoaded', event => {
	app.init();
});

app.init = function(){
	document.addEventListener('keydown', e => {
		if(e.key == 'Escape') QDUI.closePopup();
		else if(e.key == 'Enter' && (e.target === Title || e.target === Url)){ e.preventDefault(); BtnOk.onclick(); }
	});
	app.changes = QDUI.trackChanges(BtnApply, Status);
	app.Messages.getSettings(settings => {
		app.settings = settings;
		QDUI.setAccent(settings.accentColor);
		app.sizePreview();
		app.Messages.getNodeById(new URL(window.location).searchParams.get('id'), node => {
			app.Messages.getImages([node.id], images => { // Images are stored separately: get this one
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
	const rx = +app.settings.grid.ratioX || 4, ry = +app.settings.grid.ratioY || 3;
	let w = 240, h = w * ry / rx;
	if(h > 190){ h = 190; w = h * rx / ry; }
	ImageZone.style.width = Math.round(w) + 'px';
	ImageZone.style.height = Math.round(h) + 'px';
	ImageZone.style.aspectRatio = 'auto';
};

app.toCssUrl = function(img){ // node images are data URLs; folder defaults are already url(...)
	if(!img || img == '0') return null;
	return img.indexOf('url(') >= 0 ? img : 'url("' + img + '")';
};

app.showImage = function(){
	const isFolder = app.node.type == QDCommon.NodeType.folder;
	let css = app.toCssUrl(picture);
	if(!css && isFolder) css = app.settings.grid.folderIcon;
	ImagePreview.style.backgroundImage = css || 'none';
	ImageEmpty.hidden = !!css;
	let mode = +ImageMode.value;
	if(mode == -1) mode = isFolder ? app.settings.grid.folderIconMode : 0; // what "Default" means on the dial
	QDUI.applyImageMode(mode, ImagePreview.style);
	ImageDefault.disabled = isFolder && !picture;
};

app.initNode = function(node){
	app.node = node;
	const isFolder = node.type == QDCommon.NodeType.folder;
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
		let host = '';
		try { host = new URL(node.url).host; } catch(e) {}
		HeaderSubtitle.textContent = host || node.url || '';
		HeaderSubtitle.title = node.url || '';
		TitleLocked.checked = (node.titleLocked == true);
		ImageLocked.checked = (node.imageLocked == true);
		ImageDefault.hidden = true;
		Url.value = node.url;
	}
	picture = (node.image && node.image != '0') ? node.image : null;
	app.showImage();
	if(window.frameElement && window.frameElement.popup && window.frameElement.popup.fit) window.frameElement.popup.fit();
	setTimeout(() => { Title.focus(); Title.select(); }, 0);
};

app.initButtons = function(){
	BtnOk.onclick = function(){
		if(BtnApply.onclick() === false) return;
		QDUI.closePopup();
	};
	BtnApply.onclick = function(){
		if(!app.node) return false;
		const isFolder = app.node.type == QDCommon.NodeType.folder;
		if(!isFolder && !Url.value.trim()){
			Url.classList.add('is-invalid');
			Url.focus();
			return false;
		}
		let image = picture; // Stored as a plain data URL: the dial adds url("...") itself
		if(image && /^url\(/.test(image)) image = image.replace(/^url\(\s*["']?/, '').replace(/["']?\s*\)$/, '');
		if(isFolder){
			app.Messages.updateNode(app.node.id, { title: Title.value, image: image, imageMode: +(ImageMode.value) });
		} else {
			app.Messages.updateNode(app.node.id, { title: Title.value, titleLocked: TitleLocked.checked, imageLocked: ImageLocked.checked, url: Url.value.trim(), image: image, imageMode: +(ImageMode.value) });
		}
		app.changes.markSaved();
	};
	BtnCancel.onclick = BtnClose.onclick = function(){ QDUI.closePopup(); };
	Url.addEventListener('input', () => { Url.classList.remove('is-invalid'); });

	ImageMode.onchange = function(){ app.showImage(); };
	ImageReset.onclick = function(){ // Back to the picture the tile had when this window opened
		picture = (app.node.image && app.node.image != '0') ? app.node.image : null;
		app.showImage();
		app.changes.mark();
	};
	ImageDefault.onclick = function(){ // Folders only: use the folder picture from the settings
		picture = null;
		app.showImage();
		app.changes.mark();
	};
	ImageChoose.onkeydown = function(e){ if(e.key == 'Enter' || e.key == ' '){ e.preventDefault(); ImageFile.click(); } };
	ImageFile.onclick = function(){ this.value = null; };
	ImageFile.onchange = function(){
		const file = ImageFile.files[0];
		if(!file) return;
		const fileReader = new FileReader();
		fileReader.onload = function(e){
			app.toWebp(e.target.result, webp => { // Store uploads as compact WebP
				picture = webp;
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
app.Messages.Commands = QDCommon.Commands;
app.Messages.getSettings = function(callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getSettings }).then(callback);
};
app.Messages.getNodeById = function(id, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getNodeById, id: id }).then(callback);
};
app.Messages.getImages = function(ids, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getImages, ids: ids }).then(callback, () => { callback({}); });
};
app.Messages.updateNode = function(id, value, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.updateNode, id: id, value: value }).then(callback);
};

app.toWebp = function(dataUrl, callback){ // Re-encode an image to WebP (longest side max 1200 px)
	const img = new Image();
	img.onload = function(){
		const max = 1200;
		let w = img.naturalWidth || 300, h = img.naturalHeight || 150;
		if(Math.max(w, h) > max){ const r = max / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
		const canvas = document.createElement('canvas');
		canvas.width = w; canvas.height = h;
		canvas.getContext('2d').drawImage(img, 0, 0, w, h);
		const webp = canvas.toDataURL('image/webp', 0.85);
		callback(webp.startsWith('data:image/webp') && webp.length < dataUrl.length ? webp : dataUrl);
	};
	img.onerror = function(){ callback(dataUrl); };
	img.src = dataUrl;
};
