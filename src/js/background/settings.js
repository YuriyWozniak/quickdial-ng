// Quick Dial NG — background page: stored settings and node tree, their upgrades from older
// versions, and the user's own themes. Storage keys: version, settings, node, themes, the pictures picked in
// Settings (picture_*, see Settings.PICTURES); tile pictures: images.js.
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
				snapshotDelay: 2000
			},
			root: 'Quick Dial',
		}
	}, QDThemes.CLASSIC);
};

app.Settings.LOAD_RETRIES = 2; // More attempts when the stored data can't be read, LOAD_RETRY_DELAY ms apart
app.Settings.LOAD_RETRY_DELAY = 1000;

// Loads settings and nodes, then calls back; it always does, so the dial pages waiting on app.ready never hang.
// When the stored data can't be read even after a few attempts, the defaults are used, and nothing is saved
// automatically (that would replace the user's data) until the user saves settings or imports a backup.
app.Settings.init = function(callback){
	app.Settings._load(app.Settings.LOAD_RETRIES).then(() => { if(callback) callback(); });
};
app.Settings._load = function(retries){ // Promise: resolves once app.settings and app.node are set
	return app.Settings._read().catch(e => {
		if(retries > 0){
			return new Promise(resolve => setTimeout(resolve, app.Settings.LOAD_RETRY_DELAY)).then(() => app.Settings._load(retries - 1));
		}
		console.error('Quick Dial NG: the stored settings could not be loaded; the defaults are used and not saved', e);
		app.Settings._loadFailed = true;
		app.settings = app.Settings.defaults();
		app.node = { children: [] };
	});
};
app.Settings._read = function(){
	const pictureKeys = Object.keys(app.Settings.PICTURES); // Read with the settings: the dial needs them for its first paint
	return browser.storage.local.get(['version', 'settings', 'node', 'themes'].concat(pictureKeys)).then(data => { // Tile pictures are stored under their own keys and loaded on demand (see app.Images)
		app.Themes.list = QDThemes.cleanList(data.themes);
		delete data.themes;
		const stored = {};
		for(const key of pictureKeys){
			if(key in data) stored[key] = data[key];
			delete data[key];
		}
		if(Object.keys(data).length == 0 || !data.settings){
			data = { version: 3, settings: app.Settings.defaults(), node: { children: [] } };
		}
		data = app.Settings._upgrade(data);
		app.settings = data.settings;
		app.node = data.node;
		const { resolved, missing } = app.Settings.resolvePictures(app.settings, stored);
		app.Settings._savedPictures = {}; // What storage holds, so the next save writes or removes only what differs
		for(const key in stored) app.Settings._savedPictures[key] = resolved.includes(key) ? stored[key] : null;
		const inline = app.Settings._pictures(app.settings);
		let migrated = Object.keys(inline).some(key => !resolved.includes(key)) // Pictures still inside the stored settings (before 0.5.1) move to their own keys,
			|| Object.keys(stored).some(key => !resolved.includes(key)) // a stored picture nothing points at is removed,
			|| missing.length > 0; // and the default replaces a picture that is gone
		if(missing.length) console.warn('Quick Dial NG: pictures missing from storage, the defaults are used: ' + missing.join(', '));
		if(app.Settings.dropObsolete(app.settings)) migrated = true;
		if(app.Settings.migrateToolbar(app.settings)) migrated = true;
		if(app.Settings.migrateIcons(app.settings)) migrated = true;
		QDThemes.complete(app.settings); // Style settings added in later versions (0.4.0: glass, shadows, title font...) start at their Classic values
		if(data.version == 4){ // Upgrade Data Version: move inline images out of the node tree into their own keys (WebP)
			return app.Images.extractFromTree(app.node)
				.catch(e => console.error('Quick Dial NG: moving the pictures out of the tile tree failed', e))
				.then(() => new Promise(resolve => app.Settings.save(resolve)));
		}
		app.Settings._lastSaved = app.Settings._serialize();
		if(migrated){ app.Settings._lastSaved = null; app.Settings.save(); } // Store the migrated data once
	});
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
	const hasLegacySwitch = ('openQuickDialInNewPage' in settings);
	if(!app.Settings.TOOLBAR_ACTIONS.includes(settings.toolbarAction))
		settings.toolbarAction = !hasLegacySwitch ? 'settings' : settings.openQuickDialInNewPage === false ? 'current' : 'newtab';
	else if(!hasLegacySwitch) return false;
	delete settings.openQuickDialInNewPage;
	return true;
};

