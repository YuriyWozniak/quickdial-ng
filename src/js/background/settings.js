// Quick Dial NG — background page: stored settings and node tree, their upgrades from older
// versions, and the user's own themes. Storage keys: version, settings, node, themes (pictures: images.js).
app.Settings = {};

app.Settings.defaults = function(){ // Default settings of a new install: layout and behaviour here, the look from the Classic theme
	return QDThemes.apply({
		backgroundImage: null,
		backgroundMode: 0,
		menuShowAdd: true,
		toolbarAction: 'settings',
		grid: {
			rows: 4,
			columns: 5,
			ratioX: 4,
			ratioY: 3,
			backNode: true,
			backIcon: 'url(/img/back.svg)',
			backIconMode: 3,
			folderIcon: 'url(/img/folder.svg)',
			folderIconMode: 0,
			openBookmarkMethod: 0,
			openFolderMethod: 0,
			cells: {
				previewWidth: 1200,
				previewHeight: 710,
				snapshotDelay: 2000
			},
			root: 'Quick Dial',
		}
	}, QDThemes.CLASSIC);
};

app.Settings.init = function(callback){ // Load settings and nodes
	browser.storage.local.get(['version', 'settings', 'node', 'themes']).then(data => { // Images are stored under their own keys and loaded on demand (see app.Images)
		app.Themes.list = QDThemes.cleanList(data.themes);
		delete data.themes;
		if(Object.keys(data).length == 0 || !data.settings){
			data = { version: 3, settings: app.Settings.defaults(), node: { children: [] } };
		}
		data = app.Settings._upgrade(data);
		app.settings = data.settings;
		app.node = data.node;
		let obsolete = ('startpageTimeout' in app.settings); // Start page timer, replaced by the home page override (0.3.5)
		delete app.settings.startpageTimeout;
		if(app.Settings.migrateToolbar(app.settings)) obsolete = true;
		if(app.Settings.migrateIcons(app.settings)) obsolete = true;
		QDThemes.complete(app.settings); // Style settings added in later versions (0.4.0: glass, shadows, title font...) start at their Classic values
		if(data.version == 4){ // Upgrade Data Version: move inline images out of the node tree into their own keys (WebP)
			app.Images.extractFromTree(app.node).then(() => app.Settings.save(callback));
			return;
		}
		app.Settings._lastSaved = app.Settings._serialize();
		if(obsolete){ app.Settings._lastSaved = null; app.Settings.save(); } // Drop the old field from storage once
		if(callback) callback();
	}, () => console.log('Error loading data'));
};

// Brings data stored by the original Quick Dial (versions 1 to 4) up to version 4; returns the data.
// Version 4 data still has its pictures inline: Settings.init moves them out.
app.Settings._upgrade = function(data){
	if(!data.version){ // Version 1: settings at the top level
		data.version = 2;
		data.grid.backNode = true;
		data.grid.backIcon = 'url(/img/back.svg)';
		data.grid.folderIcon = 'url(/img/folder.svg)';
		data.grid.cells.backgroundColor = null;
		data.grid.cells.backgroundColorHover = null;
		data.grid.cells.titleBackgroundColor = null;
		data.grid.cells.titleBackgroundColorHover = null;
		delete data.grid.cells.backIcon;
		delete data.grid.cells.folderIcon;
		delete data.grid.cells.loadingIcon;
		delete data.grid.cells.backPanel;
	}
	if(data.version == 2){ // Version 2: the node tree inside the settings
		const oldData = data;
		data = { version: 3, settings: oldData, node: oldData.grid.node };
		delete data.settings.version;
		delete data.settings.grid.node;
		app.settings = data.settings;
		app.node = data.node;
		browser.storage.local.clear().then(() => app.Settings.save());
	}
	if(data.version == 3){
		data.version = 4;
		const s = data.settings, cells = s.grid.cells;
		s.backgroundMode = 0;
		s.grid.backIconMode = 3;
		s.grid.folderIconMode = 0;
		cells.opacity = 1;
		cells.opacityHover = 1;
		cells.borderSize = 1;
		cells.borderSizeHover = cells.borderSize;
		cells.titleHover = cells.title;
		cells.titleHeightHover = cells.titleHeight;
		cells.titleFontSizeHover = cells.titleFontSize;
		cells.titleBorderSize = 1;
		cells.titleBorderSizeHover = cells.titleBorderSize;
		app.Settings.save();
	}
	if(data.version == 4){ // Fields added in the original's 4.x releases
		const s = data.settings, grid = s.grid;
		if(!grid.cells.snapshotDelay) grid.cells.snapshotDelay = 2000;
		if(grid.ratioAuto == true || grid.ratioAuto == false){
			delete grid.ratioAuto;
			grid.ratioX = 4;
			grid.ratioY = 3;
		}
		if(!grid.ratioX){
			grid.ratioX = 4;
			grid.ratioY = 3;
		}
		if(!(s.menuShowAdd == true) && !(s.menuShowAdd == false)) s.menuShowAdd = true;
		if(!grid.openBookmarkMethod && grid.openBookmarkMethod != 0){
			grid.openBookmarkMethod = 0;
			grid.openFolderMethod = 0;
		}
		if(!s.openQuickDialInNewPage && s.openQuickDialInNewPage != false) s.openQuickDialInNewPage = true;
	}
	return data;
};

