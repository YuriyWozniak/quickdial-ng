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
	SourcePageOption.hidden = SourceSiteIconOption.hidden = isFolder; // A folder's picture is an icon, a file or the default folder picture
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
	app.useThemeColors();
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
		? { title: Title.value, image: image, imageMode: +(ImageMode.value), imageSource: picture ? source : QDCommon.ImageSource.page }
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

// ---------- where the picture comes from: Page, Site icon (one of the site's icons, or a letter tile), Icon or File ----------
app.ICON_CHOICE_WIDTH = 64; // Width of an icon to choose from, in pixels (its height follows the tiles' shape); see .qd-icon-choice-img
app.VECTOR_LABEL = 'SVG'; // Shown under an SVG icon instead of a size: it has none
app.originalPicture = () => (app.node.image && app.node.image != '0') ? app.node.image : null; // The picture the tile had when this window opened
app.originalSource = () => app.node.imageSource == null ? QDCommon.ImageSource.page : app.node.imageSource;
app.sourceOptions = () => [SourcePageOption, SourceSiteIconOption, SourceIconOption, SourceFileOption];
app.hideChoices = function(){ // Neither the site's icons nor the icon picker
	IconList.hidden = true;
	IconPicker.hidden = true;
};

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
	if(chosen == ImageSource.icon){
		app.showIconPicker();
		return;
	}
	const changed = source != ImageSource.page;
	picture = app.originalPicture(); // Page: the tile's screenshot, or one to be taken once saved
	source = ImageSource.page;
	capturesPage = app.originalSource() != ImageSource.page;
	app.hideChoices();
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
	IconPicker.hidden = true;
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
	app.hideChoices();
	SourceHint.textContent = '';
	app.showImage();
	app.showSource();
	app.changes.mark();
	QDUI.fitPopup();
};

// ---------- Icon: an icon of a set the user downloads (js/background/iconsets.js; made by release/make-icon-sets.js) ----------
// A set that isn't downloaded shows where it comes from, its size and licence, and Download; nothing is downloaded otherwise.
// The SVG sets hold icons [name, search words, markup inside a 24×24 <svg>]; the retro set [name, search words, x, y, size]:
// where the icon is in the set's picture. The chosen icon is drawn as a tile picture by the background page, in the colours
// chosen under the icons, which start from the theme's: the titles' colour for the icon, the accent colour for its background.
// The tile keeps that picture: removing the set later changes no tile.
app.IconSets = Object.freeze({ outline: 'outline', pixel: 'pixel', retro: 'retro' }); // The choices of IconSet (iconsets.json)
app.IconSetState = Object.freeze({ missing: 'missing', ready: 'ready', old: 'old' }); // As app.IconSets.State in the background page
app.MEGABYTE = 1 << 20;
app.ICON_SET_KEY = 'iconPickerSet'; // localStorage: the set the picker showed last, shown first next time
app.ICONS_PER_PAGE = 200; // The grid shows this many icons, and as many more each time it is scrolled to its end
app.ICON_CELL = 32; // An icon's size in the grid, in pixels (see .qd-icon-cell-img)
app.ICONS_NEAR_END = 2 * app.ICON_CELL; // How close to the grid's end (px) the next icons are added
app.SVG_ICON_SIZE = 24; // The SVG sets are drawn on a 24×24 grid
app.ICON_COLOR = '#ffffff'; // The icon's colour when the theme has no title colour,
app.ICON_BACKGROUND = '#3a72c8'; // and its background's when it has no accent colour (the Desktop theme's)
app.COLOR = /^#[0-9a-f]{6}$/i;
app.RETRO_PICTURE = /^data:image\/png;base64,/; // The retro set's picture, in its file
// How each SVG set is drawn: the attributes of its <svg> element, COLOR standing for the icon's colour
app.SVG_ATTRIBUTES = Object.freeze({
	outline: 'fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
	pixel: 'fill="COLOR"'
});
app.iconPicker = {
	sets: [], // The sets and whether each is downloaded: [{ name, source, homepage, license, licenseUrl, count, bytes, state, downloading }]
	failed: {}, // set -> why its last download failed
	loaded: {}, // set -> promise of { icons: [{ name, words, body } or { name, words, x, y, size }], sprite, spriteUrl }
	set: '', icons: [], shown: 0, // The set in the grid, its icons that match the search, and how many of them the grid has
	sprite: null, spriteUrl: null, // The retro picture (an Image, and its blob: URL), when the grid shows the retro set
	chosen: null, // { set, icon, sprite }: the icon chosen in this window, drawn again when a colour changes
	drawing: null // The drawing of the chosen icon under way: only the last one is used
};

