/* exported app */
// The dial page (dial.html). `app` is its controller: it gets the settings and the tiles from the background page,
// follows the background page's messages, handles the mouse and the keyboard, and runs the tile commands (new
// bookmark, delete...). js/grid.js (`dial`) draws the tiles. Both are window properties: the tests, the benchmark
// probe and the screenshot maker reach them.
// eslint-disable-next-line no-var
var app = {
	path: (function(){ // The folder shown: '/' or '/Work/' (?path=/Work, from a folder tile's link)
		const path = new URL(window.location).searchParams.get('path');
		return path ? path + '/' : '/';
	})(),
	RETRY_DELAY: 500, // ms after the page loads: no settings yet and no answer pending means asking the background page again
	PROPERTIES_WIDTH: 560, // the tile Properties popup (it shrinks to fit its content)
	PROPERTIES_HEIGHT: 590,
	BLOCKED_SCHEMES: /^(javascript|data|vbscript):$/i // address schemes a new bookmark can't have: scripts and inline data
};

document.addEventListener('DOMContentLoaded', () => {
	document.body.style.backgroundColor = new URL(window.location).searchParams.get('bg');
	app.init();
	dial.init();
	setTimeout(() => { // Safety net for when the background page could not be reached and no broadcast arrived
		if(!app.settings && !app._waitingForBackground) app.init();
	}, app.RETRY_DELAY);
});

// ----- Input -----
window.addEventListener('resize', () => {
	if(app.settings) dial.updateGridLayout();
});
window.addEventListener('wheel', e => {
	if(e.deltaY) app.turnPage(e.deltaY > 0 ? 1 : -1);
});
window.addEventListener('keyup', e => {
	if(e.key == 'PageDown') app.turnPage(1);
	else if(e.key == 'PageUp') app.turnPage(-1);
});
window.addEventListener('keydown', e => { // Enter on a tile reached with Tab opens it: the click effect shows too
	const link = e.key == 'Enter' && !e.repeat && app.settings ? document.activeElement : null;
	if(link && link.tagName == 'A' && dial.cellIndex(link) >= 0) dial.showClick(link);
});
// The tiles: one listener each for the whole page, not one per cell (the grid is rebuilt on every settings change)
document.addEventListener('mousedown', e => { app._onMouseDown(e); });
document.addEventListener('dragstart', e => { app._onDragStart(e); });
document.addEventListener('dragover', e => { app._onDragOver(e); });
document.addEventListener('drop', e => { app._onDrop(e); });

app.init = function(){
	app._waitingForBackground = true;
	app.getSettings().then(settings => {
		app._waitingForBackground = false;
		app.Settings._changed(settings);
		app.getNode(app.path).then(app.GridNodes._changed);
		app.listen();
	});
};

// ----- The background page -----
// The dial reads from it directly when it runs in the same process (app.bg, its `app`), instead of copying the
// settings, the tiles and their pictures through messages (QDClient).
// Never rejects: no settings resolves with null.
app.getSettings = function(){
	return browser.runtime.getBackgroundPage().then(page => {
		app.bg = (page && page.app) ? page.app : null;
		if(!app.bg) return QDClient.getSettings();
		return Promise.resolve(app.bg.ready).then(() => app.bg.settings); // At browser start the background page may still be loading its settings
	}).catch(() => null);
};
app.getNode = function(path){ // The folder shown at path ('/', '/Work/')
	if(!app.bg) return QDClient.getNode(path);
	return Promise.resolve(app.bg.ready).then(() => app.bg.GridNodes.getNode(app.bg.node, path.slice(1)));
};
app.getImages = function(ids){ // { id: data URL }; never rejects
	if(!app.bg || !app.bg.Images) return QDClient.getImages(ids);
	return app.bg.Images.get(ids).catch(() => ({}));
};
app.getCachedImage = function(id){ // A picture the background page holds in memory already (same process only), or null
	return (app.bg && app.bg.Images && app.bg.Images._cache.get(id)) || null;
};
// Messages the background page sends to every page
app.listen = function(){
	if(app._listening) return; // app.init can run more than once; register the listener only once
	app._listening = true;
	const Commands = QDCommon.Commands;
	// The tile menu also opens on the Back tile, which has no node: its items do nothing there
	const onTile = action => () => {
		const link = app._selectedLink && app._selectedLink.gridNode ? app._selectedLink : null;
		if(link) action(link);
	};
	QDClient.listen({
		[Commands.settingsChanged]: () => { app.getSettings().then(app.Settings._changed); },
		[Commands.gridNodesLoaded]: () => { app.getNode(app.path).then(app.GridNodes._changed); },
		[Commands.menuCreateBookmark]: () => { app.createBookmark(); },
		[Commands.menuCreateFolder]: () => { app.createFolder(); },
		[Commands.menuEditProperties]: onTile(link => app.editProperties(link)),
		[Commands.menuRefreshNode]: onTile(link => app.refreshNode(link)),
		[Commands.menuCapturePage]: onTile(link => app.capturePage(link)),
		[Commands.menuDeleteNode]: onTile(link => app.deleteNode(link))
	});
};

