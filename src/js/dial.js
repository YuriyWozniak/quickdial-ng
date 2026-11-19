/* exported app, dial */
// The dial page. `app` talks to the background page, `dial` draws the grid; both are window
// properties because the tests, the benchmark probe and the screenshot maker reach them.
const utils = {};
// eslint-disable-next-line no-var
var app = {};
// eslint-disable-next-line no-var
var dial = {
	page: 1, // shown page of the folder, 1-based
	maxpage: 1
};

document.addEventListener('DOMContentLoaded', () => {
	document.body.style.backgroundColor = utils.getBackgroundColor();
	app.init();
	dial.init();
	setTimeout(() => { // Safety net for when the background page could not be reached and no broadcast arrived
		if(!app.settings && !app._waitingForBackground) app.init();
	}, 500);
});

window.addEventListener('resize', () => {
	if(app.settings) dial.updateGridLayout();
});
window.addEventListener('wheel', e => {
	if(app.settings && e.deltaY) dial.turnPage(e.deltaY > 0 ? 1 : -1);
});
window.addEventListener('keyup', e => {
	if(e.key == 'PageDown') dial.turnPage(1);
	else if(e.key == 'PageUp') dial.turnPage(-1);
});
utils.getBackgroundColor = function(){
	return new URL(window.location).searchParams.get('bg');
};
utils.getPath = function(){
	const path = new URL(window.location).searchParams.get('path');
	if(path) return path + '/';
	else return '/';
};

app.init = function(){
	app.Messages.getSettings(settings => {
		if(settings && settings.grid) app.Settings._changed(settings);
		dial.path = utils.getPath();
		app.Messages.getNode(dial.path, app.GridNodes._changed);
		app.Messages.init();
	});
};

app.Messages = {};
app.Messages.Commands = QDCommon.Commands;
app.Messages.init = function(){
	if(app.Messages._listening) return; // app.init can run more than once; register the listener only once
	app.Messages._listening = true;
	browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
		switch(request.cmd){
			case app.Messages.Commands.settingsChanged:
				app.Messages.getSettings(app.Settings._changed);
				break;
			case app.Messages.Commands.gridNodesLoaded:
				if(dial.skipUpdate!=true) app.Messages.getNode(dial.path, app.GridNodes._changed);
				break;
			case app.Messages.Commands.menuCreateBookmark:
				dial.createBookmark();
				break;
			case app.Messages.Commands.menuCreateFolder:
				dial.createFolder();
				break;
			case app.Messages.Commands.menuEditProperties:
				dial.editProperties(dial._selectedItem);
				break;
			case app.Messages.Commands.menuRefreshNode:
				dial.refreshNode(dial._selectedItem);
				break;
			case app.Messages.Commands.menuCapturePage:
				dial.capturePage(dial._selectedItem);
				break;
			case app.Messages.Commands.menuDeleteNode:
				dial.deleteNode();
				break;
		}
	});
};
app.Messages.getSettings = function(callback){
	app._waitingForBackground = true;
	browser.runtime.getBackgroundPage().then(page => {
		app.bg = (page && page.app) ? page.app : null; // Same-process background page: read its data directly instead of copying it through messages
		if(app.bg){
			Promise.resolve(app.bg.ready).then(() => { // At browser start the background page may still be loading its settings
				app._waitingForBackground = false;
				if(callback) callback(app.bg.settings);
			});
		} else {
			app._waitingForBackground = false;
			browser.runtime.sendMessage({ cmd: app.Messages.Commands.getSettings }).then(callback, callback);
		}
	}, e => {
		app._waitingForBackground = false;
		if(callback) callback(e);
	});
};
app.Messages.getNode = function(path, callback){
	browser.runtime.getBackgroundPage().then(page => {
		if(page && page.app){
			Promise.resolve(page.app.ready).then(() => {
				if(callback) callback(page.app.GridNodes.getNode(page.app.node, dial.path.substr(1)));
			});
		} else {
			browser.runtime.sendMessage({ cmd: app.Messages.Commands.getNode, path: path }).then(callback);
		}
	});
};
app.Messages.updateNode = function(id, value, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.updateNode, id: id, value: value }).then(callback);
};
app.Messages.setNodeIndex = function(index, newIndex, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.setNodeIndex, path: dial.path, index: index, newIndex: newIndex }).then(callback);
};
app.Messages.createBookmark = function(url, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.createBookmark, path: dial.path, url: url, title: url }).then(callback);
};
app.Messages.createFolder = function(name, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.createFolder, path: dial.path, name: name }).then(callback);
};
app.Messages.deleteNode = function(id, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.deleteNode, path: dial.path, id: id }).then(callback);
};
app.Messages.refreshNode = function(id, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.refreshNode, path: dial.path, id: id }).then(callback);
}
app.Messages.getImages = function(ids, callback){
	if(app.bg && app.bg.Images){
		app.bg.Images.get(ids).then(callback, () => { callback({}); });
		return;
	}
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getImages, ids: ids }).then(callback, () => { callback({}); });
}
app.Messages.capturePage = function(id, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.capturePage, path: dial.path, id: id }).then(callback);
}