// The default folder and Back pictures were redrawn as SVG (0.5.1): settings that still
// point at the old PNG defaults move to the new ones; the user's own pictures stay.
// The loading picture is no longer a setting (the dial always shows its SVG spinner).
// Returns true when `settings` changed.
app.Settings.LEGACY_ICONS = { 'url(/img/back.png)': 'url(/img/back.svg)', 'url(/img/folder.png)': 'url(/img/folder.svg)' };
app.Settings.migrateIcons = function(settings){
	const grid = settings && settings.grid;
	if(!grid) return false;
	let changed = false;
	for(const key of ['backIcon', 'folderIcon']){
		const next = app.Settings.LEGACY_ICONS[grid[key]];
		if(next){ grid[key] = next; changed = true; }
	}
	if('loadingIcon' in grid){ delete grid.loadingIcon; changed = true; }
	return changed;
};

// Settings nothing reads any more: the start page timer (replaced by the home page override in 0.3.5)
// and the fixed picture size (the original Quick Dial made pictures follow the tile proportions, see SiteInfos).
// Returns true when `settings` changed.
app.Settings.dropObsolete = function(settings){
	if(!settings) return false;
	let changed = false;
	if('startpageTimeout' in settings){ delete settings.startpageTimeout; changed = true; }
	const cells = settings.grid && settings.grid.cells;
	for(const key of ['previewWidth', 'previewHeight']){
		if(cells && key in cells){ delete cells[key]; changed = true; }
	}
	return changed;
};

