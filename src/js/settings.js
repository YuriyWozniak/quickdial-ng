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
const SAMPLE_TILE_WIDTH = 152; // px: the sample tiles of the Tiles tab and the theme cards (.qd-tile-slot, css/ui.css)
const SAMPLE_TILE_MAX_HEIGHT = 200; // px: taller shapes are cut off
const COPIED_LABEL_TIME = 2000; // ms the Copy export snippet button says Copied
const DOWNLOAD_URL_LIFETIME = 1000; // ms a downloaded file's object URL is kept

document.addEventListener('DOMContentLoaded', event => {
	app.init();
});

// Form fields and the setting each one edits: { id: element id, path: settings path, kind, nullToggle: id of the
// "None"/"Default" checkbox (color? only), nullColor: colour shown while that checkbox is on }
// Kinds: num, pct (0..1 shown as %), bool, color, color? (null = the checkbox), text
const FIELDS = (function(){
	const field = (id, path, kind, nullToggle, nullColor) => ({ id, path, kind, nullToggle, nullColor });
	const fields = [
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
		field('GridCellsSnapshotDelay', 'grid.cells.snapshotDelay', 'num')
	];
	// Tile and title styles come in pairs: GridCells<Name> / GridCells<Name>Hover
	[
		['Margins', 'margin', 'num'], ['Opacity', 'opacity', 'pct'], ['BorderSize', 'borderSize', 'num'], ['BorderRadius', 'borderRadius', 'num'],
		['BorderColor', 'borderColor', 'color'], ['BackgroundColor', 'backgroundColor', 'color?', 'BackgroundTransparent'],
		['BackgroundOpacity', 'backgroundOpacity', 'pct'], ['Blur', 'blur', 'num'], ['Shadow', 'shadow', 'num'],
		['Title', 'title', 'bool'], ['TitleHeight', 'titleHeight', 'num'], ['TitleFontSize', 'titleFontSize', 'num'],
		['TitleBorderSize', 'titleBorderSize', 'num'], ['TitleColor', 'titleColor', 'color'],
		['TitleBackgroundColor', 'titleBackgroundColor', 'color?', 'TitleBackgroundTransparent'], ['TitleBackgroundOpacity', 'titleBackgroundOpacity', 'pct']
	].forEach(p => {
		['', 'Hover'].forEach(h => {
			fields.push(field('GridCells' + p[0] + h, 'grid.cells.' + p[1] + h, p[2], p[3] ? 'GridCells' + p[3] + h : null, '#ffffff'));
		});
	});
	return fields;
})();

app.objectPath = {
	get: function(obj, path){ return path.split('.').reduce((o, k) => { return o == null ? undefined : o[k]; }, obj); },
	set: function(obj, path, value){
		const keys = path.split('.'), last = keys.pop();
		keys.reduce((o, k) => { return o[k] || (o[k] = {}); }, obj)[last] = value;
	}
};
app.clone = function(v){ return JSON.parse(JSON.stringify(v)); };

