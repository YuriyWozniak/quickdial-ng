// The Settings page (its own tab). Form elements are reached by their id (window.BtnApply...).
// app.init sets up each tab with its own function (setupPage, setupGrid, setupTiles, Themes.setup, Backup.setup);
// the form fields themselves are listed once, in FIELDS, and copied to and from the settings by fillForm and readForm.
/* exported app */
// eslint-disable-next-line no-var -- a window property, like on the other pages
var app = {};

// Pictures and the theme gradient have no form field of their own
let backgroundImage = null;
let backgroundGradient = null;
let backIcon = null;
let folderIcon = null;

// Sizes and times of this page
const SAMPLE_TILE_WIDTH = 152; // px: the sample tiles of the Tiles tab and the theme cards (.qd-tile-slot, css/page.css)
const SAMPLE_TILE_MAX_HEIGHT = 200; // px: taller shapes are cut off
const GRID_PREVIEW_WIDTH = 220; // px: the cells of the grid preview (Grid tab) fit in this box (.qd-grid-preview, css/settings.css)
const GRID_PREVIEW_HEIGHT = 124;
const GRID_PREVIEW_GAP = 2; // px between its cells
const GRID_PREVIEW_MIN_CELL = 1; // px: a cell is drawn at least this large, however many there are
const GRID_PREVIEW_CELL_OPACITY = .45; // its cells are the title colour at this opacity
const COPIED_LABEL_TIME = 2000; // ms the Copy export snippet button says Copied
const DOWNLOAD_URL_LIFETIME = 1000; // ms a downloaded file's object URL is kept

document.addEventListener('DOMContentLoaded', event => {
	app.init();
});

// Form fields and the setting each one edits: { id: element id, path: settings path, kind, nullToggle: id of the
// "None" checkbox or the "Default" radio button (color? only), nullColor: colour shown while that one is on }
// Kinds: num, pct (0..1 shown as %), bool, color, color? (null = the checkbox), text, choice (a list's value;
// one the list doesn't have shows its first item)
const FIELDS = (function(){
	const field = (id, path, kind, nullToggle, nullColor) => ({ id, path, kind, nullToggle, nullColor });
	const fields = [
		field('Language', 'language', 'choice'),
		field('MenuShowAdd', 'menuShowAdd', 'bool'),
		field('ToolbarAction', 'toolbarAction', 'text'),
		field('BackgroundColor', 'backgroundColor', 'color'),
		field('BackgroundMode', 'backgroundMode', 'num'),
		field('AccentColor', 'accentColor', 'color?', 'AccentDefault', '#0061e0'),
		field('GridRoot', 'grid.root', 'text'),
		field('GridRows', 'grid.rows', 'num'),
		field('GridColumns', 'grid.columns', 'num'),
		field('GridRatioX', 'grid.ratioX', 'num'),
		field('GridRatioY', 'grid.ratioY', 'num'),
		field('GridMargins', 'grid.margin', 'num'),
		field('GridOpenBookmarksIn', 'grid.openBookmarkMethod', 'num'),
		field('GridOpenFoldersIn', 'grid.openFolderMethod', 'num'),
		field('GridBackNode', 'grid.backNode', 'bool'),
		field('GridBackMode', 'grid.backIconMode', 'num'),
		field('GridFolderMode', 'grid.folderIconMode', 'num'),
		field('GridCellsHoverEffect', 'grid.cells.hoverEffect', 'num'),
		field('GridCellsClickEffect', 'grid.cells.clickEffect', 'num'),
		field('GridCellsTitleFont', 'grid.cells.titleFont', 'text'),
		field('GridCellsTitleBold', 'grid.cells.titleBold', 'bool'),
		field('GridCellsTitlePosition', 'grid.cells.titlePosition', 'num'),
		field('GridCellsSnapshotDelay', 'grid.cells.snapshotDelay', 'num'),
		field('GridNewTilePicture', 'grid.newTilePicture', 'num')
	];
	// Tile and title styles come in pairs: GridCells<Name> / GridCells<Name>Hover
	[
		['Margins', 'margin', 'num'], ['Opacity', 'opacity', 'pct'], ['BorderSize', 'borderSize', 'num'], ['BorderRadius', 'borderRadius', 'num'],
		['BorderColor', 'borderColor', 'color'], ['BackgroundColor', 'backgroundColor', 'color?', 'BackgroundTransparent'],
		['BackgroundOpacity', 'backgroundOpacity', 'pct'], ['Blur', 'blur', 'num'], ['Shadow', 'shadow', 'num'],
		['Title', 'title', 'bool'], ['TitleHeight', 'titleHeight', 'num'], ['TitleFontSize', 'titleFontSize', 'num'],
		['TitleBorderSize', 'titleBorderSize', 'num'], ['TitleColor', 'titleColor', 'color'],
		['TitleBackgroundColor', 'titleBackgroundColor', 'color?', 'TitleBackgroundTransparent'], ['TitleBackgroundOpacity', 'titleBackgroundOpacity', 'pct']
	].forEach(entry => {
		['', 'Hover'].forEach(suffix => {
			fields.push(field('GridCells' + entry[0] + suffix, 'grid.cells.' + entry[1] + suffix, entry[2], entry[3] ? 'GridCells' + entry[3] + suffix : null, '#ffffff'));
		});
	});
	return fields;
})();