app.Settings.update = function(settings, callback){ // Save new settings: the user's own, so saved even after a failed load
	app.settings = settings;
	delete app.Settings._loadFailed;
	app.Settings.save(callback);
};
// Pictures the user picks in Settings (the background, the Back and folder icons) are data URLs of up to
// several megabytes. In app.settings they stay CSS values like the built-in ones, so the pages use them as
// before; in storage each has its own key and the stored settings hold STORED_PICTURE in its place. Saving
// a tile change then writes a few kilobytes, not the pictures again. { storage key: path in the settings }
app.Settings.PICTURES = { 'picture_background': ['backgroundImage'], 'picture_backIcon': ['grid', 'backIcon'], 'picture_folderIcon': ['grid', 'folderIcon'] };
app.Settings.STORED_PICTURE = '1';
app.Settings._savedPictures = {}; // { storage key: value } as stored, to write only the pictures that changed
app.Settings.isPicture = value => typeof value == 'string' && value.includes('data:'); // The user's own picture, not a built-in one
app.Settings._field = function(settings, path, value){ // Reads a field at `path`, or sets it when `value` is given
	const owner = path.length == 1 ? settings : settings && settings[path[0]];
	if(!owner) return undefined;
	const name = path[path.length - 1];
	if(arguments.length > 2) owner[name] = value;
	return owner[name];
};
app.Settings._pictures = function(settings){ // { storage key: data URL } of the user's own pictures in `settings`
	const result = {};
	for(const key in app.Settings.PICTURES){
		const value = app.Settings._field(settings, app.Settings.PICTURES[key]);
		if(app.Settings.isPicture(value)) result[key] = value;
	}
	return result;
};
// Puts the stored pictures (`stored`: { storage key: data URL }) back in place of STORED_PICTURE. A picture
// that is missing falls back to the default (no background, the built-in icons). Returns { resolved, missing }:
// the keys of the pictures put back and of those replaced by the default.
app.Settings.resolvePictures = function(settings, stored){
	const resolved = [], missing = [];
	let defaults = null;
	for(const key in app.Settings.PICTURES){
		const path = app.Settings.PICTURES[key];
		if(app.Settings._field(settings, path) != app.Settings.STORED_PICTURE) continue;
		if(stored && app.Settings.isPicture(stored[key])){
			app.Settings._field(settings, path, stored[key]);
			resolved.push(key);
		} else {
			if(!defaults) defaults = app.Settings.defaults();
			app.Settings._field(settings, path, app.Settings._field(defaults, path));
			missing.push(key);
		}
	}
	return { resolved, missing };
};
app.Settings._serialize = function(){ // Settings and node tree only: no pictures (STORED_PICTURE in their place), no transient "__" fields
	let settings = app.settings;
	const pictures = app.Settings._pictures(settings);
	if(Object.keys(pictures).length){ // A copy of the levels that hold them; app.settings keeps its pictures
		settings = Object.assign({}, settings);
		if(settings.grid) settings.grid = Object.assign({}, settings.grid);
		for(const key in pictures) app.Settings._field(settings, app.Settings.PICTURES[key], app.Settings.STORED_PICTURE);
	}
	return JSON.stringify({ version: 5, settings, node: app.node }, (key, value) => key.startsWith('__') ? undefined : value);
};
app.Settings.rememberBackground = function(){ // Keep the background colour where dial pages can read it before settings load (see dialbg.js)
	if(app.Settings._loadFailed) return; // The defaults in use are not the user's colour
	try {
		const color = app.settings && app.settings.backgroundColor;
		if(!color) localStorage.removeItem('dialBackgroundColor');
		else if(localStorage.getItem('dialBackgroundColor') != color) localStorage.setItem('dialBackgroundColor', color);
	} catch(e){}
};
app.Settings._saveCallbacks = [];
// Save settings (batched, and skipped when nothing changed). callback(error) runs in every case: error is
// undefined once saved, an Error when it could not be (it is tried again on the next save).
app.Settings.save = function(callback){
	if(!app.settings) return;
	app.Settings.rememberBackground(); // Every settings change (settings page, import, migration) passes through here
	if(callback) app.Settings._saveCallbacks.push(callback);
	if(app.Settings._saveTimer) return;
	app.Settings._saveTimer = setTimeout(() => {
		delete app.Settings._saveTimer;
		const callbacks = app.Settings._saveCallbacks;
		app.Settings._saveCallbacks = [];
		const done = error => { for(const cb of callbacks) cb(error); };
		if(app.Settings._loadFailed){ // Keep what is stored (see Settings.init)
			done(new Error('The stored settings could not be loaded, so nothing is saved over them.'));
			return;
		}
		const json = app.Settings._serialize();
		const pictures = app.Settings._pictures(app.settings), saved = app.Settings._savedPictures;
		const changed = {}, removed = [];
		for(const key in app.Settings.PICTURES){
			if(key in pictures){ if(pictures[key] !== saved[key]) changed[key] = pictures[key]; }
			else if(key in saved) removed.push(key);
		}
		if(json == app.Settings._lastSaved && !Object.keys(changed).length && !removed.length){
			done();
			return;
		}
		// The pictures are written together with the settings that point at them; one no longer used is removed after
		const data = Object.assign(json == app.Settings._lastSaved ? {} : JSON.parse(json), changed);
		(Object.keys(data).length ? browser.storage.local.set(data) : Promise.resolve()).then(() => removed.length ? browser.storage.local.remove(removed) : undefined).then(() => {
			app.Settings._lastSaved = json;
			app.Settings._savedPictures = pictures;
			done();
		}, e => {
			console.error('Quick Dial NG: saving the settings failed', e);
			done(e || new Error('Saving the settings failed'));
		});
	}, 100);
};

app.Themes = { list: [] }; // The user's own themes ({ name, description, style }); built-in ones live in themes.js
app.Themes.save = function(list){ // Promise<saved list>
	app.Themes.list = QDThemes.cleanList(list);
	const done = () => app.Themes.list;
	return (app.Themes.list.length ? browser.storage.local.set({ themes: app.Themes.list }) : browser.storage.local.remove('themes')).then(done, done);
};
