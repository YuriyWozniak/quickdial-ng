// The Properties popup's Icon source (loaded after properties.js): an icon of a set the user downloads
// (js/background/iconsets.js; made by release/make-icon-sets.js). Form elements are reached by their id, as in properties.js.
// A set that isn't downloaded shows where it comes from, its size and licence, and Download; nothing is downloaded otherwise.
// The SVG sets hold icons [name, search words, markup inside a 24×24 <svg>]; the retro set [name, search words, x, y, size]:
// where the icon is in the set's picture. The chosen icon is drawn as a tile picture by the background page, in the colours
// chosen under the icons, which start from the theme's: the titles' colour for the icon, the accent colour for its background.
// The tile keeps that picture: removing the set later changes no tile. The popup gets the picture through app.usePicture.
app.Icons = {
	Sets: Object.freeze({ outline: 'outline', pixel: 'pixel', retro: 'retro' }), // The choices of IconSet (iconsets.json)
	SetState: Object.freeze({ missing: 'missing', ready: 'ready', old: 'old' }), // As app.IconSets.State in the background page
	MEGABYTE: 1 << 20,
	SET_KEY: 'iconPickerSet', // localStorage: the set the picker showed last, shown first next time
	PER_PAGE: 200, // The grid shows this many icons, and as many more each time it is scrolled to its end
	CELL: 32, // An icon's size in the grid, in pixels (see .qd-icon-cell-img)
	SVG_SIZE: 24, // The SVG sets are drawn on a 24×24 grid
	DEFAULT_COLOR: '#ffffff', // The icon's colour when the theme has no title colour,
	DEFAULT_BACKGROUND: '#3a72c8', // and its background's when it has no accent colour (the Desktop theme's)
	COLOR: /^#[0-9a-f]{6}$/i,
	RETRO_PICTURE: /^data:image\/png;base64,/, // The retro set's picture, in its file
	// How each SVG set is drawn: the attributes of its <svg> element, COLOR standing for the icon's colour
	SVG_ATTRIBUTES: Object.freeze({
		outline: 'fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
		pixel: 'fill="COLOR"'
	}),

	sets: [], // The sets and whether each is downloaded: [{ name, source, homepage, license, licenseUrl, count, bytes, state, downloading }]
	failed: {}, // set -> why its last download failed: { error, gone }
	loaded: {}, // set -> promise of { icons: [{ name, words, body } or { name, words, x, y, size }], sprite, spriteUrl }
	set: '', icons: [], shown: 0, // The set in the grid, its icons that match the search, and how many of them the grid has
	sprite: null, spriteUrl: null, // The retro picture (an Image, and its blob: URL), when the grid shows the retro set
	chosen: null, // { set, icon, sprite }: the icon chosen in this window, drawn again when a colour changes
	drawing: null // The drawing of the chosen icon under way: only the last one is used
};
app.Icons.NEAR_END = 2 * app.Icons.CELL; // How close to the grid's end (px) the next icons are added

app.Icons.init = function(){
	let stored = null;
	try { stored = localStorage.getItem(app.Icons.SET_KEY); } catch(e) {}
	IconSet.value = Object.values(app.Icons.Sets).includes(stored) ? stored : app.Icons.Sets.outline;
	IconSet.onchange = function(){
		try { localStorage.setItem(app.Icons.SET_KEY, IconSet.value); } catch(e) {}
		app.Icons.showIcons();
	};
	IconSearch.oninput = function(){ app.Icons.showIcons(); };
	IconSetDownload.onclick = function(){ app.Icons.download(IconSet.value); };
	IconSetRemove.onclick = function(){ app.Icons.remove(IconSet.value); };
	IconGrid.onscroll = function(){
		if(IconGrid.scrollTop + IconGrid.clientHeight >= IconGrid.scrollHeight - app.Icons.NEAR_END) app.Icons.showMore();
	};
	IconColor.onchange = IconBackground.onchange = function(){ app.Icons.drawChosen(); };
	IconBackgroundColor.onchange = function(){ // Choosing its colour asks for a background
		IconBackground.checked = true;
		app.Icons.drawChosen();
	};
};
app.Icons.useThemeColors = function(settings){ // The colours the picker starts with
	const cells = (settings.grid && settings.grid.cells) || {};
	IconColor.value = app.Icons.COLOR.test(cells.titleColor || '') ? cells.titleColor : app.Icons.DEFAULT_COLOR;
	IconBackgroundColor.value = app.Icons.COLOR.test(settings.accentColor || '') ? settings.accentColor : app.Icons.DEFAULT_BACKGROUND;
	IconBackground.checked = false;
};