app.initIconPicker = function(){
	let stored = null;
	try { stored = localStorage.getItem(app.ICON_SET_KEY); } catch(e) {}
	IconSet.value = Object.values(app.IconSets).includes(stored) ? stored : app.IconSets.outline;
	IconSet.onchange = function(){
		try { localStorage.setItem(app.ICON_SET_KEY, IconSet.value); } catch(e) {}
		app.showIcons();
	};
	IconSearch.oninput = function(){ app.showIcons(); };
	IconSetDownload.onclick = function(){ app.downloadIconSet(IconSet.value); };
	IconSetRemove.onclick = function(){ app.removeIconSet(IconSet.value); };
	IconGrid.onscroll = function(){
		if(IconGrid.scrollTop + IconGrid.clientHeight >= IconGrid.scrollHeight - app.ICONS_NEAR_END) app.showMoreIcons();
	};
	IconColor.onchange = IconBackground.onchange = function(){ app.drawChosenIcon(); };
	IconBackgroundColor.onchange = function(){ // Choosing its colour asks for a background
		IconBackground.checked = true;
		app.drawChosenIcon();
	};
};
app.useThemeColors = function(){ // The colours the picker starts with
	const cells = (app.settings.grid && app.settings.grid.cells) || {};
	IconColor.value = app.COLOR.test(cells.titleColor || '') ? cells.titleColor : app.ICON_COLOR;
	IconBackgroundColor.value = app.COLOR.test(app.settings.accentColor || '') ? app.settings.accentColor : app.ICON_BACKGROUND;
	IconBackground.checked = false;
};

app.showIconPicker = function(){
	IconList.hidden = true;
	IconPicker.hidden = false;
	app.showSource(QDCommon.ImageSource.icon);
	app.readIconSets().then(() => {
		app.showIcons();
		if(!IconPicker.hidden) (IconSearch.disabled ? IconSetDownload : IconSearch).focus();
	});
	QDUI.fitPopup();
};
app.readIconSets = function(){
	return QDClient.iconSets().then(sets => { app.iconPicker.sets = sets; });
};
app.iconSetInfo = name => app.iconPicker.sets.find(set => set.name == name) || null;