// What the toolbar button opens: 'settings', 'newtab' or 'current' (0.5.0). Before, a switch chose
// between the dial in a new tab or the current tab; existing installs keep what they had.
// Returns true when `settings` changed.
app.Settings.TOOLBAR_ACTIONS = ['settings', 'newtab', 'current'];
app.Settings.migrateToolbar = function(settings){
	if(!settings) return false;
	const old = ('openQuickDialInNewPage' in settings);
	if(!app.Settings.TOOLBAR_ACTIONS.includes(settings.toolbarAction))
		settings.toolbarAction = !old ? 'settings' : settings.openQuickDialInNewPage === false ? 'current' : 'newtab';
	else if(!old) return false;
	delete settings.openQuickDialInNewPage;
	return true;
};

// The default folder and Back pictures were redrawn as SVG (0.5.1): settings that still
// point at the old PNG defaults move to the new ones; the user's own pictures stay.
// The loading picture is no longer a setting (the dial always shows its SVG spinner).
// Returns true when `settings` changed.
app.Settings.ICONS = { 'url(/img/back.png)': 'url(/img/back.svg)', 'url(/img/folder.png)': 'url(/img/folder.svg)' };
app.Settings.migrateIcons = function(settings){
	const grid = settings && settings.grid;
	if(!grid) return false;
	let changed = false;
	for(const key of ['backIcon', 'folderIcon']){
		const next = app.Settings.ICONS[grid[key]];
		if(next){ grid[key] = next; changed = true; }
	}
	if('loadingIcon' in grid){ delete grid.loadingIcon; changed = true; }
	return changed;
};

app.Settings.update = function(settings, callback){ // Save new settings
	app.settings = settings;
	app.Settings.save(callback);
};
app.Settings._serialize = function(){ // Settings and node tree only (no images, no transient "__" fields)
	return JSON.stringify({ version: 5, settings: app.settings, node: app.node }, (key, value) => key.startsWith('__') ? undefined : value);
};
app.Settings.rememberBackground = function(){ // Keep the background colour where dial pages can read it before settings load (see dialbg.js)
	try {
		const color = app.settings && app.settings.backgroundColor;
		if(!color) localStorage.removeItem('dialBackgroundColor');
		else if(localStorage.getItem('dialBackgroundColor') != color) localStorage.setItem('dialBackgroundColor', color);
	} catch(e){}
};
app.Settings._saveCallbacks = [];
app.Settings.save = function(callback){ // Save settings (batched, and skipped when nothing changed)
	if(!app.settings) return;
	app.Settings.rememberBackground(); // Every settings change (settings page, import, migration) passes through here
	if(callback) app.Settings._saveCallbacks.push(callback);
	if(app.Settings._saveTimer) return;
	app.Settings._saveTimer = setTimeout(() => {
		delete app.Settings._saveTimer;
		const callbacks = app.Settings._saveCallbacks;
		app.Settings._saveCallbacks = [];
		const done = () => { for(const cb of callbacks) cb(); };
		const json = app.Settings._serialize();
		if(json == app.Settings._lastSaved){
			done();
			return;
		}
		browser.storage.local.set(JSON.parse(json)).then(() => {
			app.Settings._lastSaved = json;
			done();
		}, () => console.log('Error saving settings'));
	}, 100);
};

app.Themes = { list: [] }; // The user's own themes ({ name, description, style }); built-in ones live in themes.js
app.Themes.save = function(list){ // Promise<saved list>
	app.Themes.list = QDThemes.cleanList(list);
	const done = () => app.Themes.list;
	return (app.Themes.list.length ? browser.storage.local.set({ themes: app.Themes.list }) : browser.storage.local.remove('themes')).then(done, done);
};