app.Settings = {};
app.Settings._changed = function(settings){
	app.settings = settings;
	document.documentElement.style.backgroundColor = ''; // Drop dialbg.js's early colour: the body's background (colour and image) fills the page from now on
	dial.initStyles();
	dial.initGrid();
};

app.GridNodes = {};
app.GridNodes.GridNodeType = QDCommon.NodeType;
app.GridNodes._changed = function(node){
	app.node = node;
	dial.Title.innerText = app.node.title;
	dial.populateGrid();
};

dial.init = function(){
	dial.Title = document.createElement('title');
	document.head.appendChild(dial.Title);
};
dial.turnPage = function(step){ // Mouse wheel, PageDown / PageUp
	if(!app.settings || !app.node) return;
	const page = dial.page + step;
	if(page < 1 || page > dial.maxpage) return;
	dial.page = page;
	dial.populateGrid();
};
// How a picture fills its box (style: a CSS rule's or an element's style). -1: back to the rule's own values
dial.applyImageMode = function(imageMode, style){
	const modes = {
		'-1': ['', '', ''],
		0: ['no-repeat', '100% 100%', ''], // stretched
		1: ['no-repeat', 'cover', 'center'],
		2: ['no-repeat', 'contain', 'center'],
		3: ['no-repeat', 'auto auto', 'center'] // original size
	};
	const m = modes[imageMode];
	if(!m) return;
	[style.backgroundRepeat, style.backgroundSize, style.backgroundPosition] = m;
};
dial.initStyles = function(){
	const applyImageMode = dial.applyImageMode;
	const oldStyle = dial.Style;
	dial.Style = document.createElement('style');
	document.head.appendChild(dial.Style);
	dial.styles = {};
	const s = app.settings, c = s.grid.cells, T = QDThemes;
	function rule(text){ const sheet = dial.Style.sheet; return sheet.cssRules[sheet.insertRule(text, sheet.cssRules.length)].style; }
	const motion = +c.hoverEffect || 0; // 0 none, 1 smooth, 2 lift, 3 zoom
	const overlay = c.titlePosition == 1; // title over the bottom of the picture
	dial.styles.html = rule('html { height: 100%; }');
	dial.styles.body = rule('body { user-select: none; display: flex; width: 100%; height: 100%; margin: 0; padding: 0; background-color: ' + s.backgroundColor + '; background-image: ' + T.background(s.backgroundImage, s.backgroundGradient) + '; }');
	applyImageMode(s.backgroundMode, dial.styles.body);
	dial.styles.grid = {};
	dial.styles.grid.grid = rule('.Grid { border-collapse: collapse; margin: auto; }');
	dial.styles.grid.cell = rule('.Grid td { margin: 0; padding: 0; }');
	dial.styles.grid.cellHover = rule('.Grid td:hover {}');
	dial.styles.grid.link = rule('.Grid td>a { display: block; position: relative; z-index: 0; outline: none; overflow: hidden; text-decoration: none;'
		+ ' margin: ' + c.margin + 'px; opacity: ' + c.opacity + '; border: ' + c.borderSize + 'px solid ' + c.borderColor + '; border-radius: ' + c.borderRadius + 'px;'
		+ ' box-shadow: ' + T.shadow(c.shadow) + '; backdrop-filter: ' + (c.blur > 0 ? 'blur(' + c.blur + 'px)' : 'none') + ';'
		+ (motion ? ' transition: margin .2s, width .2s, height .2s, border-color .2s, border-width .2s, border-radius .2s, opacity .2s, box-shadow .2s, transform .2s, backdrop-filter .2s;' : '') + ' }');
	dial.styles.grid.linkHover = rule('.Grid td>a:hover { z-index: 1; border-color: ' + c.borderColorHover + '; border-width: ' + c.borderSizeHover + 'px; margin: ' + c.marginHover + 'px; opacity: ' + c.opacityHover + '; border-radius: ' + c.borderRadiusHover + 'px;'
		+ ' box-shadow: ' + T.shadow(c.shadowHover) + '; backdrop-filter: ' + (c.blurHover > 0 ? 'blur(' + c.blurHover + 'px)' : 'none') + ';'
		+ (motion == 2 ? ' transform: translateY(-4px);' : motion == 3 ? ' transform: scale(1.04);' : '') + ' }');
	if(motion) rule('.Grid td>a>div { transition: color .2s, background-color .2s, height .2s, line-height .2s, font-size .2s, border-color .2s; }');
	rule('@media (prefers-reduced-motion: reduce) { .Grid td>a, .Grid td>a>div { transition: none !important; } .Grid td>a:hover { transform: none !important; } }');
	dial.styles.grid.linkPanel = rule('.Grid td>a>div:first-child { background-repeat: no-repeat; }');
	if(c.backgroundColor) dial.styles.grid.linkPanel.backgroundColor = T.rgba(c.backgroundColor, c.backgroundOpacity);
	dial.styles.grid.linkPanelHover = rule('.Grid td>a:hover>div:first-child { }');
	dial.styles.grid.linkPanelHover.backgroundColor = T.rgba(c.backgroundColorHover, c.backgroundOpacityHover);
	dial.styles.grid.linkTitle = rule('.Grid td>a>div:last-child { display: ' + (c.title ? 'block' : 'none') + '; height: ' + c.titleHeight + 'px; line-height: ' + c.titleHeight + 'px; padding: 0 4px;'
		+ ' font-size: ' + c.titleFontSize + 'pt; font-family: ' + c.titleFont + '; font-weight: ' + (c.titleBold ? '600' : 'normal') + ';'
		+ ' text-align: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: ' + c.titleColor + '; border-top: ' + c.titleBorderSize + 'px solid ' + c.borderColor + ';'
		+ ' background-color: ' + T.rgba(c.titleBackgroundColor, c.titleBackgroundOpacity) + ';'
		+ (overlay ? ' position: absolute; left: 0; right: 0; bottom: 0;' : '') + ' }');
	dial.styles.grid.linkTitleHover = rule('.Grid td>a:hover>div:last-child { display: ' + (c.titleHover ? 'block' : 'none') + '; height: ' + c.titleHeightHover + 'px; line-height: ' + c.titleHeightHover + 'px;'
		+ ' font-size: ' + c.titleFontSizeHover + 'pt; color: ' + c.titleColorHover + '; border-top-width: ' + c.titleBorderSizeHover + 'px; border-top-color: ' + c.borderColorHover + ';'
		+ ' background-color: ' + T.rgba(c.titleBackgroundColorHover, c.titleBackgroundOpacityHover) + '; }');
	dial.styles.grid.linkEmpty = rule('.Grid td>a.Empty { display: none; }');
	dial.styles.grid.linkBack = rule('.Grid td>a.Back :first-child { background-image: ' + s.grid.backIcon + '; }');
	applyImageMode(s.grid.backIconMode, dial.styles.grid.linkBack);
	// Folder and bookmark pictures are stretched unless a mode says otherwise (no-repeat comes from linkPanel)
	dial.styles.grid.linkFolder = rule('.Grid td>a.Folder :first-child { background-image: ' + s.grid.folderIcon + '; background-size: 100% 100%; }');
	applyImageMode(s.grid.folderIconMode, dial.styles.grid.linkFolder);
	dial.styles.grid.linkBookmark = rule('.Grid td>a.Bookmark :first-child { background-size: 100% 100%; }');
	dial.styles.grid.linkBookmarkLoading = rule('.Grid td>a.BookmarkLoading :first-child { background-image: url("' + c.loadingIcon + '"); background-position: center; }');
	dial.applyAccent();
	if(oldStyle) document.head.removeChild(oldStyle);
};
dial.initGrid = function(){
	const oldGrid = dial.Grid;
	const { rows, columns } = app.settings.grid;
	dial.Grid = document.createElement('table');
	dial.Grid.className = 'Grid';
	dial.Grid.getLink = index => dial.Grid.rows[Math.floor(index / columns)].cells[index % columns].firstChild;
	for(let i = 0; i < rows; i++){
		const row = dial.Grid.insertRow();
		for(let j = 0; j < columns; j++){
			const cell = row.insertCell();
			cell.setAttribute('gridindex', i * columns + j);
			const link = document.createElement('a');
			link.className = 'Empty';
			link.appendChild(document.createElement('div')); // picture
			link.appendChild(document.createElement('div')); // title
			link.onmousedown = dial._onMouseDown;
			link.draggable = true;
			link.ondragstart = dial._onDragStart;
			cell.appendChild(link);
			cell.ondragover = dial._onDragOver;
			cell.ondrop = dial._onDrop;
		}
	}
	document.body.appendChild(dial.Grid);
	dial.updateGridLayout();
	if(oldGrid) oldGrid.remove();
	return dial.Grid;
};