// Where the set comes from, its size and licence; Download (or Update) and Remove as its state allows
app.showIconSet = function(info){
	const State = app.IconSetState;
	IconSetAbout.replaceChildren();
	IconSetDownload.hidden = IconSetRemove.hidden = !info;
	if(!info) return;
	const link = (href, text) => {
		const anchor = document.createElement('a');
		anchor.href = href;
		anchor.target = '_blank';
		anchor.rel = 'noopener noreferrer';
		anchor.textContent = text;
		return anchor;
	};
	const size = (info.bytes / app.MEGABYTE).toLocaleString(undefined, { maximumFractionDigits: 1 });
	IconSetAbout.append(link(info.homepage, info.source), ' · ' + QDCommon.text('propertiesIconSetSize', info.count.toLocaleString(), size) + ' · ',
		link(info.licenseUrl, QDCommon.text('propertiesIconSetLicense', info.license)));
	IconSetDownload.hidden = info.state == State.ready && !info.downloading;
	IconSetDownload.disabled = info.downloading;
	IconSetDownload.textContent = QDCommon.text(info.downloading ? 'propertiesIconSetDownloading' : (info.state == State.old ? 'propertiesIconSetUpdate' : 'propertiesIconSetDownload'));
	IconSetRemove.hidden = info.state == State.missing || info.downloading;
};
app.downloadIconSet = function(set){
	const picker = app.iconPicker, info = app.iconSetInfo(set);
	if(!info || info.downloading) return;
	info.downloading = true;
	delete picker.failed[set];
	app.showIcons();
	QDClient.downloadIconSet(set).then(error => {
		if(error) picker.failed[set] = error;
		else app.forgetIconSet(set);
		return app.readIconSets();
	}).then(() => { if(!IconPicker.hidden && IconSet.value == set) app.showIcons(); });
};
app.removeIconSet = function(set){
	QDClient.removeIconSet(set).then(() => {
		app.forgetIconSet(set);
		return app.readIconSets();
	}).then(() => { if(!IconPicker.hidden && IconSet.value == set) app.showIcons(); });
};
app.forgetIconSet = function(set){ // Its icons are read again next time
	const loaded = app.iconPicker.loaded[set];
	delete app.iconPicker.loaded[set];
	if(loaded) loaded.then(data => { if(data.spriteUrl) URL.revokeObjectURL(data.spriteUrl); });
};
// A downloaded set's icons. The retro picture becomes a blob: URL once, which every icon of the grid shows a part of.
app.loadIconSet = function(set){
	const loaded = app.iconPicker.loaded, none = { icons: [], sprite: null, spriteUrl: null };
	if(!loaded[set]) loaded[set] = QDClient.iconSet(set).then(async data => {
		if(!data) throw new Error('not downloaded');
		if(set != app.IconSets.retro) return { icons: data.icons.map(([name, words, body]) => ({ name, words, body })), sprite: null, spriteUrl: null };
		const icons = data.icons.map(([name, words, x, y, size]) => ({ name, words, x, y, size }));
		icons.sort((first, second) => second.size - first.size); // The large icons first: most small ones are signs for toolbars
		if(!app.RETRO_PICTURE.test(data.picture || '')) throw new Error('no picture');
		const bytes = Uint8Array.from(atob(data.picture.replace(app.RETRO_PICTURE, '')), character => character.charCodeAt(0));
		const spriteUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
		const sprite = new Image();
		sprite.src = spriteUrl;
		await sprite.decode();
		return { icons, sprite, spriteUrl };
	}).catch(e => {
		console.error('Quick Dial NG: the icon set ' + set + ' could not be read', e);
		delete loaded[set]; // Tried again next time
		return none;
	});
	return loaded[set];
};
// The chosen set: where it comes from, and its icons that match the search (every word of it is in the icon's name or
// search words), or Download when it isn't downloaded
app.showIcons = function(){
	const picker = app.iconPicker, set = IconSet.value, search = IconSearch.value.trim(), State = app.IconSetState;
	const info = app.iconSetInfo(set), failed = picker.failed[set];
	const words = search.toLowerCase().split(/\s+/).filter(Boolean);
	app.showIconSet(info);
	const usable = !!info && info.state != State.missing;
	IconSearch.disabled = IconGrid.hidden = IconColors.hidden = !usable;
	IconColor.disabled = set == app.IconSets.retro; // Those are in their own colours
	const hint = () => failed ? QDCommon.text('propertiesIconSetFailed', failed) : (info && info.downloading ? '' : null);
	if(!usable){
		picker.set = '';
		picker.icons = [];
		IconGrid.replaceChildren();
		SourceHint.textContent = hint() ?? (info ? QDCommon.text('propertiesIconSetMissing') : '');
		QDUI.fitPopup();
		return;
	}
	app.loadIconSet(set).then(data => {
		if(IconPicker.hidden || IconSet.value != set || IconSearch.value.trim() != search) return; // Something else asked for meanwhile
		picker.set = set;
		picker.sprite = data.sprite;
		picker.spriteUrl = data.spriteUrl;
		picker.icons = data.icons.filter(icon => words.every(word => icon.name.includes(word) || icon.words.includes(word)));
		picker.shown = 0;
		IconGrid.replaceChildren();
		IconGrid.scrollTop = 0;
		app.showMoreIcons();
		SourceHint.textContent = hint() ?? (info.state == State.old ? QDCommon.text('propertiesIconSetOld')
			: (picker.icons.length ? QDCommon.text('propertiesIconChoose') : QDCommon.text('propertiesIconsNoMatch', search)));
		QDUI.fitPopup();
	});
};
app.showMoreIcons = function(){
	const picker = app.iconPicker;
	const more = picker.icons.slice(picker.shown, picker.shown + app.ICONS_PER_PAGE);
	picker.shown += more.length;
	IconGrid.append(...more.map(app.iconCell));
};
app.iconCell = function(icon){
	const picker = app.iconPicker;
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'qd-icon-cell';
	button.title = icon.name;
	button.setAttribute('aria-label', icon.name);
	button.setAttribute('aria-pressed', String(app.isChosenIcon(picker.set, icon)));
	const image = document.createElement('span');
	image.className = 'qd-icon-cell-img';
	if(icon.body != null){ // Drawn in the text colour, through the icon as a mask
		image.classList.add('is-mask');
		image.style.maskImage = 'url("' + app.svgIcon(picker.set, icon, '#000000') + '")';
	} else { // Its square of the retro picture, a 16×16 icon twice as large
		const scale = app.ICON_CELL / icon.size;
		image.style.backgroundImage = 'url("' + picker.spriteUrl + '")';
		image.style.backgroundSize = (picker.sprite.naturalWidth * scale) + 'px auto';
		image.style.backgroundPosition = (-icon.x * scale) + 'px ' + (-icon.y * scale) + 'px';
	}
	button.append(image);
	const set = picker.set;
	button.onclick = () => app.chooseIcon(set, icon);
	return button;
};
app.isChosenIcon = (set, icon) => !!app.iconPicker.chosen && app.iconPicker.chosen.set == set && app.iconPicker.chosen.icon === icon;
// An icon of an SVG set as a data URL, in the colour `color` (#rrggbb)
app.svgIcon = function(set, icon, color){
	const size = app.SVG_ICON_SIZE;
	const markup = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" color="' + color + '" '
		+ app.SVG_ATTRIBUTES[set].replace('COLOR', color) + '>' + icon.body + '</svg>';
	return 'data:image/svg+xml,' + encodeURIComponent(markup);
};
// An icon of the retro set as a PNG data URL of its own size
app.retroIcon = function(icon, sprite){
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = icon.size;
	canvas.getContext('2d').drawImage(sprite, icon.x, icon.y, icon.size, icon.size, 0, 0, icon.size, icon.size);
	return canvas.toDataURL('image/png');
};

