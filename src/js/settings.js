// The Settings page (its own tab). Form elements are reached by their id (window.BtnApply...).
/* exported app */
// eslint-disable-next-line no-var -- a window property, like on the other pages
var app = {};

// Pictures and the theme gradient have no form field of their own
let BackgroundImage = null;
let BackgroundGradient = null;
let GridBackImage = null;
let GridFolderImage = null;

document.addEventListener("DOMContentLoaded", event => {
	app.init();
});

// Form fields and the setting each one edits: [element id, settings path, kind, "None"/"Default" checkbox id, colour shown when null]
// Kinds: num, pct (0..1 shown as %), bool, color, color? (null = the checkbox), text
app.Fields = (function(){
	const f = [
		['MenuShowAdd', 'menuShowAdd', 'bool'],
		['ToolbarAction', 'toolbarAction', 'text'],
		['BackgroundColor', 'backgroundColor', 'color'],
		['BackgroundMode', 'backgroundMode', 'num'],
		['AccentColor', 'accentColor', 'color?', 'AccentDefault', '#0061e0'],
		['GridRoot', 'grid.root', 'text'],
		['GridRows', 'grid.rows', 'num'],
		['GridColumns', 'grid.columns', 'num'],
		['GridRatioX', 'grid.ratioX', 'num'],
		['GridRatioY', 'grid.ratioY', 'num'],
		['GridMargins', 'grid.margin', 'num'],
		['GridOpenBookmarksIn', 'grid.openBookmarkMethod', 'num'],
		['GridOpenFoldersIn', 'grid.openFolderMethod', 'num'],
		['GridBackNode', 'grid.backNode', 'bool'],
		['GridBackMode', 'grid.backIconMode', 'num'],
		['GridFolderMode', 'grid.folderIconMode', 'num'],
		['GridCellsHoverEffect', 'grid.cells.hoverEffect', 'num'],
		['GridCellsTitleFont', 'grid.cells.titleFont', 'text'],
		['GridCellsTitleBold', 'grid.cells.titleBold', 'bool'],
		['GridCellsTitlePosition', 'grid.cells.titlePosition', 'num'],
		['GridCellsSnapshotDelay', 'grid.cells.snapshotDelay', 'num']
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
			f.push(['GridCells' + p[0] + h, 'grid.cells.' + p[1] + h, p[2], p[3] ? 'GridCells' + p[3] + h : null, '#ffffff']);
		});
	});
	return f;
})();

app.path = {
	get: function(obj, path){ return path.split('.').reduce((o, k) => { return o == null ? undefined : o[k]; }, obj); },
	set: function(obj, path, value){
		const keys = path.split('.'), last = keys.pop();
		keys.reduce((o, k) => { return o[k] || (o[k] = {}); }, obj)[last] = value;
	}
};
app.clone = function(v){ return JSON.parse(JSON.stringify(v)); };

