var app = {};

// Pictures and the theme gradient have no form field of their own
var BackgroundImage = null;
var BackgroundGradient = null;
var GridBackImage = null;
var GridFolderImage = null;

document.addEventListener("DOMContentLoaded", function(event) {
	app.init();
});

// Form fields and the setting each one edits: [element id, settings path, kind, "None"/"Default" checkbox id, colour shown when null]
// Kinds: num, pct (0..1 shown as %), bool, color, color? (null = the checkbox), text
app.Fields = (function(){
	var f = [
		['MenuShowAdd', 'menuShowAdd', 'bool'],
		['ButtonOpenInNewPage', 'openQuickDialInNewPage', 'bool'],
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
	].forEach(function(p){
		['', 'Hover'].forEach(function(h){
			f.push(['GridCells' + p[0] + h, 'grid.cells.' + p[1] + h, p[2], p[3] ? 'GridCells' + p[3] + h : null, '#ffffff']);
		});
	});
	return f;
})();

app.path = {
	get: function(obj, path){ return path.split('.').reduce(function(o, k){ return o == null ? undefined : o[k]; }, obj); },
	set: function(obj, path, value){
		var keys = path.split('.'), last = keys.pop();
		keys.reduce(function(o, k){ return o[k] || (o[k] = {}); }, obj)[last] = value;
	}
};
app.clone = function(v){ return JSON.parse(JSON.stringify(v)); };