app.chooseIcon = function(set, icon){
	app.iconPicker.chosen = { set, icon, sprite: app.iconPicker.sprite };
	for(const button of IconGrid.querySelectorAll('button')) button.setAttribute('aria-pressed', 'false');
	app.drawChosenIcon();
};
// The chosen icon as the tile's picture, in the colours chosen. The SVG outline icons are drawn as vectors; the pixel and
// retro icons at their own size, enlarged by whole pixels so they stay sharp.
app.drawChosenIcon = function(){
	const picker = app.iconPicker, chosen = picker.chosen;
	if(!chosen) return;
	const isSvg = chosen.icon.body != null, size = isSvg ? app.SVG_ICON_SIZE : chosen.icon.size;
	const drawing = QDClient.drawIcon({
		image: isSvg ? app.svgIcon(chosen.set, chosen.icon, IconColor.value) : app.retroIcon(chosen.icon, chosen.sprite),
		width: size, height: size, isVector: chosen.set == app.IconSets.outline,
		background: IconBackground.checked ? IconBackgroundColor.value : null
	}).then(drawn => {
		if(picker.drawing !== drawing || app.deleted) return; // Another icon or colour chosen meanwhile
		picker.drawing = null;
		if(!drawn) return;
		picture = drawn;
		source = QDCommon.ImageSource.icon;
		capturesPage = false;
		app.showImage();
		app.showSource();
		for(const button of IconGrid.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.title == chosen.icon.name && picker.set == chosen.set));
		app.changes.mark();
	});
	picker.drawing = drawing;
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
		app.hideChoices();
		SourceHint.textContent = '';
		app.showImage();
		app.showSource();
		app.changes.mark();
		QDUI.fitPopup();
	};
	for(const option of app.sourceOptions()) option.onclick = () => app.chooseSource(+(option.dataset.source || 0));
	ImageDefault.onclick = function(){ // Folders only: use the folder picture from the settings
		picture = null;
		source = QDCommon.ImageSource.page;
		app.hideChoices();
		SourceHint.textContent = '';
		app.showImage();
		app.showSource();
		app.changes.mark();
		QDUI.fitPopup();
	};
	app.initIconPicker();
	QDUI.imagePicker(ImageFile, ImageChoose, dataUrl => {
		QDCommon.toWebp(dataUrl, QDCommon.IMAGE_MAX_SIZE).then(app.useFile); // Store uploads as compact WebP
	});
	QDUI.imageDrop(ImageZone, ImageFile, { paste: true });
};