// settings -> form
app.fillForm = function(settings){
	app.Fields.forEach(f => {
		const el = document.getElementById(f[0]), v = app.path.get(settings, f[1]);
		switch(f[2]){
			case 'bool': el.checked = !!v; break;
			case 'pct': el.value = Math.round((v == null ? 1 : v) * 100); break;
			case 'color?': document.getElementById(f[3]).checked = (v == null); el.value = v || f[4]; break;
			case 'text':
				if(el.tagName == 'SELECT' && v && !Array.prototype.some.call(el.options, o => { return o.value == v; })){
					el.add(new Option('Custom (' + v.split(',')[0].replace(/["']/g, '') + ')', v)); // a font from an imported theme
				}
				el.value = v == null ? '' : v;
				break;
			default: el.value = v == null ? '' : v;
		}
	});
	BackgroundImage = settings.backgroundImage;
	BackgroundGradient = settings.backgroundGradient;
	GridBackImage = settings.grid.backIcon;
	GridFolderImage = settings.grid.folderIcon;
};
// form -> settings (written into `settings`, which is returned)
app.readForm = function(settings){
	app.Fields.forEach(f => {
		const el = document.getElementById(f[0]);
		let v;
		switch(f[2]){
			case 'bool': v = el.checked; break;
			case 'num': v = el.value === '' || isNaN(+el.value) ? app.path.get(settings, f[1]) : +el.value; break;
			case 'pct': v = el.value === '' || isNaN(+el.value) ? app.path.get(settings, f[1]) : Math.min(100, Math.max(0, +el.value)) / 100; break;
			case 'color?': v = document.getElementById(f[3]).checked ? null : el.value; break;
			default: v = el.value;
		}
		app.path.set(settings, f[1], v);
	});
	settings.backgroundImage = BackgroundImage;
	settings.backgroundGradient = BackgroundGradient;
	settings.grid.backIcon = GridBackImage;
	settings.grid.folderIcon = GridFolderImage;
	return settings;
};
// What the form shows right now, as a full settings object (the saved settings are not touched)
app.current = function(){ return app.readForm(app.clone(app.settings)); };

app.init = function(){
	// Settings has its own tab (opened from the toolbar button, the dial's menu or Firefox's Add-ons page)
	try { Version.textContent = 'Version ' + browser.runtime.getManifest().version; } catch(e) { Version.textContent = ''; }
	app.tabs = QDUI.tabs(Tabs, btn => {
		Content.scrollTop = 0;
		PanelTitle.textContent = btn.textContent.trim();
		history.replaceState(null, '', '?tab=' + btn.id.replace(/^Tab|Button$/g, '').toLowerCase()); // a reload stays on this section
	});
	app.changes = QDUI.changes(BtnApply, Status, BtnDiscard);
	QDThemes.FONTS.forEach(f => { GridCellsTitleFont.add(new Option(f.label, f.value)); });

	app.load();
	app.Messages.init();

	BtnApply.onclick = function(){
		if(!app.settings || !app.changes.isDirty()) return;
		app.readForm(app.settings);
		browser.runtime.sendMessage( { cmd: app.Messages.Commands.setSettings, settings: app.settings } );
		app.changes.saved('Changes applied to the dial');
	}
	BtnDiscard.onclick = function(){
		app.fillForm(app.settings);
		app.updatePreviews();
		ThemeStatus.hidden = true;
		app.changes.discarded('Changes discarded');
	}
	BtnOpenDial.onclick = function(){
		browser.tabs.create({ url: '/dial.html' });
	}
	document.addEventListener('keydown', e => {
		if((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() == 's'){ e.preventDefault(); BtnApply.onclick(); }
	});
	window.addEventListener('beforeunload', e => { // closing the tab with changes not applied
		if(app.changes.isDirty()){ e.preventDefault(); e.returnValue = ''; }
	});

	// ----- Backup -----
	BtnExport.onclick = function(){
		browser.runtime.sendMessage({ cmd: app.Messages.Commands.exportData }).then(data => {
			app.download(data, 'quickdial-ng-backup-' + new Date().toISOString().substr(0, 10) + '.json');
		});
	}
	BtnImport.onclick = function(){
		ImportFile.value = null;
		ImportFile.click();
	}
	BtnCopySnippet.onclick = function(){
		navigator.clipboard.writeText(app.Backup.exportSnippet).then(() => {
			BtnCopySnippet.textContent = 'Copied ✓';
			setTimeout(() => { BtnCopySnippet.textContent = 'Copy export snippet'; }, 2000);
		}, () => { prompt('Copy this snippet:', app.Backup.exportSnippet); });
	}
	ImportFile.onchange = function(){
		if(!ImportFile.files[0]) return;
		app.readJSON(ImportFile.files[0], data => {
			if(!data || !data.settings || !data.node || !data.settings.grid){
				app.showStatus(ImportStatus, data && data.format == 'quickdial-ng-theme' ? 'This is a theme. Import it on the Themes tab.' : 'This file is not a Quick Dial export or Quick Dial NG backup.', true);
				return;
			}
			const source = data.format == 'quickdial-ng' ? 'Quick Dial NG backup' : 'Quick Dial export';
			QDUI.dialog({
				title: 'Import this ' + source + '?',
				message: 'Your current settings and tile layout will be replaced. Bookmarks in the Quick Dial folder are kept; missing ones are created.',
				okText: 'Import',
				danger: true
			}).then(ok => {
				if(!ok) return;
				BtnImport.disabled = true;
				app.showStatus(ImportStatus, 'Importing…', false, true);
				browser.runtime.sendMessage({ cmd: app.Messages.Commands.importData, data: data }).then(r => {
					const text = 'Imported ' + r.tiles + ' tile' + (r.tiles == 1 ? '' : 's') + ' in ' + (r.folders + 1) + ' folder' + (r.folders ? 's' : '') + ' with ' + r.images + ' picture' + (r.images == 1 ? '' : 's') + ', plus grid and style settings. '
						+ r.matched + ' matched existing bookmarks, ' + r.created + ' bookmark' + (r.created == 1 ? ' was' : 's were') + ' created.';
					location.search = '?tab=backup&result=' + encodeURIComponent(text); // Reload so the form shows the imported settings
				}, err => {
					BtnImport.disabled = false;
					app.showStatus(ImportStatus, 'Import failed: ' + err.message, true);
				});
			});
		});
	}

	const params = new URLSearchParams(location.search);
	app.showSection(params.get('tab'));
	if(params.get('result')) app.showStatus(ImportStatus, params.get('result'));

	// ----- Pictures -----
	function picker(input, choose, apply){ // file input -> data URL -> apply(cssValue)
		if(choose) choose.onkeydown = function(e){ if(e.key == 'Enter' || e.key == ' '){ e.preventDefault(); input.click(); } };
		input.onclick = function(){ this.value = null; };
		input.onchange = function(){
			const file = input.files[0];
			if(!file) return;
			const fileReader = new FileReader();
			fileReader.onload = function(e){
				input.value = null;
				apply('url(' + e.target.result + ')');
				app.updatePreviews();
				app.changes.mark();
			};
			fileReader.readAsDataURL(file);
		};
	}
	picker(BackgroundImageFile, BackgroundImageChoose, v => { BackgroundImage = v; });
	picker(GridBackImageFile, GridBackImageFile.previousElementSibling, v => { GridBackImage = v; });
	picker(GridFolderImageFile, GridFolderImageFile.previousElementSibling, v => { GridFolderImage = v; });
	QDUI.imageDrop(BackgroundZone, BackgroundImageFile);
	QDUI.imageDrop(GridBackZone, GridBackImageFile);
	QDUI.imageDrop(GridFolderZone, GridFolderImageFile);

	function edit(fn){ return function(){ fn(); app.updatePreviews(); app.changes.mark(); }; }
	BackgroundImageClear.onclick = edit(() => { BackgroundImage = null; });
	BackgroundGradientClear.onclick = edit(() => { BackgroundGradient = null; });
	GridBackImageReset.onclick = edit(() => { GridBackImage = 'url(/img/back.svg)'; });
	GridFolderImageReset.onclick = edit(() => { GridFolderImage = 'url(/img/folder.svg)'; });

	// ----- Themes -----
	BtnThemeSave.onclick = app.Themes.saveCurrent;
	BtnThemeExport.onclick = app.Themes.exportCurrent;
	BtnThemeImport.onclick = function(){
		ThemeFile.value = null;
		ThemeFile.click();
	}
	ThemeFile.onchange = function(){
		if(ThemeFile.files[0]) app.readJSON(ThemeFile.files[0], app.Themes.importFile);
	}

	// Live previews follow every edit
	document.addEventListener('input', app.updatePreviews);
	document.addEventListener('change', app.updatePreviews);
};

// Reads the settings and themes the dial uses now into the form
app.load = function(){
	app.Messages.getSettings(settings => {
		app.settings = settings;
		QDThemes.complete(app.settings);
		app.fillForm(app.settings);
		app.updatePreviews();
		app.changes.start();
		app.Messages.getThemes(list => {
			app.Themes.list = list || [];
			app.Themes.render();
		});
	});
};
// ?tab=page|grid|tiles|themes|backup
app.showSection = function(name){
	const btn = name && document.getElementById('Tab' + name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() + 'Button');
	app.tabs.select(btn && btn.getAttribute('role') == 'tab' ? btn : 'TabPageButton');
};

app.download = function(data, name){
	const blob = new Blob([JSON.stringify(data, null, data.format == 'quickdial-ng-theme' ? '\t' : undefined)], { type: 'application/json' });
	const link = document.createElement('a');
	link.href = URL.createObjectURL(blob);
	link.download = name;
	document.body.appendChild(link);
	link.click();
	setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
};
app.readJSON = function(file, callback){ // callback(parsed object, or null when it isn't JSON)
	const fileReader = new FileReader();
	fileReader.onload = function(e){
		let data = null;
		try { data = JSON.parse(e.target.result); } catch(err) {}
		callback(data);
	};
	fileReader.readAsText(file);
};
app.showStatus = function(el, text, isError, isBusy){
	el.textContent = text;
	el.className = 'qd-banner' + (isError ? ' is-error' : '') + (isBusy ? ' is-busy' : '');
	el.hidden = false;
};

// ---------- previews ----------
app.updatePreviews = function(){
	if(!app.settings) return;
	const s = app.current();
	BackgroundPreview.style.backgroundColor = s.backgroundColor;
	BackgroundPreview.style.backgroundImage = QDThemes.background(BackgroundImage, BackgroundGradient);
	QDUI.applyMode(BackgroundPreview, s.backgroundMode);
	BackgroundImageClear.disabled = !BackgroundImage;
	BackgroundGradientRow.hidden = !BackgroundGradient;
	GridBackPreview.style.backgroundImage = GridBackImage || 'none';
	QDUI.applyMode(GridBackPreview, s.grid.backIconMode);
	GridFolderPreview.style.backgroundImage = GridFolderImage || 'none';
	QDUI.applyMode(GridFolderPreview, s.grid.folderIconMode);
	QDUI.setAccent(s.accentColor); // this window shows the accent right away

	// "None" / "Default" switch off the colour next to them
	app.Fields.forEach(f => { if(f[3]) document.getElementById(f[0]).disabled = document.getElementById(f[3]).checked; });

	TileStage.style.backgroundColor = s.backgroundColor;
	TileStage.style.backgroundImage = QDThemes.background(BackgroundImage, BackgroundGradient);
	const ratio = (+s.grid.ratioY || 3) / (+s.grid.ratioX || 4);
	app.paintTile(TileNormal, s.grid.cells, false, ratio);
	app.paintTile(TileHover, s.grid.cells, true, ratio);
	app.Themes.markCurrent(s);
};

// Draws a sample tile (.qd-tile in a .qd-tile-slot, 152 px wide) the way the dial would
app.paintTile = function(tile, c, hover, ratio){
	const h = hover ? 'Hover' : '';
	const n = function(name){ return Math.max(0, +c[name + h] || 0); };
	const margin = n('margin'), border = n('borderSize'), showTitle = !!c['title' + h], titleHeight = n('titleHeight');
	const overlay = c.titlePosition == 1, effect = +c.hoverEffect || 0;
	const height = Math.round((152 - 2 * margin - 2 * border) * ratio) + 2 * border + (showTitle && !overlay ? titleHeight : 0);
	tile.parentNode.style.height = (Math.min(height, 200) + 2 * margin) + 'px';
	tile.classList.toggle('is-overlay', overlay);
	const s = tile.style;
	s.margin = margin + 'px';
	s.opacity = Math.min(1, n('opacity'));
	s.border = border + 'px solid ' + c['borderColor' + h];
	s.borderRadius = n('borderRadius') + 'px';
	s.backgroundColor = QDThemes.rgba(c['backgroundColor' + h], n('backgroundOpacity'));
	s.boxShadow = QDThemes.shadow(c['shadow' + h]);
	s.backdropFilter = n('blur') ? 'blur(' + n('blur') + 'px)' : 'none';
	s.transform = hover && effect == 2 ? 'translateY(-4px)' : hover && effect == 3 ? 'scale(1.04)' : 'none';
	const title = tile.lastElementChild.style;
	title.display = showTitle ? '' : 'none';
	title.height = titleHeight + 'px';
	title.lineHeight = titleHeight + 'px';
	title.fontSize = n('titleFontSize') + 'pt';
	title.fontFamily = c.titleFont;
	title.fontWeight = c.titleBold ? '600' : 'normal';
	title.color = c['titleColor' + h];
	title.backgroundColor = QDThemes.rgba(c['titleBackgroundColor' + h], n('titleBackgroundOpacity'));
	title.borderTop = n('titleBorderSize') + 'px solid ' + c['borderColor' + h];
};

// ---------- themes ----------
app.Themes = { list: [], cards: [] };
app.Themes.all = function(){ return QDThemes.BUILTIN.concat(app.Themes.list); };
app.Themes.find = function(name){
	name = String(name).trim().toLowerCase();
	return app.Themes.list.filter(t => { return t.name.toLowerCase() == name; })[0] || null;
};
app.Themes.store = function(list, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.setThemes, themes: list }).then(saved => {
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
		const ratio = (+app.settings.grid.ratioY || 3) / (+app.settings.grid.ratioX || 4);
		[false, true].forEach(hover => {
			const slot = el('div', 'qd-tile-slot'), tile = el('div', 'qd-tile');
			tile.appendChild(el('div', 'qd-tile-img'));
			tile.appendChild(el('div', 'qd-tile-title', hover ? 'Hover' : 'Example'));
			slot.appendChild(tile);
			preview.appendChild(slot);
			app.paintTile(tile, theme.style.grid.cells, hover, ratio);
		});
		card.appendChild(preview);
		const body = el('div', 'qd-theme-body');
		const name = el('h3', 'qd-theme-name', theme.name);
		if(theme.builtin) name.appendChild(el('span', 'qd-badge', 'Built-in'));
		const current = el('span', 'qd-badge is-accent', 'In use');
		name.appendChild(current);
		body.appendChild(name);
		body.appendChild(el('p', 'qd-theme-desc', theme.description || ''));
		const actions = el('div', 'qd-theme-actions');
		const use = button('Use', 'Show this theme here; Apply or OK keeps it', () => { app.Themes.use(theme); }, 'is-primary');
		actions.appendChild(use);
		actions.appendChild(button('Export…', 'Save this theme as a .json file', () => { app.download(QDThemes.toFile(theme), QDThemes.fileName(theme.name)); }));
		if(!theme.builtin) actions.appendChild(button('Delete', 'Remove this theme from the list', () => { app.Themes.remove(theme); }));
		body.appendChild(actions);
		card.appendChild(body);
		ThemeList.appendChild(card);
		return { theme: theme, card: card, badge: current, use: use };
	});
	app.Themes.markCurrent(app.current());
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
	const s = QDThemes.apply(app.current(), theme.style);
	app.fillForm(s);
	app.updatePreviews();
	app.changes.mark();
	app.showStatus(ThemeStatus, '"' + theme.name + '" is shown here only. Apply puts it on the dial; Discard changes keeps your previous look.');
};
// Asks for a name and description: resolves to { name, description } or null
app.Themes.ask = function(title, okText, forSaving){
	const style = QDThemes.extract(app.current());
	const match = app.Themes.all().filter(t => { return QDThemes.equal(style, t.style); })[0];
	return QDUI.dialog({
		title: title,
		message: 'From the current settings: background color, page margin, tile and title styles and the accent color.',
		fields: [
			{ name: 'name', label: 'Name', value: match && !match.builtin ? match.name : 'My theme', placeholder: 'My theme' },
			{ name: 'description', label: 'Description (optional)', value: match && !match.builtin ? match.description : '', placeholder: 'What it looks like' }
		],
		okText: okText,
		validate: function(v){
			if(!v.name) return 'Please enter a name.';
			if(v.name.length > 60) return 'Please use at most 60 characters.';
			if(forSaving && QDThemes.isBuiltinName(v.name)) return '"' + v.name + '" is a built-in theme. Please choose another name.';
			return '';
		}
	});
};
// Adds a theme to the list; a theme with the same name is replaced after confirmation
app.Themes.add = function(theme, done){
	const existing = app.Themes.find(theme.name);
	(existing ? QDUI.dialog({ title: 'Replace "' + existing.name + '"?', message: 'You already have a theme with this name.', okText: 'Replace', danger: true }) : Promise.resolve(true)).then(ok => {
		if(!ok) return;
		app.Themes.store([theme].concat(app.Themes.list.filter(t => { return t !== existing; })), done);
	});
};
app.Themes.saveCurrent = function(){
	app.Themes.ask('Save current as theme', 'Save', true).then(v => {
		if(!v) return;
		const theme = { name: v.name, description: v.description, style: QDThemes.extract(app.current()) };
		app.Themes.add(theme, () => { app.showStatus(ThemeStatus, 'Saved "' + theme.name + '" to your themes.'); });
	});
};
app.Themes.exportCurrent = function(){
	app.Themes.ask('Export current as theme', 'Export', false).then(v => {
		if(!v) return;
		app.download(QDThemes.toFile({ name: v.name, description: v.description, style: QDThemes.extract(app.current()) }), QDThemes.fileName(v.name));
	});
};
app.Themes.importFile = function(data){
	let theme;
	try { theme = QDThemes.fromFile(data); }
	catch(e){ app.showStatus(ThemeStatus, data ? e.message : 'This file is not a Quick Dial NG theme.', true); return; }
	if(QDThemes.isBuiltinName(theme.name)) theme.name += ' (imported)';
	app.Themes.add(theme, () => { app.showStatus(ThemeStatus, 'Imported "' + theme.name + '". Choose Use to try it.'); });
};
app.Themes.remove = function(theme){
	QDUI.dialog({ title: 'Delete "' + theme.name + '"?', message: 'The theme is removed from this list. Your current settings stay as they are.', okText: 'Delete', danger: true }).then(ok => {
		if(ok) app.Themes.store(app.Themes.list.filter(t => { return t !== theme; }));
	});
};

app.Messages = {};
app.Messages.Commands = QDCommon.Commands;
app.Messages.init = function(){
	browser.runtime.onMessage.addListener(request => {
		switch(request.cmd){
			case app.Messages.Commands.settingsChanged: // applied here or in another window: show it unless there are edits not applied yet
				if(app.settings && !app.changes.isDirty()) app.load();
				break;
			case app.Messages.Commands.showSettingsSection: // the Settings tab was already open when the user asked for a section
				if(request.tab) app.showSection(request.tab);
				break;
		}
	});
};
app.Messages.getSettings = function(callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getSettings }).then(callback);
};
app.Messages.getThemes = function(callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getThemes }).then(callback, () => { callback([]); });
};
app.Backup = {};
app.Backup.exportSnippet = "(async()=>{const a=(await browser.runtime.getBackgroundPage()).app;const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([JSON.stringify({version:4,settings:a.settings,node:a.node})],{type:'application/json'}));l.download='quickdial-export.json';document.body.appendChild(l);l.click();})()";