app.Settings = {};
app.Settings._changed = function(settings){
	if(!settings || !settings.grid) return; // The background page could not be reached
	app.settings = settings;
	document.documentElement.style.backgroundColor = ''; // Drop dialbg.js's early colour: the body's background (colour and image) fills the page from now on
	dial.initStyles();
	dial.initGrid();
	// A new grid is empty: fill it with the tiles already known. The background page also sends gridNodesLoaded
	// after a settings change, but its answer may arrive before these settings do.
	if(app.node) app.draw();
};

app.GridNodes = {};
app.GridNodes._changed = function(node){
	if(!node || !app.settings) return; // The folder is gone (deleted, or renamed in the Library), or there are no settings to draw it with
	app.node = node;
	dial.titleElement.innerText = app.node.title;
	app.draw();
};

// Draws the current page, then loads the pictures it left pending and has the missing ones made
app.draw = function(){
	const drawn = dial.populateGrid();
	drawn.missing.forEach(link => { QDClient.refreshNode(app.path, link.gridNode.id); });
	if(drawn.pending.length) app.getImages(drawn.pending.map(p => p.node.id)).then(images => { dial.showImages(drawn.pending, images); });
};
app.turnPage = function(step){ // Mouse wheel, PageDown / PageUp
	if(!app.settings || !app.node) return;
	const page = dial.page + step;
	if(page < 1 || page > dial.maxPage) return;
	dial.page = page;
	app.draw();
};

// ----- Mouse: the tile menu, and drag and drop (a tile dropped on another cell of the same folder swaps places with it) -----
app._onMouseDown = function(e){ // the tile the tile menu acts on; the click effect on a left or middle click
	const link = e.target.closest ? e.target.closest('a') : null;
	if(!link || dial.cellIndex(link) < 0) return;
	app._selectedLink = link;
	if((e.button == 0 || e.button == 1) && app.settings) dial.showClick(link, e.clientX, e.clientY);
};
app._dragData = function(e){ // what _onDragStart set, if it came from this folder
	try {
		const data = JSON.parse(e.dataTransfer.getData('text'));
		return data && app.node && data.parentId == app.node.id ? data : null;
	} catch(err){
		return null;
	}
};
app._onDragStart = function(e){
	const cellIndex = dial.cellIndex(e.target);
	if(cellIndex < 0) return; // not a tile
	if(!e.target.gridNode){ // empty cells and Back
		e.preventDefault();
		return;
	}
	e.dataTransfer.setData('text/plain', JSON.stringify({ parentId: app.node.id, index: dial.nodeIndex(cellIndex) }));
};
app._onDragOver = function(e){
	const cellIndex = dial.cellIndex(e.target);
	if(cellIndex < 0) return; // outside the grid: Firefox's own handling
	e.preventDefault();
	e.dataTransfer.dropEffect = app._dragData(e) && !dial.isBackCell(cellIndex) ? 'move' : 'none'; // the Back cell takes no drop
};
app._onDrop = function(e){
	const cellIndex = dial.cellIndex(e.target);
	if(cellIndex < 0) return;
	e.preventDefault();
	if(e.buttons == 1) return;
	const data = app._dragData(e);
	if(!data || dial.isBackCell(cellIndex)) return;
	const newIndex = dial.nodeIndex(cellIndex);
	if(data.index != newIndex) QDClient.setNodeIndex(app.path, data.index, newIndex);
};