// ----- Drag and drop: a tile dropped on another cell of the same folder swaps places with it -----
dial._onMouseDown = function(){ dial._selectedItem = this; }; // the tile the dial's context menu acts on
dial._cellIndex = target => +target.closest('td').getAttribute('gridindex'); // cell number on this page
dial._backShown = () => app.settings.grid.backNode && dial.path != '/';
dial._nodeIndex = function(cellIndex){ // position in the folder of the cell shown at cellIndex
	const g = app.settings.grid;
	if(dial.page == 0) dial.page = 1;
	return (dial.page - 1) * g.rows * g.columns + cellIndex - (dial._backShown() ? dial.page : 0);
};
dial._dragData = function(ev){ // what _onDragStart set, if it came from this folder
	try {
		const data = JSON.parse(ev.dataTransfer.getData('text'));
		return data && data.parentId == app.node.id ? data : null;
	} catch(e){
		return null;
	}
};
dial._onDragStart = function(ev){
	if(!ev.target.Node){
		ev.preventDefault();
		return;
	}
	ev.dataTransfer.setData('text/plain', JSON.stringify({ parentId: app.node.id, index: dial._nodeIndex(dial._cellIndex(ev.target)) }));
};
dial._onDragOver = function(ev){
	ev.preventDefault();
	const onBack = dial._backShown() && dial._cellIndex(ev.target) == 0; // the Back cell takes no drop
	ev.dataTransfer.dropEffect = dial._dragData(ev) && !onBack ? 'move' : 'none';
};
dial._onDrop = function(ev){
	ev.preventDefault();
	if(ev.buttons == 1) return;
	const data = dial._dragData(ev);
	if(!data || (dial._backShown() && dial._cellIndex(ev.target) == 0)) return; // the Back cell takes no drop
	const newIndex = dial._nodeIndex(dial._cellIndex(ev.target));
	if(data.index != newIndex) app.Messages.setNodeIndex(data.index, newIndex);
};
dial.updateGridLayout = function(){ // Cell and tile sizes for this window (normal and hover)
	const g = app.settings.grid, c = g.cells, st = dial.styles.grid;
	const below = c.titlePosition != 1; // a title over the picture takes no room of its own
	const parentWidth = dial.Grid.parentElement.offsetWidth;
	const parentHeight = dial.Grid.parentElement.offsetHeight;
	const px = v => v + 'px';
	const layout = (h, cell, link, panel) => { // h: '' or 'Hover'
		const margin = c['margin' + h], border = c['borderSize' + h], titleBorder = below ? c['titleBorderSize' + h] : 0;
		let cellWidth = (parentWidth - 2 * g.margin) / g.columns;
		let cellHeight = (parentHeight - 2 * g.margin) / g.rows;
		if(cellWidth <= cellHeight * g.ratioX / g.ratioY) cellHeight = cellWidth / g.ratioX * g.ratioY;
		else cellWidth = cellHeight / g.ratioY * g.ratioX;
		const linkWidth = cellWidth - 2 * (margin + 1) - 2 * border;
		const linkHeight = cellHeight - 2 * (margin + 1) - 2 * border - titleBorder;
		cell.width = px(cellWidth);
		cell.height = px(cellHeight);
		link.width = px(linkWidth);
		link.height = px(linkHeight);
		panel.height = px(below && c['title' + h] ? linkHeight - c['titleHeight' + h] - 1 - c['titleBorderSize' + h] : linkHeight);
	};
	layout('', st.cell, st.link, st.linkPanel);
	layout('Hover', st.cellHover, st.linkHover, st.linkPanelHover);
};
dial.populateGrid = function(){ // Fills the cells of the current page from app.node
	const T = app.GridNodes.GridNodeType, g = app.settings.grid;
	const pendingImages = [];
	const applyImage = (link, node) => { // Returns false when the node has no image yet
		const style = link.firstChild.style;
		if(!node.image || node.image == '0'){
			link._imageId = null;
			link._imageSrc = null;
			style.backgroundImage = '';
			return node.image == '0';
		}
		if(node.image == '1'){ // Stored separately, loaded on demand
			const cached = app.bg && app.bg.Images && app.bg.Images._cache.get(node.id);
			if(cached){ // Already in memory: show it in this same frame (no message, no copy)
				if(link._imageSrc != cached) style.backgroundImage = 'url("' + cached + '")';
				link._imageId = node.id;
				link._imageSrc = cached;
				return true;
			}
			if(link._imageId != node.id) style.backgroundImage = '';
			pendingImages.push({ link, node });
			return true;
		}
		link._imageId = null;
		link._imageSrc = null;
		style.backgroundImage = node.image.includes('url(') ? node.image : 'url(' + node.image + ')';
		return true;
	};
	const reset = (link, node, className) => {
		link.Node = node;
		link.className = className;
		link.onclick = null;
		const mode = node && (node.imageMode || node.imageMode == 0) ? node.imageMode : -1;
		dial.applyImageMode(mode, link.firstChild.style);
		if(!node){
			link._imageId = null;
			link._imageSrc = null;
			link.firstChild.style.backgroundImage = '';
		}
	};
	const openIn = (link, method) => { // 0: this tab, 1: a new tab
		if(method == 1) link.target = '_blank';
		else link.removeAttribute('target');
	};
	const populateEmpty = link => {
		reset(link, null, 'Empty');
		openIn(link, 0);
		link.removeAttribute('href');
	};
	const populateBack = link => {
		reset(link, null, 'Back');
		link.lastChild.innerText = 'Back';
		openIn(link, 0);
		link.href = '#';
		link.onclick = () => { window.history.back(); };
	};
	const populateFolder = (link, node) => {
		reset(link, node, 'Folder');
		applyImage(link, node);
		link.lastChild.innerText = node.title;
		openIn(link, g.openFolderMethod);
		link.href = '?bg=' + encodeURIComponent(app.settings.backgroundColor) + '&path=' + encodeURIComponent((dial.path || '') + node.title);
	};
	const populateBookmark = (link, node) => {
		reset(link, node, 'Bookmark');
		if(!applyImage(link, node)){ // No picture yet: make one
			link.className = 'BookmarkLoading';
			dial.refreshNode(link);
		}
		link.lastChild.innerText = node.title;
		openIn(link, g.openBookmarkMethod);
		link.href = node.url;
	};

	const allCells = g.rows * g.columns;
	let maxCells = allCells, linkItem = 0;
	if(dial._backShown()){
		populateBack(dial.Grid.getLink(linkItem++));
		maxCells -= 1;
	}
	const children = app.node.children;
	dial.maxpage = Math.ceil(children.length / maxCells);
	if(dial.page > dial.maxpage) dial.page = dial.maxpage;
	const first = dial.page > 1 ? (dial.page - 1) * maxCells : 0;
	for(const node of children.slice(first, first + maxCells)){
		const link = dial.Grid.getLink(linkItem++);
		switch(node.type){
			case T.folder: populateFolder(link, node); break;
			case T.bookmark: populateBookmark(link, node); break;
			default: populateEmpty(link);
		}
	}
	while(linkItem < allCells) populateEmpty(dial.Grid.getLink(linkItem++));
	if(pendingImages.length > 0){
		app.Messages.getImages(pendingImages.map(r => r.node.id), images => {
			for(const r of pendingImages){
				if(r.link.Node != r.node || !images || !images[r.node.id]) continue;
				r.link._imageId = r.node.id;
				r.link._imageSrc = images[r.node.id];
				r.link.firstChild.style.backgroundImage = 'url("' + images[r.node.id] + '")';
			}
		});
	}
};
// Shared dialog styles and helpers (css/ui.css, js/ui.js) are loaded only when first needed,
// so they never slow down drawing the dial.
dial.applyAccent = function(){ // The theme's accent colour for the dialogs and popups (once ui.js is loaded)
	if(window.QDUI && app.settings) QDUI.setAccent(app.settings.accentColor);
};
dial.loadUI = function(){
	if(!dial._ui) dial._ui = new Promise(resolve => {
		let pending = 2;
		const done = () => { if(--pending == 0){ dial.applyAccent(); resolve(window.QDUI); } };
		const css = document.createElement('link');
		css.rel = 'stylesheet'; css.href = '/css/ui.css';
		css.onload = css.onerror = done;
		const js = document.createElement('script');
		js.src = '/js/ui.js';
		js.onload = js.onerror = done;
		document.head.appendChild(css);
		document.head.appendChild(js);
	});
	return dial._ui;
};
dial.createBookmark = function(){
	dial.loadUI().then(ui => {
		return ui.dialog({
			title: browser.i18n.getMessage("dialogNewBookmark"),
			message: browser.i18n.getMessage("AddBookmarkPrompt"),
			value: 'https://', placeholder: 'https://example.com', okText: 'Add',
			validate: function(v){
				const u = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v;
				try { // web addresses need a host; other schemes (file:, about:...) are kept, except scripts and inline data
					const p = new URL(u);
					if(/^https?:$/.test(p.protocol) ? p.hostname : !/^(javascript|data):$/i.test(p.protocol)) return '';
				} catch(e) {}
				return 'Enter a web address, e.g. https://example.com';
			},
			transform: function(v){ return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v; }
		});
	}).then(url => { if(url) app.Messages.createBookmark(url); });
};
dial.createFolder = function(){
	dial.loadUI().then(ui => {
		return ui.dialog({ title: browser.i18n.getMessage("dialogNewFolder"), message: browser.i18n.getMessage("AddFolderPrompt"), value: 'New Folder', okText: 'Create' });
	}).then(name => { if(name) app.Messages.createFolder(name); });
};
dial.deleteNode = function(){
	const node = dial._selectedItem.Node;
	dial.loadUI().then(ui => {
		return ui.dialog({ title: browser.i18n.getMessage("deleteItemConfimation", node.title), message: node.url || '', okText: browser.i18n.getMessage("menuDeleteItem"), danger: true });
	}).then(ok => { if(ok) app.Messages.deleteNode(node.id); });
}
dial._showLoading = function(link){ // until the background page sends the new picture
	link.className = 'BookmarkLoading';
	link._imageSrc = null; // Show the result even if the picture comes back unchanged
	link.firstChild.style.backgroundImage = app.settings.grid.loadingIcon;
};
dial.refreshNode = function(link){ // Refresh: download the page for its title and picture
	dial._showLoading(link);
	app.Messages.refreshNode(link.Node.id);
};
dial.capturePage = function(link){ // Capture page: open it in a tab and take a picture
	dial._showLoading(link);
	app.Messages.capturePage(link.Node.id);
};