// settings -> form
app.fillForm = function(settings){
	FIELDS.forEach(f => {
		const el = document.getElementById(f.id), v = app.objectPath.get(settings, f.path);
		switch(f.kind){
			case 'bool': el.checked = !!v; break;
			case 'pct': el.value = Math.round((v == null ? 1 : v) * 100); break;
			case 'color?': document.getElementById(f.nullToggle).checked = (v == null); el.value = v || f.nullColor; break;
			case 'text':
				if(el.tagName == 'SELECT' && v && !Array.prototype.some.call(el.options, o => { return o.value == v; })){
					el.add(new Option(QDCommon.text('settingsCustomFont', v.split(',')[0].replace(/["']/g, '')), v)); // a font from an imported theme
				}
				el.value = v == null ? '' : v;
				break;
			default: el.value = v == null ? '' : v;
		}
	});
	backgroundImage = settings.backgroundImage;
	backgroundGradient = settings.backgroundGradient;
	backIcon = settings.grid.backIcon;
	folderIcon = settings.grid.folderIcon;
};
// form -> settings (written into `settings`, which is returned)
app.readForm = function(settings){
	FIELDS.forEach(f => {
		const el = document.getElementById(f.id);
		let v;
		switch(f.kind){
			case 'bool': v = el.checked; break;
			case 'num': v = el.value === '' || isNaN(+el.value) ? app.objectPath.get(settings, f.path) : +el.value; break;
			case 'pct': v = el.value === '' || isNaN(+el.value) ? app.objectPath.get(settings, f.path) : Math.min(100, Math.max(0, +el.value)) / 100; break;
			case 'color?': v = document.getElementById(f.nullToggle).checked ? null : el.value; break;
			default: v = el.value;
		}
		app.objectPath.set(settings, f.path, v);
	});
	settings.backgroundImage = backgroundImage;
	settings.backgroundGradient = backgroundGradient;
	settings.grid.backIcon = backIcon;
	settings.grid.folderIcon = folderIcon;
	return settings;
};
// What the form shows right now, as a full settings object (the saved settings are not touched)
app.formSettings = function(){ return app.readForm(app.clone(app.settings)); };

app.init = function(){
	// Settings has its own tab (opened from the toolbar button, the dial's menu or Firefox's Add-ons page)
	QDUI.localize();
	try { Version.textContent = QDCommon.text('settingsVersion', browser.runtime.getManifest().version); } catch(e) { Version.textContent = ''; }
	app.tabs = QDUI.initTabs(Tabs, btn => {
		Content.scrollTop = 0;
		PanelTitle.textContent = btn.textContent.trim();
		history.replaceState(null, '', '?tab=' + btn.id.replace(/^Tab|Button$/g, '').toLowerCase()); // a reload stays on this section
	});
	app.changes = QDUI.trackChanges(BtnApply, Status, BtnDiscard);
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
// QDCommon.toWebp), then stored by fn(url("...")). When a second picture is chosen before the first one is
// ready, only the second is kept.
app.picturePicked = (fn, maxSize) => {
	let latest = 0;
	return dataUrl => {
		const pick = ++latest;
		QDCommon.toWebp(dataUrl, maxSize).then(webp => {
			if(pick == latest) app.pictureEdit(fn)(QDCommon.toCssUrl(webp));
		});
	};
};
// Tab Page: the background picture (the rest of the tab is plain form fields, FIELDS)
app.setupPage = function(){
	QDUI.imagePicker(BackgroundImageFile, BackgroundImageChoose, app.picturePicked(css => { backgroundImage = css; }, QDCommon.BACKGROUND_MAX_SIZE));
	QDUI.imageDrop(BackgroundZone, BackgroundImageFile);
	BackgroundImageClear.onclick = app.pictureEdit(() => { backgroundImage = null; });
	BackgroundGradientClear.onclick = app.pictureEdit(() => { backgroundGradient = null; });
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
// Tab Tiles: the title fonts (an imported theme's font is added when the form is filled, fillForm) and the click
// effect preview: it plays on the Hover sample when another effect is picked, and on a sample tile when it is clicked
app.setupTiles = function(){
	QDThemes.FONTS.forEach(f => { GridCellsTitleFont.add(new Option(f.label, f.value)); });
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
			if(app.settings && !app.changes.isDirty()) app.load();
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
app.showStatus = function(el, text, isError, isBusy){
	el.textContent = text;
	el.className = 'qd-banner' + (isError ? ' is-error' : '') + (isBusy ? ' is-busy' : '');
	el.hidden = false;
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
	FIELDS.forEach(f => { if(f.nullToggle) document.getElementById(f.id).disabled = document.getElementById(f.nullToggle).checked; });

	TileStage.style.backgroundColor = s.backgroundColor;
	TileStage.style.backgroundImage = QDThemes.background(backgroundImage, backgroundGradient);
	const ratio = QDCommon.tileRatio(s.grid);
	app.paintTile(TileNormal, s.grid.cells, false, ratio);
	app.paintTile(TileHover, s.grid.cells, true, ratio);
	app.clickEffectStyle.textContent = QDThemes.clickEffectRules('.qd-tile-stage .qd-tile', s.grid.cells.clickEffect, s.grid.cells.titleColorHover).join('\n');
	app.Themes.markCurrent(s);
};

// Draws a sample tile (.qd-tile in a .qd-tile-slot, SAMPLE_TILE_WIDTH px wide) the way the dial would
app.paintTile = function(tile, cells, hover, ratio){
	const suffix = hover ? 'Hover' : '';
	const num = function(name){ return Math.max(0, +cells[name + suffix] || 0); };
	const margin = num('margin'), border = num('borderSize'), showTitle = !!cells['title' + suffix], titleHeight = num('titleHeight');
	const titleOverlay = cells.titlePosition == QDThemes.TitlePosition.over;
	const height = Math.round((SAMPLE_TILE_WIDTH - 2 * margin - 2 * border) * ratio) + 2 * border + (showTitle && !titleOverlay ? titleHeight : 0);
	tile.parentNode.style.height = (Math.min(height, SAMPLE_TILE_MAX_HEIGHT) + 2 * margin) + 'px';
	tile.classList.toggle('is-overlay', titleOverlay);
	const style = tile.style;
	style.margin = margin + 'px';
	style.opacity = Math.min(1, num('opacity'));
	style.border = border + 'px solid ' + cells['borderColor' + suffix];
	style.borderRadius = num('borderRadius') + 'px';
	style.backgroundColor = QDThemes.rgba(cells['backgroundColor' + suffix], num('backgroundOpacity'));
	style.boxShadow = QDThemes.shadow(cells['shadow' + suffix]);
	style.backdropFilter = num('blur') ? 'blur(' + num('blur') + 'px)' : 'none';
	const moves = hover && !window.matchMedia('(prefers-reduced-motion: reduce)').matches; // as on the dial: no lift or zoom then
	style.transform = (moves && QDThemes.hoverTransform(cells.hoverEffect)) || 'none';
	const title = tile.lastElementChild.style;
	title.display = showTitle ? '' : 'none';
	title.height = titleHeight + 'px';
	title.lineHeight = titleHeight + 'px';
	title.fontSize = num('titleFontSize') + 'pt';
	title.fontFamily = cells.titleFont;
	title.fontWeight = cells.titleBold ? '600' : 'normal';
	title.color = cells['titleColor' + suffix];
	title.backgroundColor = QDThemes.rgba(cells['titleBackgroundColor' + suffix], num('titleBackgroundOpacity'));
	title.borderTop = num('titleBorderSize') + 'px solid ' + cells['borderColor' + suffix];
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
	return app.Themes.list.filter(t => { return t.name.toLowerCase() == name; })[0] || null;
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
		function el(tag, cls, text){ const e = document.createElement(tag); if(cls) e.className = cls; if(text) e.textContent = text; return e; }
		function button(text, title, onclick, cls){ const b = el('button', 'qd-btn is-small' + (cls ? ' ' + cls : ''), text); b.type = 'button'; b.title = title; b.onclick = onclick; return b; }
		const card = el('article', 'qd-theme');
		const preview = el('div', 'qd-theme-preview');
		preview.style.backgroundColor = theme.style.backgroundColor;
		preview.style.backgroundImage = QDThemes.background(null, theme.style.backgroundGradient);
		const ratio = QDCommon.tileRatio(app.settings.grid);
		[false, true].forEach(hover => {
			const slot = el('div', 'qd-tile-slot'), tile = el('div', 'qd-tile');
			tile.appendChild(el('div', 'qd-tile-img'));
			tile.appendChild(el('div', 'qd-tile-title', QDCommon.text(hover ? 'tileHover' : 'tileExample')));
			slot.appendChild(tile);
			preview.appendChild(slot);
			app.paintTile(tile, theme.style.grid.cells, hover, ratio);
		});
		card.appendChild(preview);
		const body = el('div', 'qd-theme-body');
		const name = el('h3', 'qd-theme-name', app.Themes.displayName(theme));
		if(theme.builtin) name.appendChild(el('span', 'qd-badge', QDCommon.text('themeBuiltIn')));
		const current = el('span', 'qd-badge is-accent', QDCommon.text('themeInUse'));
		name.appendChild(current);
		body.appendChild(name);
		body.appendChild(el('p', 'qd-theme-desc', app.Themes.displayDescription(theme)));
		const actions = el('div', 'qd-theme-actions');
		const use = button(QDCommon.text('themeUse'), QDCommon.text('themeUseHint'), () => { app.Themes.use(theme); }, 'is-primary');
		actions.appendChild(use);
		actions.appendChild(button(QDCommon.text('themeExport'), QDCommon.text('themeExportHint'), () => { app.download(QDThemes.toFile({ name: theme.name, description: app.Themes.displayDescription(theme), style: theme.style }), QDThemes.fileName(theme.name)); }));
		if(!theme.builtin) actions.appendChild(button(QDCommon.text('themeDelete'), QDCommon.text('themeDeleteHint'), () => { app.Themes.remove(theme); }));
		body.appendChild(actions);
		card.appendChild(body);
		ThemeList.appendChild(card);
		return { theme: theme, card: card, badge: current, use: use };
	});
	app.Themes.markCurrent(app.formSettings());
};
app.Themes.markCurrent = function(settings){ // highlights the theme the form currently matches
	const style = QDThemes.extract(settings);
	app.Themes.cards.forEach(c => {
		const on = QDThemes.equal(style, c.theme.style);
		c.card.classList.toggle('is-current', on);
		c.badge.hidden = !on;
		c.use.disabled = on;
	});
};
app.Themes.use = function(theme){
	const s = QDThemes.apply(app.formSettings(), theme.style);
	app.fillForm(s);
	app.updatePreviews();
	app.changes.mark();
	app.showStatus(ThemeStatus, QDCommon.text('themeShownHere', app.Themes.displayName(theme)));
};
// Asks for a name and description: resolves to { name, description } or null
app.Themes.ask = function(title, okText, forSaving){
	const style = QDThemes.extract(app.formSettings());
	const match = app.Themes.all().filter(t => { return QDThemes.equal(style, t.style); })[0];
	return QDUI.dialog({
		title: title,
		message: QDCommon.text('themeDialogMessage'),
		fields: [
			{ name: 'name', label: QDCommon.text('themeName'), value: match && !match.builtin ? match.name : QDCommon.text('themeNamePlaceholder'), placeholder: QDCommon.text('themeNamePlaceholder') },
			{ name: 'description', label: QDCommon.text('themeDescription'), value: match && !match.builtin ? match.description : '', placeholder: QDCommon.text('themeDescriptionPlaceholder') }
		],
		okText: okText,
		validate: function(v){
			if(!v.name) return QDCommon.text('themeNameMissing');
			if(v.name.length > QDThemes.NAME_MAX_LENGTH) return QDCommon.text('themeNameTooLong', QDThemes.NAME_MAX_LENGTH);
			if(forSaving && app.Themes.isBuiltinName(v.name)) return QDCommon.text('themeNameBuiltIn', v.name);
			return '';
		}
	});
};
// Adds a theme to the list; a theme with the same name is replaced after confirmation
app.Themes.add = function(theme, done){
	const existing = app.Themes.find(theme.name);
	(existing ? QDUI.dialog({ title: QDCommon.text('themeReplaceTitle', existing.name), message: QDCommon.text('themeReplaceMessage'), okText: QDCommon.text('themeReplace'), danger: true }) : Promise.resolve(true)).then(ok => {
		if(!ok) return;
		app.Themes.store([theme].concat(app.Themes.list.filter(t => { return t !== existing; })), done);
	});
};
app.Themes.saveCurrent = function(){
	app.Themes.ask(QDCommon.text('themeSaveTitle'), QDCommon.text('themeSave'), true).then(v => {
		if(!v) return;
		const theme = { name: v.name, description: v.description, style: QDThemes.extract(app.formSettings()) };
		app.Themes.add(theme, () => { app.showStatus(ThemeStatus, QDCommon.text('themeSaved', theme.name)); });
	});
};
app.Themes.exportCurrent = function(){
	app.Themes.ask(QDCommon.text('themeExportTitle'), QDCommon.text('themeExportButton'), false).then(v => {
		if(!v) return;
		app.download(QDThemes.toFile({ name: v.name, description: v.description, style: QDThemes.extract(app.formSettings()) }), QDThemes.fileName(v.name));
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
		if(ok) app.Themes.store(app.Themes.list.filter(t => { return t !== theme; }));
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
		QDClient.importData(data).then(r => {
			const text = QDCommon.text('backupImportResult', QDCommon.countText('countTiles', r.tiles), QDCommon.countText('countFolders', r.folders + 1),
				QDCommon.countText('countPictures', r.images), r.matched, r.created);
			location.search = '?tab=backup&result=' + encodeURIComponent(text); // Reload so the form shows the imported settings
		}, err => {
			BtnImport.disabled = false;
			app.showStatus(ImportStatus, QDCommon.text('backupImportFailed', err.message), true);
		});
	});
};
app.Backup.exportSnippet = "(async()=>{const a=(await browser.runtime.getBackgroundPage()).app;const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([JSON.stringify({version:4,settings:a.settings,node:a.node})],{type:'application/json'}));l.download='quickdial-export.json';document.body.appendChild(l);l.click();})()";