// settings -> form
app.fillForm = function(settings){
	app.Fields.forEach(function(f){
		var el = document.getElementById(f[0]), v = app.path.get(settings, f[1]);
		switch(f[2]){
			case 'bool': el.checked = !!v; break;
			case 'pct': el.value = Math.round((v == null ? 1 : v) * 100); break;
			case 'color?': document.getElementById(f[3]).checked = (v == null); el.value = v || f[4]; break;
			case 'text':
				if(el.tagName == 'SELECT' && v && !Array.prototype.some.call(el.options, function(o){ return o.value == v; })){
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
	app.Fields.forEach(function(f){
		var el = document.getElementById(f[0]), v;
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
	document.addEventListener('keydown', function(e){
		if(e.key == 'Escape') QDUI.closePopup();
	});
	try { Version.textContent = 'Version ' + browser.runtime.getManifest().version; } catch(e) { Version.textContent = ''; }
	app.tabs = QDUI.tabs(Tabs, function(){ Content.scrollTop = 0; });
	app.changes = QDUI.changes(BtnApply, Status);
	QDThemes.FONTS.forEach(function(f){ GridCellsTitleFont.add(new Option(f.label, f.value)); });

	app.Messages.getSettings(function(settings){
		app.settings = settings;
		QDThemes.complete(app.settings);
		app.fillForm(app.settings);
		app.updatePreviews();
		app.changes.start();
		app.Messages.getThemes(function(list){
			app.Themes.list = list || [];
			app.Themes.render();
		});
	});

	BtnOk.onclick = function(){
		BtnApply.onclick();
		QDUI.closePopup();
	}
	BtnApply.onclick = function(){
		if(!app.settings) return;
		app.readForm(app.settings);
		browser.runtime.sendMessage( { cmd: app.Messages.Commands.setSettings, settings: app.settings } );
		app.changes.saved('Changes applied to the dial');
	}
	BtnCancel.onclick = BtnClose.onclick = function(){
		QDUI.closePopup();
	}

	// ----- Backup -----
	BtnExport.onclick = function(){
		browser.runtime.sendMessage({ cmd: app.Messages.Commands.exportData }).then(function(data){
			app.download(data, 'quickdial-ng-backup-' + new Date().toISOString().substr(0, 10) + '.json');
		});
	}
	BtnImport.onclick = function(){
		ImportFile.value = null;
		ImportFile.click();
	}
	BtnCopySnippet.onclick = function(){
		navigator.clipboard.writeText(app.Backup.exportSnippet).then(function(){
			BtnCopySnippet.textContent = 'Copied ✓';
			setTimeout(function(){ BtnCopySnippet.textContent = 'Copy export snippet'; }, 2000);
		}, function(){ prompt('Copy this snippet:', app.Backup.exportSnippet); });
	}
	ImportFile.onchange = function(){
		if(!ImportFile.files[0]) return;
		app.readJSON(ImportFile.files[0], function(data){
			if(!data || !data.settings || !data.node || !data.settings.grid){
				app.showStatus(ImportStatus, data && data.format == 'quickdial-ng-theme' ? 'This is a theme. Import it on the Themes tab.' : 'This file is not a Quick Dial export or Quick Dial NG backup.', true);
				return;
			}
			var source = data.format == 'quickdial-ng' ? 'Quick Dial NG backup' : 'Quick Dial export';
			QDUI.dialog({
				title: 'Import this ' + source + '?',
				message: 'Your current settings and tile layout will be replaced. Bookmarks in the Quick Dial folder are kept; missing ones are created.',
				okText: 'Import',
				danger: true
			}).then(function(ok){
				if(!ok) return;
				BtnImport.disabled = true;
				app.showStatus(ImportStatus, 'Importing…', false, true);
				browser.runtime.sendMessage({ cmd: app.Messages.Commands.importData, data: data }).then(function(r){
					var text = 'Imported ' + r.tiles + ' tile' + (r.tiles == 1 ? '' : 's') + ' in ' + (r.folders + 1) + ' folder' + (r.folders ? 's' : '') + ' with ' + r.images + ' picture' + (r.images == 1 ? '' : 's') + ', plus grid and style settings. '
						+ r.matched + ' matched existing bookmarks, ' + r.created + ' bookmark' + (r.created == 1 ? ' was' : 's were') + ' created.';
					location.search = '?tab=backup&result=' + encodeURIComponent(text); // Reload so the form shows the imported settings
				}, function(err){
					BtnImport.disabled = false;
					app.showStatus(ImportStatus, 'Import failed: ' + err.message, true);
				});
			});
		});
	}

	var params = new URLSearchParams(location.search);
	if(params.get('tab') == 'backup') app.tabs.select('TabBackupButton');
	else if(params.get('tab') == 'themes') app.tabs.select('TabThemesButton');
	if(params.get('result')) app.showStatus(ImportStatus, params.get('result'));

	// ----- Pictures -----
	function picker(input, choose, apply){ // file input -> data URL -> apply(cssValue)
		if(choose) choose.onkeydown = function(e){ if(e.key == 'Enter' || e.key == ' '){ e.preventDefault(); input.click(); } };
		input.onclick = function(){ this.value = null; };
		input.onchange = function(){
			var file = input.files[0];
			if(!file) return;
			var fileReader = new FileReader();
			fileReader.onload = function(e){
				input.value = null;
				apply('url(' + e.target.result + ')');
				app.updatePreviews();
				app.changes.mark();
			};
			fileReader.readAsDataURL(file);
		};
	}
	picker(BackgroundImageFile, BackgroundImageChoose, function(v){ BackgroundImage = v; });
	picker(GridBackImageFile, GridBackImageFile.previousElementSibling, function(v){ GridBackImage = v; });
	picker(GridFolderImageFile, GridFolderImageFile.previousElementSibling, function(v){ GridFolderImage = v; });
	QDUI.imageDrop(BackgroundZone, BackgroundImageFile);
	QDUI.imageDrop(GridBackZone, GridBackImageFile);
	QDUI.imageDrop(GridFolderZone, GridFolderImageFile);

	function edit(fn){ return function(){ fn(); app.updatePreviews(); app.changes.mark(); }; }
	BackgroundImageClear.onclick = edit(function(){ BackgroundImage = null; });
	BackgroundGradientClear.onclick = edit(function(){ BackgroundGradient = null; });
	GridBackImageReset.onclick = edit(function(){ GridBackImage = 'url(/img/back.png)'; });
	GridFolderImageReset.onclick = edit(function(){ GridFolderImage = 'url(/img/folder.png)'; });

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

app.download = function(data, name){
	var blob = new Blob([JSON.stringify(data, null, data.format == 'quickdial-ng-theme' ? '\t' : undefined)], { type: 'application/json' });
	var link = document.createElement('a');
	link.href = URL.createObjectURL(blob);
	link.download = name;
	document.body.appendChild(link);
	link.click();
	setTimeout(function(){ URL.revokeObjectURL(link.href); link.remove(); }, 1000);
};
app.readJSON = function(file, callback){ // callback(parsed object, or null when it isn't JSON)
	var fileReader = new FileReader();
	fileReader.onload = function(e){
		var data = null;
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
	var s = app.current();
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
	app.Fields.forEach(function(f){ if(f[3]) document.getElementById(f[0]).disabled = document.getElementById(f[3]).checked; });

	TileStage.style.backgroundColor = s.backgroundColor;
	TileStage.style.backgroundImage = QDThemes.background(BackgroundImage, BackgroundGradient);
	var ratio = (+s.grid.ratioY || 3) / (+s.grid.ratioX || 4);
	app.paintTile(TileNormal, s.grid.cells, false, ratio);
	app.paintTile(TileHover, s.grid.cells, true, ratio);
	app.Themes.markCurrent(s);
};

// Draws a sample tile (.qd-tile in a .qd-tile-slot, 152 px wide) the way the dial would
app.paintTile = function(tile, c, hover, ratio){
	var h = hover ? 'Hover' : '';
	var n = function(name){ return Math.max(0, +c[name + h] || 0); };
	var margin = n('margin'), border = n('borderSize'), showTitle = !!c['title' + h], titleHeight = n('titleHeight');
	var overlay = c.titlePosition == 1, effect = +c.hoverEffect || 0;
	var height = Math.round((152 - 2 * margin - 2 * border) * ratio) + 2 * border + (showTitle && !overlay ? titleHeight : 0);
	tile.parentNode.style.height = (Math.min(height, 200) + 2 * margin) + 'px';
	tile.classList.toggle('is-overlay', overlay);
	var s = tile.style;
	s.margin = margin + 'px';
	s.opacity = Math.min(1, n('opacity'));
	s.border = border + 'px solid ' + c['borderColor' + h];
	s.borderRadius = n('borderRadius') + 'px';
	s.backgroundColor = QDThemes.rgba(c['backgroundColor' + h], n('backgroundOpacity'));
	s.boxShadow = QDThemes.shadow(c['shadow' + h]);
	s.backdropFilter = n('blur') ? 'blur(' + n('blur') + 'px)' : 'none';
	s.transform = hover && effect == 2 ? 'translateY(-4px)' : hover && effect == 3 ? 'scale(1.04)' : 'none';
	var title = tile.lastElementChild.style;
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
	return app.Themes.list.filter(function(t){ return t.name.toLowerCase() == name; })[0] || null;
};
app.Themes.store = function(list, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.setThemes, themes: list }).then(function(saved){
		app.Themes.list = saved || [];
		app.Themes.render();
		if(callback) callback();
	});
};
app.Themes.render = function(){
	ThemeList.replaceChildren();
	app.Themes.cards = app.Themes.all().map(function(theme){
		function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text) e.textContent = text; return e; }
		function button(text, title, onclick, cls){ var b = el('button', 'qd-btn is-small' + (cls ? ' ' + cls : ''), text); b.type = 'button'; b.title = title; b.onclick = onclick; return b; }
		var card = el('article', 'qd-theme');
		var preview = el('div', 'qd-theme-preview');
		preview.style.backgroundColor = theme.style.backgroundColor;
		preview.style.backgroundImage = QDThemes.background(null, theme.style.backgroundGradient);
		var ratio = (+app.settings.grid.ratioY || 3) / (+app.settings.grid.ratioX || 4);
		[false, true].forEach(function(hover){
			var slot = el('div', 'qd-tile-slot'), tile = el('div', 'qd-tile');
			tile.appendChild(el('div', 'qd-tile-img'));
			tile.appendChild(el('div', 'qd-tile-title', hover ? 'Hover' : 'Example'));
			slot.appendChild(tile);
			preview.appendChild(slot);
			app.paintTile(tile, theme.style.grid.cells, hover, ratio);
		});
		card.appendChild(preview);
		var body = el('div', 'qd-theme-body');
		var name = el('h3', 'qd-theme-name', theme.name);
		if(theme.builtin) name.appendChild(el('span', 'qd-badge', 'Built-in'));
		var current = el('span', 'qd-badge is-accent', 'In use');
		name.appendChild(current);
		body.appendChild(name);
		body.appendChild(el('p', 'qd-theme-desc', theme.description || ''));
		var actions = el('div', 'qd-theme-actions');
		var use = button('Use', 'Show this theme here; Apply or OK keeps it', function(){ app.Themes.use(theme); }, 'is-primary');
		actions.appendChild(use);
		actions.appendChild(button('Export…', 'Save this theme as a .json file', function(){ app.download(QDThemes.toFile(theme), QDThemes.fileName(theme.name)); }));
		if(!theme.builtin) actions.appendChild(button('Delete', 'Remove this theme from the list', function(){ app.Themes.remove(theme); }));
		body.appendChild(actions);
		card.appendChild(body);
		ThemeList.appendChild(card);
		return { theme: theme, card: card, badge: current, use: use };
	});
	app.Themes.markCurrent(app.current());
};
app.Themes.markCurrent = function(settings){ // highlights the theme the form currently matches
	var style = QDThemes.extract(settings);
	app.Themes.cards.forEach(function(c){
		var on = QDThemes.equal(style, c.theme.style);
		c.card.classList.toggle('is-current', on);
		c.badge.hidden = !on;
		c.use.disabled = on;
	});
};
app.Themes.use = function(theme){
	var s = QDThemes.apply(app.current(), theme.style);
	app.fillForm(s);
	app.updatePreviews();
	app.changes.mark();
	app.showStatus(ThemeStatus, '"' + theme.name + '" is shown in all tabs. Apply or OK puts it on the dial; Cancel keeps your previous look.');
};
// Asks for a name and description: resolves to { name, description } or null
app.Themes.ask = function(title, okText, forSaving){
	var style = QDThemes.extract(app.current());
	var match = app.Themes.all().filter(function(t){ return QDThemes.equal(style, t.style); })[0];
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
	var existing = app.Themes.find(theme.name);
	(existing ? QDUI.dialog({ title: 'Replace "' + existing.name + '"?', message: 'You already have a theme with this name.', okText: 'Replace', danger: true }) : Promise.resolve(true)).then(function(ok){
		if(!ok) return;
		app.Themes.store([theme].concat(app.Themes.list.filter(function(t){ return t !== existing; })), done);
	});
};
app.Themes.saveCurrent = function(){
	app.Themes.ask('Save current as theme', 'Save', true).then(function(v){
		if(!v) return;
		var theme = { name: v.name, description: v.description, style: QDThemes.extract(app.current()) };
		app.Themes.add(theme, function(){ app.showStatus(ThemeStatus, 'Saved "' + theme.name + '" to your themes.'); });
	});
};
app.Themes.exportCurrent = function(){
	app.Themes.ask('Export current as theme', 'Export', false).then(function(v){
		if(!v) return;
		app.download(QDThemes.toFile({ name: v.name, description: v.description, style: QDThemes.extract(app.current()) }), QDThemes.fileName(v.name));
	});
};
app.Themes.importFile = function(data){
	var theme;
	try { theme = QDThemes.fromFile(data); }
	catch(e){ app.showStatus(ThemeStatus, data ? e.message : 'This file is not a Quick Dial NG theme.', true); return; }
	if(QDThemes.isBuiltinName(theme.name)) theme.name += ' (imported)';
	app.Themes.add(theme, function(){ app.showStatus(ThemeStatus, 'Imported "' + theme.name + '". Choose Use to try it.'); });
};
app.Themes.remove = function(theme){
	QDUI.dialog({ title: 'Delete "' + theme.name + '"?', message: 'The theme is removed from this list. Your current settings stay as they are.', okText: 'Delete', danger: true }).then(function(ok){
		if(ok) app.Themes.store(app.Themes.list.filter(function(t){ return t !== theme; }));
	});
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
	exportData: 12,
	importData: 13,
	getThemes: 14,
	setThemes: 15,
	settingsChanged: 100,
	gridNodesLoaded: 101
};
app.Messages.getSettings = function(callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getSettings }).then(callback);
};
app.Messages.getThemes = function(callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getThemes }).then(callback, function(){ callback([]); });
};
app.Backup = {};
app.Backup.exportSnippet = "(async()=>{const a=(await browser.runtime.getBackgroundPage()).app;const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([JSON.stringify({version:4,settings:a.settings,node:a.node})],{type:'application/json'}));l.download='quickdial-export.json';document.body.appendChild(l);l.click();})()";
