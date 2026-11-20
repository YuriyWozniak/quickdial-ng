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
	QDClient.getSettings().then(settings => {
		app.settings = settings;
		QDUI.setAccent(settings.accentColor);
		app.sizePreview();
		return QDClient.getNodeById(new URL(window.location).searchParams.get('id'));
	}).then(node => {
		if(!node){ app.showDeleted(); return; }
		return QDClient.getImages([node.id]).then(images => { // Images are stored separately: get this one
			if(node.image == '1') node.image = images[node.id] || null;
			app.initNode(node);
			app.changes.start();
		});
	});
	QDClient.listen({
		[QDCommon.Commands.gridNodesLoaded]: () => { // The tiles changed: is this one still there?
			if(!app.node || app.deleted) return;
			QDClient.getNodeById(app.node.id).then(node => { if(!node) app.showDeleted(); });
		}
	});
	app.initButtons();
};

// The tile was deleted (in another tab, or its bookmark in the Library) before or while this window was open:
// nothing left to edit or save, only Close.
app.showDeleted = function(){
	app.deleted = true;
	HeaderSubtitle.textContent = 'This tile no longer exists';
	HeaderSubtitle.title = '';
	document.querySelector('main').hidden = true;
	BtnApply.hidden = BtnOk.hidden = true;
	BtnCancel.textContent = 'Close';
	BtnCancel.focus(); // First: leaving an edited field fires its change event, which marks the form as changed
	Status.classList.remove('is-dirty', 'is-saved');
	Status.textContent = 'The tile was deleted';
	QDUI.fitPopup();
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

app.showImage = function(){
	const isFolder = app.node.type == QDCommon.NodeType.folder;
	let css = QDCommon.toCssUrl(picture); // node images are data URLs; folder defaults are already url(...)
	if(!css && isFolder) css = app.settings.grid.folderIcon;
	ImagePreview.style.backgroundImage = css || 'none';
	ImageEmpty.hidden = !!css;
	let mode = +ImageMode.value;
	if(mode == -1) mode = isFolder ? app.settings.grid.folderIconMode : 0; // what "Default" means on the dial
	QDCommon.applyImageMode(mode, ImagePreview.style);
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
	QDUI.fitPopup();
	setTimeout(() => { Title.focus(); Title.select(); }, 0);
};

app.save = function(onSaved){ // Apply and OK; onSaved() runs once the tile has the change
	if(!app.node || app.deleted) return;
	const isFolder = app.node.type == QDCommon.NodeType.folder;
	if(!isFolder && !Url.value.trim()){
		Url.classList.add('is-invalid');
		Url.focus();
		return;
	}
	const image = QDCommon.fromCssUrl(picture); // Stored as a plain data URL: the dial adds url("...") itself
	const value = isFolder
		? { title: Title.value, image: image, imageMode: +(ImageMode.value) }
		: { title: Title.value, titleLocked: TitleLocked.checked, imageLocked: ImageLocked.checked, url: Url.value.trim(), image: image, imageMode: +(ImageMode.value) };
	QDClient.updateNode(app.node.id, value).then(found => {
		if(found === false){ app.showDeleted(); return; }
		app.changes.markSaved();
		if(onSaved) onSaved();
	});
};

app.initButtons = function(){
	BtnOk.onclick = function(){ app.save(QDUI.closePopup); };
	BtnApply.onclick = function(){ app.save(); };
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
	QDUI.imagePicker(ImageFile, ImageChoose, dataUrl => {
		QDCommon.toWebp(dataUrl, QDCommon.IMAGE_MAX_SIZE).then(webp => { // Store uploads as compact WebP
			picture = webp;
			app.showImage();
			app.changes.mark();
		});
	});
	QDUI.imageDrop(ImageZone, ImageFile, { paste: true });
};