dial.PopupPanel = function(width, height){ // Modal frame for the Settings and Properties pages
	const self = this;
	this.overlay = document.createElement('div');
	this.overlay.className = 'qd qd-overlay';
	this.panel = document.createElement('div');
	this.panel.className = 'qd-frame';
	this.panel.style.width = width + 'px';
	this.panel.style.height = height + 'px';
	this.overlay.appendChild(this.panel);
	this.frame = this.panel;
	this._contextMenuHandler = function(e){ e.preventDefault(); };
	this._keyHandler = function(e){ if(e.key == 'Escape') self.close(); }; // when focus is outside the frame
	this.overlay.addEventListener('mousedown', e => { // keep focus in the frame
		if(e.target === self.overlay){ e.preventDefault(); const f = self.panel.querySelector('iframe'); if(f) f.focus(); }
	});
	this.popup = function(){
		if(dial._popup) dial._popup.close(true);
		dial._popup = self;
		window.addEventListener('contextmenu', self._contextMenuHandler, false);
		window.addEventListener('keydown', self._keyHandler, false);
		document.body.appendChild(self.overlay);
	};
	this.fit = function(){ // Called by the page inside: shrink the frame to its content (never above the requested height)
		const f = self.panel.querySelector('iframe'), d = f && f.contentDocument;
		if(!d) return;
		const content = d.querySelector('.qd-content');
		let needed = 2;
		if(content) content.style.flex = '0 0 auto'; // natural height instead of "fill the frame"
		for(const el of d.body.children) needed += el.offsetHeight;
		if(content) content.style.flex = '';
		self.panel.style.height = Math.min(height, Math.ceil(needed)) + 'px';
	};
	this.close = function(immediate){
		if(self._closed) return;
		self._closed = true;
		if(dial._popup === self) dial._popup = null;
		window.removeEventListener('contextmenu', self._contextMenuHandler, false);
		window.removeEventListener('keydown', self._keyHandler, false);
		if(immediate) self.overlay.remove();
		else { self.overlay.classList.add('is-closing'); setTimeout(() => { self.overlay.remove(); }, 120); }
	};
}

dial.openPopup = function(src, width, height){
	dial.loadUI().then(() => {
		const popup = new dial.PopupPanel(width, height);
		const iframe = document.createElement('iframe');
		iframe.src = src;
		iframe.popup = popup;
		popup.frame.appendChild(iframe);
		popup.popup();
		iframe.focus();
	});
}

dial.editSettings = function(tab){ // Settings opens in its own tab; tab: optional section ('backup')
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.openSettings, tab: typeof tab == 'string' ? tab : null }).catch(() => {});
}

dial.editProperties = function(selectedItem){
	dial.openPopup('/html/properties.html?id=' + selectedItem.Node.id, 560, 590);
}