// ----- Commands (the tile menu and the dial's menu) -----
// The dialog and popup helpers (css/ui.css, js/ui.js) are loaded only when first needed, so they never slow down drawing the dial.
app.loadUI = function(){
	if(!app._ui) app._ui = new Promise(resolve => {
		let pending = 2;
		const done = () => { if(--pending == 0){ dial.applyAccent(); resolve(window.QDUI); } };
		const css = document.createElement('link');
		css.rel = 'stylesheet'; css.href = '/css/ui.css';
		css.onload = css.onerror = done;
		const script = document.createElement('script');
		script.src = '/js/ui.js';
		script.onload = script.onerror = done;
		document.head.appendChild(css);
		document.head.appendChild(script);
	});
	return app._ui;
};
app.createBookmark = function(){
	app.loadUI().then(ui => {
		return ui.dialog({
			title: QDCommon.text('dialogNewBookmark'),
			message: QDCommon.text('dialogNewBookmarkPrompt'),
			value: 'https://', placeholder: 'https://example.com', okText: QDCommon.text('dialogAdd'),
			validate: function(address){
				const url = /^[a-z][a-z0-9+.-]*:/i.test(address) ? address : 'https://' + address;
				try { // web addresses need a host; other schemes (file:, about:...) are kept, except scripts and inline data
					const parsed = new URL(url);
					if(/^https?:$/.test(parsed.protocol) ? parsed.hostname : !app.BLOCKED_SCHEMES.test(parsed.protocol)) return '';
				} catch(e) {}
				return QDCommon.text('dialogInvalidAddress');
			},
			transform: function(address){ return /^[a-z][a-z0-9+.-]*:/i.test(address) ? address : 'https://' + address; }
		});
	}).then(url => { if(url) QDClient.createBookmark(app.path, url, url); });
};
app.createFolder = function(){
	app.loadUI().then(ui => {
		return ui.dialog({ title: QDCommon.text('dialogNewFolder'), message: QDCommon.text('dialogNewFolderPrompt'), value: QDCommon.text('dialogNewFolderName'), okText: QDCommon.text('dialogCreate') });
	}).then(name => { if(name) QDClient.createFolder(app.path, name); });
};
app.deleteNode = function(link){ // Delete: asks first
	const node = link.gridNode;
	app.loadUI().then(ui => {
		return ui.dialog({ title: QDCommon.text('dialogDeleteConfirmation', node.title), message: node.url || '', okText: QDCommon.text('menuDeleteItem'), danger: true });
	}).then(ok => { if(ok) QDClient.deleteNode(app.path, node.id); });
};
app.refreshNode = function(link){ // Refresh: download the page for its title and picture
	dial.showLoading(link);
	QDClient.refreshNode(app.path, link.gridNode.id);
};
app.capturePage = function(link){ // Capture page: open it in a tab and take a picture
	dial.showLoading(link);
	QDClient.capturePage(app.path, link.gridNode.id);
};
app.editProperties = function(link){
	app.loadUI().then(ui => { ui.openPopup('/html/properties.html?id=' + link.gridNode.id, app.PROPERTIES_WIDTH, app.PROPERTIES_HEIGHT); });
};
app.editSettings = function(tab){ // Settings opens in its own tab; tab: optional section ('backup')
	QDClient.openSettings(tab); // tab is the click event when this is a button's handler: QDClient leaves it out
};
