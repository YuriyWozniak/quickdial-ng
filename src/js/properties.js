// The Properties popup of a tile (in a frame on the dial). Form elements are reached by their id (window.Title...).
/* exported app */
// eslint-disable-next-line no-var -- a window property, like on the other pages
var app = {};

let picture = null; // The picture being edited: a CSS "url(...)" value, a data URL, or null
let source = QDCommon.ImageSource.page; // Where it comes from (QDCommon.ImageSource): saved with it
let capturesPage = false; // Page chosen for a tile whose picture isn't a screenshot: the page is captured once saved
let iconSearch = null; // { url, found }: the last search for the site's icons, kept so choosing Site icon again doesn't download them again

document.addEventListener('DOMContentLoaded', event => {
	QDUI.localize();
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
	HeaderSubtitle.textContent = QDCommon.text('propertiesTileGone');
	HeaderSubtitle.title = '';
	document.querySelector('main').hidden = true;
	BtnApply.hidden = BtnOk.hidden = true;
	BtnCancel.textContent = QDCommon.text('buttonClose');
	BtnCancel.focus(); // First: leaving an edited field fires its change event, which marks the form as changed
	Status.classList.remove('is-dirty', 'is-saved');
	Status.textContent = QDCommon.text('propertiesTileDeleted');
	QDUI.fitPopup();
};

// Preview box in the same proportions as the tiles on the dial, at most PREVIEW_MAX_WIDTH x PREVIEW_MAX_HEIGHT pixels
app.PREVIEW_MAX_WIDTH = 240;
app.PREVIEW_MAX_HEIGHT = 190;
app.sizePreview = function(){
	const ratio = QDCommon.tileRatio(app.settings.grid);
	let width = app.PREVIEW_MAX_WIDTH, height = width * ratio;
	if(height > app.PREVIEW_MAX_HEIGHT){ height = app.PREVIEW_MAX_HEIGHT; width = height / ratio; }
	ImageZone.style.width = Math.round(width) + 'px';
	ImageZone.style.height = Math.round(height) + 'px';
	ImageZone.style.aspectRatio = 'auto';
};

app.showImage = function(){
	const isFolder = app.node.type == QDCommon.NodeType.folder;
	let css = QDCommon.toCssUrl(picture); // node images are data URLs; folder defaults are already url(...)
	if(!css && isFolder) css = app.settings.grid.folderIcon;
	ImagePreview.style.backgroundImage = css || 'none';
	ImageEmpty.hidden = !!css;
	let mode = +ImageMode.value;
	if(mode == QDCommon.ImageMode.inherit) mode = isFolder ? app.settings.grid.folderIconMode : QDCommon.ImageMode.stretch; // what "Default" means on the dial
	QDCommon.applyImageMode(mode, ImagePreview.style);
	ImageDefault.disabled = isFolder && !picture;
};

app.initNode = function(node){
	app.node = node;
	const isFolder = node.type == QDCommon.NodeType.folder;
	Title.value = node.title;
	ImageMode.value = (node.imageMode || node.imageMode == 0) ? node.imageMode : QDCommon.ImageMode.inherit;
	IconBookmark.toggleAttribute('hidden', isFolder); // SVG elements have no .hidden property
	IconFolder.toggleAttribute('hidden', !isFolder);
	HeaderTitle.textContent = QDCommon.text(isFolder ? 'propertiesFolder' : 'propertiesBookmark');
	SourceRow.hidden = isFolder; // A folder's picture is a file or the default folder picture
	ImageChooseRow.hidden = !isFolder; // A tile has File among its sources instead
	if(isFolder){
		HeaderSubtitle.textContent = node.title || QDCommon.text('propertiesFolderUntitled');
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
	picture = app.originalPicture();
	source = app.originalSource();
	app.showImage();
	app.showSource();
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
		: { title: Title.value, titleLocked: TitleLocked.checked, imageLocked: ImageLocked.checked, url: Url.value.trim(), image: image, imageMode: +(ImageMode.value),
			imageSource: source, capturePage: capturesPage };
	QDClient.updateNode(app.node.id, value).then(found => {
		if(found === false){ app.showDeleted(); return; }
		app.changes.markSaved();
		if(capturesPage){ // Asked once: the screenshot replaces the picture in the background
			capturesPage = false;
			SourceHint.textContent = '';
		}
		if(onSaved) onSaved();
	});
};

// ---------- where the picture comes from: Page, Site icon (one of the site's icons, or a letter tile) or File ----------
app.ICON_CHOICE_WIDTH = 64; // Width of an icon to choose from, in pixels (its height follows the tiles' shape); see .qd-icon-choice-img
app.VECTOR_LABEL = 'SVG'; // Shown under an SVG icon instead of a size: it has none
app.originalPicture = () => (app.node.image && app.node.image != '0') ? app.node.image : null; // The picture the tile had when this window opened
app.originalSource = () => app.node.imageSource == null ? QDCommon.ImageSource.page : app.node.imageSource;
app.sourceOptions = () => [SourcePageOption, SourceSiteIconOption, SourceFileOption];

// Presses the button of a source: the one in use, or `shown` (Site icon, while the icons are being found)
app.showSource = function(shown){
	const ImageSource = QDCommon.ImageSource;
	let pressed = shown == null ? source : shown;
	if(pressed == ImageSource.letter) pressed = ImageSource.siteIcon; // A letter tile is one of the Site icon choices
	for(const option of app.sourceOptions()) option.setAttribute('aria-pressed', String(+option.dataset.source == pressed));
};
app.chooseSource = function(chosen){
	const ImageSource = QDCommon.ImageSource;
	if(chosen == ImageSource.file){ // The source becomes File once a picture is chosen (QDUI.imagePicker below)
		ImageFile.click();
		return;
	}
	if(chosen == ImageSource.siteIcon){
		app.showSiteIcons();
		return;
	}
	const changed = source != ImageSource.page;
	picture = app.originalPicture(); // Page: the tile's screenshot, or one to be taken once saved
	source = ImageSource.page;
	capturesPage = app.originalSource() != ImageSource.page;
	IconList.hidden = true;
	SourceHint.textContent = capturesPage ? QDCommon.text('propertiesPageHint') : '';
	app.showImage();
	app.showSource();
	if(changed) app.changes.mark();
	QDUI.fitPopup();
};
// Site icon: the site's icons to choose from, best first, and a letter tile. Coming from another source, the best is
// chosen at once; a tile that has an icon already keeps it until another is chosen.
app.showSiteIcons = function(){
	const ImageSource = QDCommon.ImageSource;
	const url = Url.value.trim();
	if(!iconSearch || iconSearch.url != url) iconSearch = { url, found: QDClient.findSiteIcons(url, Title.value) };
	const search = iconSearch;
	IconList.replaceChildren();
	IconList.hidden = false;
	SourceHint.textContent = QDCommon.text('propertiesIconsSearching');
	app.showSource(ImageSource.siteIcon);
	QDUI.fitPopup();
	search.found.then(found => {
		if(iconSearch != search || IconList.hidden || app.deleted) return; // Another address, or another source chosen meanwhile
		const choices = found.icons.map(icon => ({ picture: icon.picture, source: ImageSource.siteIcon,
			label: icon.isVector ? app.VECTOR_LABEL : QDCommon.text('propertiesIconSize', icon.width) }));
		if(found.letter) choices.push({ picture: found.letter, source: ImageSource.letter, label: QDCommon.text('propertiesIconLetter') });
		app.iconChoices = choices;
		IconList.replaceChildren(...choices.map(app.iconChoiceButton));
		SourceHint.textContent = found.icons.length ? '' : QDCommon.text('propertiesIconsNone');
		const isIconAlready = source == ImageSource.siteIcon || source == ImageSource.letter;
		if(!isIconAlready && choices.length) app.useIconChoice(choices[0]);
		else app.showIconChoices();
		QDUI.fitPopup();
	});
};
app.iconChoices = []; // What the buttons of IconList stand for, in their order: { picture, source, label }
app.iconChoiceButton = function(choice, index){
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'qd-icon-choice';
	button.dataset.index = String(index);
	const image = document.createElement('span');
	image.className = 'qd-icon-choice-img';
	image.style.height = Math.round(app.ICON_CHOICE_WIDTH * QDCommon.tileRatio(app.settings.grid)) + 'px';
	image.style.backgroundImage = QDCommon.toCssUrl(choice.picture) || 'none';
	const label = document.createElement('span');
	label.textContent = choice.label;
	button.append(image, label);
	button.onclick = () => app.useIconChoice(choice);
	return button;
};
app.useIconChoice = function(choice){
	picture = choice.picture;
	source = choice.source;
	capturesPage = false;
	app.showImage();
	app.showSource();
	app.showIconChoices();
	app.changes.mark();
};
app.showIconChoices = function(){ // Presses the icon in use, if it is one of them
	for(const button of IconList.querySelectorAll('button')) button.setAttribute('aria-pressed', String(app.iconChoices[+(button.dataset.index || 0)].picture == picture));
};
app.useFile = function(webp){ // A picture from a file, dropped or pasted
	picture = webp;
	source = QDCommon.ImageSource.file;
	capturesPage = false;
	IconList.hidden = true;
	SourceHint.textContent = '';
	app.showImage();
	app.showSource();
	app.changes.mark();
	QDUI.fitPopup();
};

app.initButtons = function(){
	BtnOk.onclick = function(){ app.save(QDUI.closePopup); };
	BtnApply.onclick = function(){ app.save(); };
	BtnCancel.onclick = BtnClose.onclick = function(){ QDUI.closePopup(); };
	Url.addEventListener('input', () => { Url.classList.remove('is-invalid'); });

	ImageMode.onchange = function(){ app.showImage(); };
	ImageReset.onclick = function(){ // Back to the picture the tile had when this window opened
		picture = app.originalPicture();
		source = app.originalSource();
		capturesPage = false;
		IconList.hidden = true;
		SourceHint.textContent = '';
		app.showImage();
		app.showSource();
		app.changes.mark();
		QDUI.fitPopup();
	};
	for(const option of app.sourceOptions()) option.onclick = () => app.chooseSource(+(option.dataset.source || 0));
	ImageDefault.onclick = function(){ // Folders only: use the folder picture from the settings
		picture = null;
		app.showImage();
		app.changes.mark();
	};
	QDUI.imagePicker(ImageFile, ImageChoose, dataUrl => {
		QDCommon.toWebp(dataUrl, QDCommon.IMAGE_MAX_SIZE).then(app.useFile); // Store uploads as compact WebP
	});
	QDUI.imageDrop(ImageZone, ImageFile, { paste: true });
};