app.Icons.show = function(){
	IconList.hidden = true;
	IconPicker.hidden = false;
	app.showSource(QDCommon.ImageSource.icon);
	app.Icons.readSets().then(() => {
		app.Icons.showIcons();
		if(!IconPicker.hidden) (IconSearch.disabled ? IconSetDownload : IconSearch).focus();
	});
	QDUI.fitPopup();
};
app.Icons.readSets = function(){
	return QDClient.iconSets().then(sets => { app.Icons.sets = sets; });
};
app.Icons.setInfo = name => app.Icons.sets.find(set => set.name == name) || null;

// Where the set comes from, its size and licence; Download (or Update) and Remove as its state allows
app.Icons.showSet = function(info){
	const State = app.Icons.SetState;
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
	const size = (info.bytes / app.Icons.MEGABYTE).toLocaleString(undefined, { maximumFractionDigits: 1 });
	IconSetAbout.append(link(info.homepage, info.source), ' · ' + QDCommon.text('propertiesIconSetSize', info.count.toLocaleString(), size) + ' · ',
		link(info.licenseUrl, QDCommon.text('propertiesIconSetLicense', info.license)));
	IconSetDownload.hidden = info.state == State.ready && !info.downloading;
	IconSetDownload.disabled = info.downloading;
	IconSetDownload.textContent = QDCommon.text(info.downloading ? 'propertiesIconSetDownloading' : (info.state == State.old ? 'propertiesIconSetUpdate' : 'propertiesIconSetDownload'));
	IconSetRemove.hidden = info.state == State.missing || info.downloading;
};
app.Icons.download = function(set){
	const info = app.Icons.setInfo(set);
	if(!info || info.downloading) return;
	info.downloading = true;
	delete app.Icons.failed[set];
	app.Icons.showIcons();
	QDClient.downloadIconSet(set).then(failure => {
		if(failure) app.Icons.failed[set] = failure;
		else app.Icons.forget(set);
		return app.Icons.readSets();
	}).then(() => app.Icons.showIfShown(set));
};
app.Icons.remove = function(set){
	QDClient.removeIconSet(set).then(() => {
		app.Icons.forget(set);
		return app.Icons.readSets();
	}).then(() => app.Icons.showIfShown(set));
};
app.Icons.showIfShown = function(set){ // The set's icons again, if the picker still shows that set
	if(!IconPicker.hidden && IconSet.value == set) app.Icons.showIcons();
};
app.Icons.forget = function(set){ // Its icons are read again next time
	const loaded = app.Icons.loaded[set];
	delete app.Icons.loaded[set];
	if(loaded) loaded.then(data => { if(data.spriteUrl) URL.revokeObjectURL(data.spriteUrl); });
};
// A downloaded set's icons. The retro picture becomes a blob: URL once, which every icon of the grid shows a part of.
app.Icons.load = function(set){
	const loaded = app.Icons.loaded, none = { icons: [], sprite: null, spriteUrl: null };
	if(!loaded[set]) loaded[set] = QDClient.iconSet(set).then(async data => {
		if(!data) throw new Error('not downloaded');
		if(set != app.Icons.Sets.retro) return { icons: data.icons.map(([name, words, body]) => ({ name, words, body })), sprite: null, spriteUrl: null };
		const icons = data.icons.map(([name, words, x, y, size]) => ({ name, words, x, y, size }));
		icons.sort((first, second) => second.size - first.size); // The large icons first: most small ones are signs for toolbars
		if(!app.Icons.RETRO_PICTURE.test(data.picture || '')) throw new Error('no picture');
		const bytes = Uint8Array.from(atob(data.picture.replace(app.Icons.RETRO_PICTURE, '')), character => character.charCodeAt(0));
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
app.Icons.showIcons = function(){
	const Icons = app.Icons, set = IconSet.value, search = IconSearch.value.trim(), State = Icons.SetState;
	const info = Icons.setInfo(set), failed = Icons.failed[set];
	const words = search.toLowerCase().split(/\s+/).filter(Boolean);
	Icons.showSet(info);
	const usable = !!info && info.state != State.missing;
	IconSearch.disabled = IconGrid.hidden = IconColors.hidden = !usable;
	IconColor.disabled = set == Icons.Sets.retro; // Those are in their own colours
	// Why the last download failed: a file no longer there asks for a newer Quick Dial NG (its sets are elsewhere)
	const hint = () => failed ? (failed.gone ? QDCommon.text('propertiesIconSetGone') : QDCommon.text('propertiesIconSetFailed', failed.error))
		: (info && info.downloading ? '' : null);
	if(!usable){
		Icons.set = '';
		Icons.icons = [];
		IconGrid.replaceChildren();
		SourceHint.textContent = hint() ?? (info ? QDCommon.text('propertiesIconSetMissing') : '');
		QDUI.fitPopup();
		return;
	}
	Icons.load(set).then(data => {
		if(IconPicker.hidden || IconSet.value != set || IconSearch.value.trim() != search) return; // Something else asked for meanwhile
		Icons.set = set;
		Icons.sprite = data.sprite;
		Icons.spriteUrl = data.spriteUrl;
		Icons.icons = data.icons.filter(icon => words.every(word => icon.name.includes(word) || icon.words.includes(word)));
		Icons.shown = 0;
		IconGrid.replaceChildren();
		IconGrid.scrollTop = 0;
		Icons.showMore();
		SourceHint.textContent = hint() ?? (info.state == State.old ? QDCommon.text('propertiesIconSetOld')
			: (Icons.icons.length ? QDCommon.text('propertiesIconChoose') : QDCommon.text('propertiesIconsNoMatch', search)));
		QDUI.fitPopup();
	});
};
app.Icons.showMore = function(){
	const Icons = app.Icons;
	const more = Icons.icons.slice(Icons.shown, Icons.shown + Icons.PER_PAGE);
	Icons.shown += more.length;
	IconGrid.append(...more.map(Icons.cell));
};
app.Icons.cell = function(icon){
	const Icons = app.Icons, set = Icons.set;
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'qd-icon-cell';
	button.title = icon.name;
	button.setAttribute('aria-label', icon.name);
	button.setAttribute('aria-pressed', String(Icons.isChosen(set, icon)));
	const image = document.createElement('span');
	image.className = 'qd-icon-cell-img';
	if(icon.body != null){ // Drawn in the text colour, through the icon as a mask
		image.classList.add('is-mask');
		image.style.maskImage = 'url("' + Icons.svgIcon(set, icon, '#000000') + '")';
	} else { // Its square of the retro picture, a 16×16 icon twice as large
		const scale = Icons.CELL / icon.size;
		image.style.backgroundImage = 'url("' + Icons.spriteUrl + '")';
		image.style.backgroundSize = (Icons.sprite.naturalWidth * scale) + 'px auto';
		image.style.backgroundPosition = (-icon.x * scale) + 'px ' + (-icon.y * scale) + 'px';
	}
	button.append(image);
	button.onclick = () => Icons.choose(set, icon);
	return button;
};
app.Icons.isChosen = (set, icon) => !!app.Icons.chosen && app.Icons.chosen.set == set && app.Icons.chosen.icon === icon;
// An icon of an SVG set as a data URL, in the colour `color` (#rrggbb)
app.Icons.svgIcon = function(set, icon, color){
	const size = app.Icons.SVG_SIZE;
	const markup = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" color="' + color + '" '
		+ app.Icons.SVG_ATTRIBUTES[set].replace('COLOR', color) + '>' + icon.body + '</svg>';
	return 'data:image/svg+xml,' + encodeURIComponent(markup);
};
// An icon of the retro set as a PNG data URL of its own size
app.Icons.retroIcon = function(icon, sprite){
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = icon.size;
	canvas.getContext('2d').drawImage(sprite, icon.x, icon.y, icon.size, icon.size, 0, 0, icon.size, icon.size);
	return canvas.toDataURL('image/png');
};

app.Icons.choose = function(set, icon){
	app.Icons.chosen = { set, icon, sprite: app.Icons.sprite };
	for(const button of IconGrid.querySelectorAll('button')) button.setAttribute('aria-pressed', 'false');
	app.Icons.drawChosen();
};
// The chosen icon as the tile's picture, in the colours chosen. The SVG outline icons are drawn as vectors; the pixel and
// retro icons at their own size, enlarged by whole pixels so they stay sharp.
app.Icons.drawChosen = function(){
	const Icons = app.Icons, chosen = Icons.chosen;
	if(!chosen) return;
	const isSvg = chosen.icon.body != null, size = isSvg ? Icons.SVG_SIZE : chosen.icon.size;
	const drawing = QDClient.drawIcon({
		image: isSvg ? Icons.svgIcon(chosen.set, chosen.icon, IconColor.value) : Icons.retroIcon(chosen.icon, chosen.sprite),
		width: size, height: size, isVector: chosen.set == Icons.Sets.outline,
		background: IconBackground.checked ? IconBackgroundColor.value : null
	}).then(drawn => {
		if(Icons.drawing !== drawing || app.deleted) return; // Another icon or colour chosen meanwhile
		Icons.drawing = null;
		if(!drawn) return;
		app.usePicture(drawn, QDCommon.ImageSource.icon);
		for(const button of IconGrid.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.title == chosen.icon.name && Icons.set == chosen.set));
	});
	Icons.drawing = drawing;
};