app.objectPath = {
	get: function(obj, path){ return path.split('.').reduce((o, k) => o == null ? undefined : o[k], obj); },
	set: function(obj, path, value){
		const keys = path.split('.'), last = keys.pop();
		keys.reduce((o, k) => o[k] || (o[k] = {}), obj)[last] = value;
	}
};
app.clone = function(value){ return JSON.parse(JSON.stringify(value)); };

// settings -> form
app.fillForm = function(settings){
	FIELDS.forEach(field => {
		const element = document.getElementById(field.id), value = app.objectPath.get(settings, field.path);
		switch(field.kind){
			case 'bool': element.checked = !!value; break;
			case 'pct': element.value = Math.round((value == null ? 1 : value) * 100); break;
			case 'color?': document.getElementById(field.nullToggle).checked = (value == null); element.value = value || field.nullColor; break;
			case 'text':
				if(element.tagName == 'SELECT' && value && !Array.prototype.some.call(element.options, o => o.value == value)){
					element.add(new Option(QDCommon.text('settingsCustomFont', value.split(',')[0].replace(/["']/g, '')), value)); // a font from an imported theme
				}
				element.value = value == null ? '' : value;
				break;
			case 'choice':
				element.value = value == null ? '' : value;
				if(element.selectedIndex < 0) element.selectedIndex = 0;
				break;
			default: element.value = value == null ? '' : value;
		}
	});
	AccentCustom.checked = !AccentDefault.checked; // the accent's Default | Custom are two radio buttons; FIELDS knows the first
	backgroundImage = settings.backgroundImage;
	backgroundGradient = settings.backgroundGradient;
	backIcon = settings.grid.backIcon;
	folderIcon = settings.grid.folderIcon;
};
// form -> settings (written into `settings`, which is returned)
app.readForm = function(settings){
	FIELDS.forEach(field => {
		const element = document.getElementById(field.id);
		let value;
		switch(field.kind){
			case 'bool': value = element.checked; break;
			case 'num': value = element.value === '' || isNaN(+element.value) ? app.objectPath.get(settings, field.path) : +element.value; break;
			case 'pct': value = element.value === '' || isNaN(+element.value) ? app.objectPath.get(settings, field.path) : Math.min(100, Math.max(0, +element.value)) / 100; break;
			case 'color?': value = document.getElementById(field.nullToggle).checked ? null : element.value; break;
			default: value = element.value;
		}
		app.objectPath.set(settings, field.path, value);
	});
	settings.backgroundImage = backgroundImage;
	settings.backgroundGradient = backgroundGradient;
	settings.grid.backIcon = backIcon;
	settings.grid.folderIcon = folderIcon;
	return settings;
};
// What the form shows right now, as a full settings object (the saved settings are not touched)
app.formSettings = function(){ return app.readForm(app.clone(app.settings)); };
// How many settings the form has changed (each field and each picture counts once): the footer says so while they
// are not applied, with the shortcut that applies them
app.PICTURES = ['backgroundImage', 'backgroundGradient', 'grid.backIcon', 'grid.folderIcon'];
app.countChanges = function(){
	if(!app.settings) return 0;
	// null and an empty field are the same "nothing"; a colour reads the same in either case (#FFFFFF, #ffffff)
	const comparable = value => value == null || value === '' ? 'null' : JSON.stringify(value).toLowerCase();
	const form = app.formSettings(), differs = path => comparable(app.objectPath.get(form, path)) != comparable(app.objectPath.get(app.settings, path));
	return FIELDS.filter(field => differs(field.path)).length + app.PICTURES.filter(differs).length;
};
app.describeChanges = function(){
	const count = app.countChanges();
	return count ? QDCommon.text('statusNotApplied', QDCommon.countText('countChanges', count)) : QDCommon.text('statusUnsaved');
};

app.init = function(){
	// Settings has its own tab (opened from the toolbar button, the dial's menu or Firefox's Add-ons page)
	QDUI.localize();
	try { Version.textContent = QDCommon.text('settingsVersion', browser.runtime.getManifest().version); } catch(e) { Version.textContent = ''; }
	for(const tab of Tabs.querySelectorAll('[role=tab]')) tab.title = tab.textContent.trim(); // a narrow window shows only the icons
	app.tabs = QDUI.initTabs(Tabs, btn => {
		const panel = btn.getAttribute('aria-controls');
		Content.scrollTop = 0;
		PanelTitle.textContent = btn.textContent.trim();
		QDUI.setRichText(PanelIntro, QDCommon.text(document.getElementById(panel).dataset.i18nIntro)); // what the section is about (data-i18n-intro)
		TilesTools.hidden = panel != 'TabTiles';
		ThemesTools.hidden = panel != 'TabThemes';
		history.replaceState(null, '', '?tab=' + btn.id.replace(/^Tab|Button$/g, '').toLowerCase()); // a reload stays on this section
	});
	app.changes = QDUI.trackChanges(BtnApply, Status, BtnDiscard, app.describeChanges);
	app.setupActions();
	app.setupPage();
	app.setupGrid();
	app.setupTiles();
	app.Themes.setup();
	app.Backup.setup();
	// Live previews follow every edit
	document.addEventListener('input', app.updatePreviews);
	document.addEventListener('change', app.updatePreviews);

	app.load();
	app.listen();
	app.showSection(new URLSearchParams(location.search).get('tab'));
};

// The buttons below every tab: Apply (also Ctrl+S), Discard changes, Open the dial; closing the tab with changes not applied asks first
app.setupActions = function(){
	BtnApply.onclick = function(){
		if(!app.settings || !app.changes.isDirty()) return;
		app.readForm(app.settings);
		QDClient.setSettings(app.settings);
		app.changes.markSaved(QDCommon.text('statusAppliedToDial'));
	};
	BtnDiscard.onclick = function(){
		app.fillForm(app.settings);
		app.updatePreviews();
		ThemeStatus.hidden = true;
		app.changes.markDiscarded(QDCommon.text('statusDiscarded'));
	};
	BtnOpenDial.onclick = function(){
		browser.tabs.create({ url: QDCommon.DIAL_PAGE });
	};
	document.addEventListener('keydown', e => {
		if((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() == 's'){ e.preventDefault(); BtnApply.onclick(); }
	});
	window.addEventListener('beforeunload', e => {
		if(app.changes.isDirty()){ e.preventDefault(); e.returnValue = ''; }
	});
};
// A picture picked, dropped or cleared: fn(value) stores it, then the previews and the Apply button follow.
// The settings hold pictures as url("...") values.
app.pictureEdit = fn => value => { fn(value); app.updatePreviews(); app.changes.mark(); };
// A picture chosen or dropped: re-encoded as compact WebP of at most maxSize pixels (as in Properties, see
// QDCommon.toWebp), then stored by store(url("...")). When a second picture is chosen before the first one is
// ready, only the second is kept.
app.picturePicked = (store, maxSize) => {
	let latest = 0;
	return dataUrl => {
		const pick = ++latest;
		QDCommon.toWebp(dataUrl, maxSize).then(webp => {
			if(pick == latest) app.pictureEdit(store)(QDCommon.toCssUrl(webp));
		});
	};
};
// Tab Page: the languages, the background picture (the rest of the tab is plain form fields, FIELDS)
app.setupPage = function(){
	app.setupLanguages();
	QDUI.imagePicker(BackgroundImageFile, BackgroundImageChoose, app.picturePicked(css => { backgroundImage = css; }, QDCommon.BACKGROUND_MAX_SIZE));
	QDUI.imageDrop(BackgroundZone, BackgroundImageFile);
	BackgroundImageClear.onclick = app.pictureEdit(() => { backgroundImage = null; });
	BackgroundGradientClear.onclick = app.pictureEdit(() => { backgroundGradient = null; });
};
// The Language list: "Same as Firefox (its language)", then every language in its own name, in alphabetical order
app.setupLanguages = function(){
	const names = QDCommon.LANGUAGES;
	LanguageBrowser.textContent = QDCommon.text('settingsLanguageBrowser') + ' (' + names[app.firefoxLanguage()] + ')';
	Object.keys(names).sort((a, b) => names[a].localeCompare(names[b])).forEach(code => {
		const option = new Option(names[code], code);
		option.lang = code.replace('_', '-'); // read out in its own language
		Language.add(option);
	});
};
// The language Firefox shows the extension in: its own if there are texts for it ('pt-BR', or 'uk' for 'uk-UA'), otherwise English
app.firefoxLanguage = function(){
	const uiLanguage = browser.i18n.getUILanguage().replace('-', '_'), codes = Object.keys(QDCommon.LANGUAGES);
	return codes.find(c => c.toLowerCase() == uiLanguage.toLowerCase()) || codes.find(c => c.split('_')[0] == uiLanguage.split('_')[0].toLowerCase()) || 'en';
};
// Tab Grid: the Back and folder pictures
app.setupGrid = function(){
	QDUI.imagePicker(GridBackImageFile, GridBackImageFile.previousElementSibling, app.picturePicked(css => { backIcon = css; }, QDCommon.IMAGE_MAX_SIZE));
	QDUI.imagePicker(GridFolderImageFile, GridFolderImageFile.previousElementSibling, app.picturePicked(css => { folderIcon = css; }, QDCommon.IMAGE_MAX_SIZE));
	QDUI.imageDrop(GridBackZone, GridBackImageFile);
	QDUI.imageDrop(GridFolderZone, GridFolderImageFile);
	GridBackImageReset.onclick = app.pictureEdit(() => { backIcon = QDCommon.BACK_ICON; });
	GridFolderImageReset.onclick = app.pictureEdit(() => { folderIcon = QDCommon.FOLDER_ICON; });
};
// Tab Tiles: Tile | Title (which rows of the style table are shown), the title fonts (an imported theme's font is added
// when the form is filled, fillForm) and the click effect preview: it plays on the Hover sample when another effect is
// picked, and on a sample tile when it is clicked
app.setupTiles = function(){
	[TilesPartTile, TilesPartTitle].forEach(part => {
		part.onclick = () => {
			for(const button of [TilesPartTile, TilesPartTitle]){
				button.setAttribute('aria-pressed', String(button === part));
				document.getElementById(button.getAttribute('aria-controls')).hidden = button !== part;
			}
		};
	});
	QDThemes.FONTS.forEach(font => { GridCellsTitleFont.add(new Option(font.label, font.value)); });
	app.clickEffectStyle = document.head.appendChild(document.createElement('style')); // filled by updatePreviews
	GridCellsClickEffect.addEventListener('change', () => {
		app.updatePreviews(); // before the page's own change listener: the new effect's rules must be in place
		QDThemes.playClickEffect(TileHover);
	});
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)'); // e.g. Windows' "Show animations" off
	const showMotionHint = () => { ReducedMotionHint.hidden = !reducedMotion.matches; };
	showMotionHint();
	reducedMotion.addEventListener('change', showMotionHint);
	[TileNormal, TileHover].forEach(tile => {
		tile.title = QDCommon.text('settingsClickToPreview');
		tile.addEventListener('mousedown', e => { if(e.button == 0) QDThemes.playClickEffect(tile, e.clientX, e.clientY); });
	});
	BtnApplyTilePicture.onclick = () => app.applyTilePicture(text => { TilePictureStatus.textContent = text; });
};
// "Apply to tiles": after asking, the tiles the user has now get pictures of the kind chosen under New tiles get (even
// before Apply: that only sets what new tiles get). Pictures the user chose or kept stay (GridNodes.applyTilePicture).
// report(text, isBusy, isError) shows how it goes: under the button, or in the Themes tab's banner.
app.applyTilePicture = function(report){
	const kind = +GridNewTilePicture.value, label = GridNewTilePicture.selectedOptions[0].textContent;
	QDUI.dialog({ title: QDCommon.text('tilePictureApplyTitle'), message: QDCommon.text('tilePictureApplyMessage', label), okText: QDCommon.text('tilePictureApplyButton') }).then(ok => {
		if(!ok) return;
		BtnApplyTilePicture.disabled = true;
		report(QDCommon.text('tilePictureApplying'), true);
		QDClient.applyTilePicture(kind).then(count => {
			report(count ? QDCommon.text('tilePictureApplied', QDCommon.countText('countTiles', count)) : QDCommon.text('tilePictureNothing'));
		}, () => {
			report(QDCommon.text('tilePictureFailed'), false, true);
		}).finally(() => { BtnApplyTilePicture.disabled = false; });
	});
};

// Reads the settings and themes the dial uses now into the form
app.load = function(){
	QDClient.getSettings().then(settings => {
		app.settings = settings;
		QDThemes.complete(app.settings);
		app.fillForm(app.settings);
		app.updatePreviews();
		app.changes.start();
		return QDClient.getThemes();
	}).then(list => {
		app.Themes.list = list;
		app.Themes.render();
	});
};
// Messages the background page sends to every page
app.listen = function(){
	const Commands = QDCommon.Commands;
	QDClient.listen({
		[Commands.settingsChanged]: () => { // applied here or in another window: show it unless there are edits not applied yet
			if(!app.settings || app.changes.isDirty()) return;
			if(document.documentElement.lang != QDCommon.language()) location.reload(); // Another language: the page is built again in it, on the same section
			else app.load();
		},
		[Commands.showSettingsSection]: request => { // the Settings tab was already open when the user asked for a section
			if(request.tab) app.showSection(request.tab);
		}
	});
};
// ?tab=page|grid|tiles|themes|backup
app.showSection = function(name){
	const btn = name && document.getElementById('Tab' + name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() + 'Button');
	app.tabs.select(btn && btn.getAttribute('role') == 'tab' ? btn : 'TabPageButton');
};

app.download = function(data, name){
	const blob = new Blob([JSON.stringify(data, null, data.format == QDThemes.FILE_FORMAT ? '\t' : undefined)], { type: 'application/json' });
	const link = document.createElement('a');
	link.href = URL.createObjectURL(blob);
	link.download = name;
	document.body.appendChild(link);
	link.click();
	setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, DOWNLOAD_URL_LIFETIME);
};
app.readJsonFile = function(file){ // Resolves with the parsed object, or null when it isn't JSON
	return QDUI.readFile(file, true).then(text => {
		try { return JSON.parse(text); } catch(e) { return null; }
	});
};
// A banner's text, and buttons after it: actions [{ label, onclick }], optional
app.showStatus = function(element, text, isError, isBusy, actions){
	const message = document.createElement('span');
	message.textContent = text;
	element.replaceChildren(message);
	for(const action of actions || []){
		const control = document.createElement('button');
		control.type = 'button';
		control.className = 'qd-btn is-small';
		control.textContent = action.label;
		control.onclick = action.onclick;
		element.appendChild(control);
	}
	element.className = 'qd-banner' + (isError ? ' is-error' : '') + (isBusy ? ' is-busy' : '');
	element.hidden = false;
};

// ---------- previews ----------
app.updatePreviews = function(){
	if(!app.settings) return;
	const s = app.formSettings();
	BackgroundPreview.style.backgroundColor = s.backgroundColor;
	BackgroundPreview.style.backgroundImage = QDThemes.background(backgroundImage, backgroundGradient);
	QDCommon.applyImageMode(s.backgroundMode, BackgroundPreview.style);
	BackgroundImageClear.disabled = !backgroundImage;
	BackgroundGradientRow.hidden = !backgroundGradient;
	GridBackPreview.style.backgroundImage = backIcon || 'none';
	QDCommon.applyImageMode(s.grid.backIconMode, GridBackPreview.style);
	GridFolderPreview.style.backgroundImage = folderIcon || 'none';
	QDCommon.applyImageMode(s.grid.folderIconMode, GridFolderPreview.style);
	QDUI.setAccent(s.accentColor); // this window shows the accent right away

	// "None" / "Default" switch off the colour next to them
	FIELDS.forEach(field => { if(field.nullToggle) document.getElementById(field.id).disabled = document.getElementById(field.nullToggle).checked; });

	const dialBackground = QDThemes.background(backgroundImage, backgroundGradient);
	TileStage.style.backgroundColor = s.backgroundColor;
	TileStage.style.backgroundImage = dialBackground;
	const ratio = QDCommon.tileRatio(s.grid);
	QDThemes.paintTile(TileNormal, s.grid.cells, false, ratio, SAMPLE_TILE_WIDTH, SAMPLE_TILE_MAX_HEIGHT);
	QDThemes.paintTile(TileHover, s.grid.cells, true, ratio, SAMPLE_TILE_WIDTH, SAMPLE_TILE_MAX_HEIGHT);
	app.clickEffectStyle.textContent = QDThemes.clickEffectRules('.qd-tile-stage .qd-tile', s.grid.cells.clickEffect, s.grid.cells.titleColorHover).join('\n');
	app.markSameAsNormal();
	app.paintGridPreview(s, ratio, dialBackground);
	app.Themes.markCurrent(s);
};

// Tiles: a Hover value that is the same as the Normal one is drawn dashed and grey (.is-same, css/settings.css), so the
// styles that change under the pointer stand out
app.markSameAsNormal = function(){
	FIELDS.filter(field => /^GridCells.+Hover$/.test(field.id) && field.kind != 'bool').forEach(field => {
		const hover = document.getElementById(field.id), normal = document.getElementById(field.id.replace(/Hover$/, ''));
		const isNone = id => !!id && document.getElementById(id).checked; // "None" on: no colour, whatever the swatch shows
		const hoverNone = isNone(field.nullToggle), normalNone = isNone(field.nullToggle && field.nullToggle.replace(/Hover$/, ''));
		const same = hoverNone || normalNone ? hoverNone == normalNone : hover.value.toLowerCase() == normal.value.toLowerCase();
		(hover.closest('.qd-number') || hover).classList.toggle('is-same', same);
	});
};

// Grid: the page's cells in their rows, columns and shape on the dial's background, as large as the box allows; each
// cell is drawn in the titles' colour, see-through: the theme keeps that readable on its background (a border colour
// may not be, like Classic's dark grey)
app.paintGridPreview = function(s, ratio, dialBackground){
	const rows = Math.max(1, +s.grid.rows || 1), columns = Math.max(1, +s.grid.columns || 1), gap = GRID_PREVIEW_GAP, cells = s.grid.cells;
	let cellWidth = (GRID_PREVIEW_WIDTH - (columns - 1) * gap) / columns, cellHeight = cellWidth * ratio;
	if(rows * cellHeight + (rows - 1) * gap > GRID_PREVIEW_HEIGHT){
		cellHeight = (GRID_PREVIEW_HEIGHT - (rows - 1) * gap) / rows;
		cellWidth = cellHeight / ratio;
	}
	cellWidth = Math.max(GRID_PREVIEW_MIN_CELL, cellWidth);
	cellHeight = Math.max(GRID_PREVIEW_MIN_CELL, cellHeight);
	const color = QDThemes.rgba(cells.titleColor, GRID_PREVIEW_CELL_OPACITY);
	GridPreview.style.backgroundColor = s.backgroundColor;
	GridPreview.style.backgroundImage = dialBackground;
	const style = GridPreviewCells.style;
	style.width = Math.round(columns * cellWidth + (columns - 1) * gap) + 'px';
	style.height = Math.round(rows * cellHeight + (rows - 1) * gap) + 'px';
	style.backgroundImage = 'linear-gradient(' + color + ', ' + color + ')';
	style.backgroundSize = cellWidth + 'px ' + cellHeight + 'px';
	GridPreviewCaption.textContent = QDCommon.text('settingsGridPreview', QDCommon.countText('countTiles', rows * columns));
};

// ---------- themes ----------
app.Themes = { list: [], cards: [] };
// Tab Themes: the cards are drawn when the list arrives (app.load)
app.Themes.setup = function(){
	BtnThemeSave.onclick = app.Themes.saveCurrent;
	BtnThemeExport.onclick = app.Themes.exportCurrent;
	BtnThemeImport.onclick = function(){
		ThemeFile.value = null;
		ThemeFile.click();
	};
	ThemeFile.onchange = function(){
		if(ThemeFile.files[0]) app.readJsonFile(ThemeFile.files[0]).then(app.Themes.importFile);
	};
};
app.Themes.all = function(){ return QDThemes.BUILTIN.concat(app.Themes.list); };
// What the user sees of a theme: a built-in one's name and description come from the language files
app.Themes.displayName = theme => theme.builtin ? QDCommon.text(theme.nameKey) : theme.name;
app.Themes.displayDescription = theme => theme.builtin ? QDCommon.text(theme.descriptionKey) : theme.description || '';
// A built-in theme's name, as stored (English) or as shown in this language
app.Themes.isBuiltinName = function(name){
	const lower = String(name).trim().toLowerCase();
	return QDThemes.isBuiltinName(name) || QDThemes.BUILTIN.some(t => app.Themes.displayName(t).toLowerCase() == lower);
};
app.Themes.find = function(name){
	name = String(name).trim().toLowerCase();
	return app.Themes.list.filter(t => t.name.toLowerCase() == name)[0] || null;
};
app.Themes.store = function(list, callback){
	QDClient.setThemes(list).then(saved => {
		app.Themes.list = saved || [];
		app.Themes.render();
		if(callback) callback();
	});
};
app.Themes.render = function(){
	ThemeList.replaceChildren();
	app.Themes.cards = app.Themes.all().map(theme => {
		function makeElement(tag, cls, text){ const e = document.createElement(tag); if(cls) e.className = cls; if(text) e.textContent = text; return e; }
		function button(text, title, onclick, cls){ const control = makeElement('button', 'qd-btn is-small' + (cls ? ' ' + cls : ''), text); control.type = 'button'; control.title = title; control.onclick = onclick; return control; }
		const card = makeElement('article', 'qd-theme');
		const preview = makeElement('div', 'qd-theme-preview');
		preview.style.backgroundColor = theme.style.backgroundColor;
		preview.style.backgroundImage = QDThemes.background(null, theme.style.backgroundGradient);
		// Export and Delete are icons: their names are their tooltips and what a screen reader says
		function iconButton(label, title, icon, onclick){
			const control = makeElement('button', 'qd-icon-btn');
			control.type = 'button';
			control.title = title;
			control.setAttribute('aria-label', label);
			control.appendChild(app.Themes.icon(icon));
			control.onclick = onclick;
			return control;
		}
		const ratio = QDCommon.tileRatio(app.settings.grid);
		[false, true].forEach(hover => {
			const slot = makeElement('div', 'qd-tile-slot'), tile = makeElement('div', 'qd-tile');
			tile.appendChild(makeElement('div', 'qd-tile-img'));
			tile.appendChild(makeElement('div', 'qd-tile-title', QDCommon.text(hover ? 'tileHover' : 'tileExample')));
			slot.appendChild(tile);
			preview.appendChild(slot);
			QDThemes.paintTile(tile, theme.style.grid.cells, hover, ratio, SAMPLE_TILE_WIDTH, SAMPLE_TILE_MAX_HEIGHT);
		});
		card.appendChild(preview);
		const body = makeElement('div', 'qd-theme-body');
		const name = makeElement('h3', 'qd-theme-name', app.Themes.displayName(theme));
		if(theme.builtin) name.appendChild(makeElement('span', 'qd-badge', QDCommon.text('themeBuiltIn')));
		body.appendChild(name);
		const description = makeElement('p', 'qd-theme-desc', app.Themes.displayDescription(theme));
		description.title = description.textContent; // the card shows three lines of it
		body.appendChild(description);
		const actions = makeElement('div', 'qd-theme-actions');
		const use = button(QDCommon.text('themeUse'), QDCommon.text('themeUseHint'), () => { app.Themes.use(theme); });
		const current = makeElement('span', 'qd-theme-in-use'); // in place of Use, on the theme the form shows
		current.append(app.Themes.icon(app.Themes.ICONS.check), QDCommon.text('themeInUse'));
		actions.append(use, current);
		actions.appendChild(iconButton(QDCommon.text('themeExport'), QDCommon.text('themeExportHint'), app.Themes.ICONS.download, () => {
			app.download(QDThemes.toFile({ name: theme.name, description: app.Themes.displayDescription(theme), style: theme.style }), QDThemes.fileName(theme.name));
		}));
		if(!theme.builtin) actions.appendChild(iconButton(QDCommon.text('themeDelete'), QDCommon.text('themeDeleteHint'), app.Themes.ICONS.trash, () => { app.Themes.remove(theme); }));
		body.appendChild(actions);
		card.appendChild(body);
		ThemeList.appendChild(card);
		return { theme: theme, card: card, current: current, use: use };
	});
	app.Themes.markCurrent(app.formSettings());
};
app.Themes.markCurrent = function(settings){ // highlights the theme the form currently matches
	const style = QDThemes.extract(settings);
	app.Themes.cards.forEach(entry => {
		const isCurrent = QDThemes.equal(style, entry.theme.style);
		entry.card.classList.toggle('is-current', isCurrent);
		entry.current.hidden = !isCurrent;
		entry.use.hidden = entry.use.disabled = isCurrent;
	});
};
// The icons of the theme cards: the inside of a 16×16 stroked SVG
app.Themes.ICONS = Object.freeze({
	check: '<path d="M3 8.5 6.5 12 13 4.5"/>',
	download: '<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/>',
	trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'
});
app.Themes.icon = function(paths){ // built from our own markup above, never from data
	const svg = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
		+ paths + '</svg>', 'image/svg+xml').documentElement;
	return document.importNode(svg, true);
};
app.Themes.use = function(theme){
	const s = QDThemes.apply(app.formSettings(), theme.style);
	app.fillForm(s);
	app.updatePreviews();
	app.changes.mark();
	// A theme drawn for icons offers site icons for new tiles, unless they get icons already
	const offersIcons = theme.suggestsIcons && +GridNewTilePicture.value == QDCommon.TilePicture.page;
	const shown = QDCommon.text('themeShownHere', app.Themes.displayName(theme));
	app.showStatus(ThemeStatus, offersIcons ? shown + ' ' + QDCommon.text('themeSuitsIcons') : shown, false, false,
		offersIcons ? [{ label: QDCommon.text('themeUseSiteIcons'), onclick: app.Themes.useSiteIcons }] : null);
};
// The banner's "Use site icons for new tiles": sets New tiles get (applied with the theme), and offers Apply to tiles
app.Themes.useSiteIcons = function(){
	const report = (text, isBusy, isError) => app.showStatus(ThemeStatus, text, isError, isBusy);
	GridNewTilePicture.value = String(QDCommon.TilePicture.siteIcon);
	app.changes.mark();
	app.showStatus(ThemeStatus, QDCommon.text('themeSiteIconsChosen'), false, false,
		[{ label: QDCommon.text('settingsApplyTilePicture'), onclick: () => app.applyTilePicture(report) }]);
};
// Asks for a name and description: resolves to { name, description } or null
app.Themes.ask = function(title, okText, forSaving){
	const style = QDThemes.extract(app.formSettings());
	const match = app.Themes.all().filter(t => QDThemes.equal(style, t.style))[0];
	return QDUI.dialog({
		title: title,
		message: QDCommon.text('themeDialogMessage'),
		fields: [
			{ name: 'name', label: QDCommon.text('themeName'), value: match && !match.builtin ? match.name : QDCommon.text('themeNamePlaceholder'), placeholder: QDCommon.text('themeNamePlaceholder') },
			{ name: 'description', label: QDCommon.text('themeDescription'), value: match && !match.builtin ? match.description : '', placeholder: QDCommon.text('themeDescriptionPlaceholder') }
		],
		okText: okText,
		validate: function(answer){
			if(!answer.name) return QDCommon.text('themeNameMissing');
			if(answer.name.length > QDThemes.NAME_MAX_LENGTH) return QDCommon.text('themeNameTooLong', QDThemes.NAME_MAX_LENGTH);
			if(forSaving && app.Themes.isBuiltinName(answer.name)) return QDCommon.text('themeNameBuiltIn', answer.name);
			return '';
		}
	});
};
// Adds a theme to the list; a theme with the same name is replaced after confirmation
app.Themes.add = function(theme, done){
	const existing = app.Themes.find(theme.name);
	(existing ? QDUI.dialog({ title: QDCommon.text('themeReplaceTitle', existing.name), message: QDCommon.text('themeReplaceMessage'), okText: QDCommon.text('themeReplace'), danger: true }) : Promise.resolve(true)).then(ok => {
		if(!ok) return;
		app.Themes.store([theme].concat(app.Themes.list.filter(t => t !== existing)), done);
	});
};
app.Themes.saveCurrent = function(){
	app.Themes.ask(QDCommon.text('themeSaveTitle'), QDCommon.text('themeSave'), true).then(answer => {
		if(!answer) return;
		const theme = { name: answer.name, description: answer.description, style: QDThemes.extract(app.formSettings()) };
		app.Themes.add(theme, () => { app.showStatus(ThemeStatus, QDCommon.text('themeSaved', theme.name)); });
	});
};
app.Themes.exportCurrent = function(){
	app.Themes.ask(QDCommon.text('themeExportTitle'), QDCommon.text('themeExportButton'), false).then(answer => {
		if(!answer) return;
		app.download(QDThemes.toFile({ name: answer.name, description: answer.description, style: QDThemes.extract(app.formSettings()) }), QDThemes.fileName(answer.name));
	});
};
app.Themes.importFile = function(data){
	let theme;
	try { theme = QDThemes.fromFile(data); }
	catch(e){ app.showStatus(ThemeStatus, QDCommon.text(data ? e.message : 'themeFileInvalid'), true); return; }
	if(app.Themes.isBuiltinName(theme.name)) theme.name = QDCommon.text('themeImportedName', theme.name);
	app.Themes.add(theme, () => { app.showStatus(ThemeStatus, QDCommon.text('themeImported', theme.name)); });
};
app.Themes.remove = function(theme){
	QDUI.dialog({ title: QDCommon.text('themeDeleteTitle', theme.name), message: QDCommon.text('themeDeleteMessage'), okText: QDCommon.text('themeDelete'), danger: true }).then(ok => {
		if(ok) app.Themes.store(app.Themes.list.filter(t => t !== theme));
	});
};

// ---------- backup ----------
app.Backup = {};
// Tab Backup: export, import (the page reloads after an import and shows what it did: ?result=)
app.Backup.setup = function(){
	BtnExport.onclick = function(){
		QDClient.exportData().then(data => {
			app.download(data, QDCommon.BACKUP_FORMAT + '-backup-' + new Date().toISOString().slice(0, 'yyyy-mm-dd'.length) + '.json');
		});
	};
	BtnImport.onclick = function(){
		ImportFile.value = null;
		ImportFile.click();
	};
	ImportFile.onchange = function(){
		if(ImportFile.files[0]) app.readJsonFile(ImportFile.files[0]).then(app.Backup.importFile);
	};
	BtnCopySnippet.onclick = function(){
		navigator.clipboard.writeText(app.Backup.exportSnippet).then(() => {
			BtnCopySnippet.textContent = QDCommon.text('backupCopied');
			setTimeout(() => { BtnCopySnippet.textContent = QDCommon.text('backupCopySnippet'); }, COPIED_LABEL_TIME);
		}, () => { prompt(QDCommon.text('backupCopyPrompt'), app.Backup.exportSnippet); });
	};
	const result = new URLSearchParams(location.search).get('result');
	if(result) app.showStatus(ImportStatus, result);
};
// A Quick Dial NG backup or an original Quick Dial export (data: the file's content, null when it isn't JSON)
app.Backup.importFile = function(data){
	if(!data || !data.settings || !data.node || !data.settings.grid){
		app.showStatus(ImportStatus, QDCommon.text(data && data.format == QDThemes.FILE_FORMAT ? 'backupFileIsTheme' : 'backupFileInvalid'), true);
		return;
	}
	QDUI.dialog({
		title: QDCommon.text(data.format == QDCommon.BACKUP_FORMAT ? 'backupImportNgTitle' : 'backupImportOriginalTitle'),
		message: QDCommon.text('backupImportMessage'),
		okText: QDCommon.text('backupImportButton'),
		danger: true
	}).then(ok => {
		if(!ok) return;
		BtnImport.disabled = true;
		app.showStatus(ImportStatus, QDCommon.text('backupImporting'), false, true);
		QDClient.importData(data).then(result => {
			const text = QDCommon.text('backupImportResult', QDCommon.countText('countTiles', result.tiles), QDCommon.countText('countFolders', result.folders + 1),
				QDCommon.countText('countPictures', result.images), result.matched, result.created);
			location.search = '?tab=backup&result=' + encodeURIComponent(text); // Reload so the form shows the imported settings
		}, err => {
			BtnImport.disabled = false;
			app.showStatus(ImportStatus, QDCommon.text('backupImportFailed', err.message), true);
		});
	});
};
app.Backup.exportSnippet = "(async()=>{const a=(await browser.runtime.getBackgroundPage()).app;const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([JSON.stringify({version:4,settings:a.settings,node:a.node})],{type:'application/json'}));l.download='quickdial-export.json';document.body.appendChild(l);l.click();})()";
