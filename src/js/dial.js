var utils = {};
var app = {};
var dial = {
	page: 1,
	maxpage: 1,
	capture: 0
};

document.addEventListener("DOMContentLoaded", function(event) {
  document.body.style.backgroundColor = utils.getBackgroundColor();
	app.init();
	dial.init();
  window.setTimeout(function(){ // Safety net for when the background page could not be reached and no broadcast arrived
    if(! app.settings && ! app._waitingForBackground) app.init();
  }, 500);
});

window.addEventListener('resize', function(){
	if(app && app.settings) dial.updateGridLayout();
});
window.addEventListener('wheel', function(e){
	if(app && app.settings){
		if(e.deltaY > 0){
			if(dial.page < dial.maxpage){
				dial.page += 1;
				dial.populateGrid();
			}
		} else if(e.deltaY < 0){
			if(dial.page > 1){
				dial.page -= 1;
				dial.populateGrid();
			}
		}
	}
});
window.addEventListener('keyup', function(e){
	switch(e.key){
		case 'PageDown':
			if(dial.page < dial.maxpage){
				dial.page += 1;
				dial.populateGrid();
			}
			break;
		case 'PageUp':
			if(dial.page > 1){
				dial.page -= 1;
				dial.populateGrid();
			}
			break;
	}
});



utils.getBackgroundColor = function(){
	return new URL(window.location).searchParams.get('bg');
};
utils.getPath = function(){
	var path = new URL(window.location).searchParams.get('path');
	if(path) return path + '/';
	else return '/';
};

app.init = function(){
	app.Messages.getSettings(function(settings){
		if(settings && settings.grid) app.Settings._changed(settings);
		dial.path = utils.getPath();
		app.Messages.getNode(dial.path, app.GridNodes._changed);
		app.Messages.init();
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
	settingsChanged: 100,
	gridNodesLoaded: 101,
	menuCreateBookmark: 200,
	menuCreateFolder: 201,
	menuEditSettings: 202,
	menuEditProperties: 203,
	menuRefreshNode: 204,
	menuCapturePage: 206,
	menuDeleteNode: 207,
	menuImportQuickDial: 208
};
app.Messages.init = function(){
	if(app.Messages._listening) return; // app.init can run more than once; register the listener only once
	app.Messages._listening = true;
	browser.runtime.onMessage.addListener(function(request, sender, sendResponse){
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
			case app.Messages.Commands.menuEditSettings:
				dial.editSettings();
				break;
			case app.Messages.Commands.menuImportQuickDial:
				dial.editSettings('backup');
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
	browser.runtime.getBackgroundPage().then(function(page){
		app.bg = (page && page.app) ? page.app : null; // Same-process background page: read its data directly instead of copying it through messages
		if(app.bg){
			Promise.resolve(app.bg.ready).then(function(){ // At browser start the background page may still be loading its settings
				app._waitingForBackground = false;
				if(callback) callback(app.bg.settings);
			});
		} else {
			app._waitingForBackground = false;
			browser.runtime.sendMessage({ cmd: app.Messages.Commands.getSettings }).then(callback, callback);
		}
	}, function(e){
		app._waitingForBackground = false;
		if(callback) callback(e);
	});
};
app.Messages.getNode = function(path, callback){
	browser.runtime.getBackgroundPage().then(function(page){
		if(page && page.app){
			Promise.resolve(page.app.ready).then(function(){
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
		app.bg.Images.get(ids).then(callback, function(){ callback({}); });
		return;
	}
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getImages, ids: ids }).then(callback, function(){ callback({}); });
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
app.GridNodes.GridNodeType = { // GridNodeType
	back: -1,
	empty: 0,
	folder: 1,
	bookmark: 2
}
app.GridNodes._changed = function(node){
	app.node = node;
	dial.Title.innerText = app.node.title;
	dial.populateGrid();
};




dial.init = function(){
	//dial.initMenus();
	dial.Title = document.createElement('title');
	document.head.appendChild(dial.Title);
};
/*
dial.initMenus = function(){
	document.body.setAttribute('contextmenu', 'page');
	dial.PageMenu = document.createElement('menu');
	dial.PageMenu.type = 'context';
	dial.PageMenu.id = 'page'
	dial.PageMenuNew = document.createElement('menu');
	dial.PageMenuNew.label = browser.i18n.getMessage("menuNew");
	dial.PageMenuCreateBookmark = document.createElement('menuitem');
	dial.PageMenuCreateBookmark.label = browser.i18n.getMessage("menuNewBookmark");
	dial.PageMenuCreateBookmark.onclick = dial.createBookmark;
	dial.PageMenuCreateFolder = document.createElement('menuitem');
	dial.PageMenuCreateFolder.label = browser.i18n.getMessage("menuNewFolder");
	dial.PageMenuCreateFolder.onclick = dial.createFolder;
	dial.PageMenuSettings = document.createElement('menuitem');
	dial.PageMenuSettings.label = browser.i18n.getMessage("menuSettings");
	dial.PageMenuSettings.onclick = dial.editSettings;
	
	dial.PageMenu.appendChild(dial.PageMenuNew);
	dial.PageMenuNew.appendChild(dial.PageMenuCreateBookmark);
	dial.PageMenuNew.appendChild(dial.PageMenuCreateFolder);
	dial.PageMenu.appendChild(document.createElement('hr'));
	dial.PageMenu.appendChild(dial.PageMenuSettings);
	document.body.appendChild(dial.PageMenu);

	dial.ItemMenu = document.createElement('menu');
	dial.ItemMenu.type = 'context';
	dial.ItemMenu.id = 'item'

	dial.ItemMenuNew = document.createElement('menu');
	dial.ItemMenuNew.label = browser.i18n.getMessage("menuNew");
	
	dial.ItemMenuCreateBookmark = document.createElement('menuitem');
	dial.ItemMenuCreateBookmark.label = browser.i18n.getMessage("menuNewBookmark");
	dial.ItemMenuCreateBookmark.onclick = dial.createBookmark;
	dial.ItemMenuCreateFolder = document.createElement('menuitem');
	dial.ItemMenuCreateFolder.label = browser.i18n.getMessage("menuNewFolder");
	dial.ItemMenuCreateFolder.onclick = dial.createFolder;
	
	dial.ItemMenuProperties = document.createElement('menuitem');
	dial.ItemMenuProperties.label = browser.i18n.getMessage("menuProperties");
	dial.ItemMenuProperties.onclick = function(){
		dial.editProperties(dial._selectedItem);
	};
	
	dial.ItemMenuRefresh = document.createElement('menuitem');
	dial.ItemMenuRefresh.label = browser.i18n.getMessage("menuRefreshItem");
	dial.ItemMenuRefresh.onclick = function(){
		dial.refreshNode(dial._selectedItem);
	};

	dial.ItemMenuCaptureHere = document.createElement('menuitem');
	dial.ItemMenuCaptureHere.label = browser.i18n.getMessage("menuCaptureHere");
	dial.ItemMenuCaptureHere.onclick = function(){
		dial.captureHere(dial._selectedItem);
	};
	
	dial.ItemMenuCapture = document.createElement('menuitem');
	dial.ItemMenuCapture.label = browser.i18n.getMessage("menuCapturePage");
	dial.ItemMenuCapture.onclick = function(){
		dial.capturePage(dial._selectedItem);
	};
	
	dial.ItemMenuDelete = document.createElement('menuitem');
	dial.ItemMenuDelete.label = browser.i18n.getMessage("menuDeleteItem");
	dial.ItemMenuDelete.onclick = dial.deleteNode;

	dial.ItemMenuSettings = document.createElement('menuitem');
	dial.ItemMenuSettings.label = browser.i18n.getMessage("menuSettings");
	dial.ItemMenuSettings.onclick = dial.editSettings;
	
	dial.ItemMenu.appendChild(dial.ItemMenuNew);
	dial.ItemMenuNew.appendChild(dial.ItemMenuCreateBookmark);
	dial.ItemMenuNew.appendChild(dial.ItemMenuCreateFolder);
	dial.ItemMenu.appendChild(document.createElement('hr'));
	dial.ItemMenu.appendChild(dial.ItemMenuProperties);
	dial.ItemMenu.appendChild(dial.ItemMenuRefresh);
	dial.ItemMenu.appendChild(dial.ItemMenuCaptureHere);
	dial.ItemMenu.appendChild(dial.ItemMenuCapture);
	dial.ItemMenu.appendChild(dial.ItemMenuDelete);
	dial.ItemMenu.appendChild(document.createElement('hr'));
	dial.ItemMenu.appendChild(dial.ItemMenuSettings);
	document.body.appendChild(dial.ItemMenu);
}
*/
dial.initStyles = function(){
	function applyImageMode(imageMode, target){
		switch(imageMode){
			case 0:
				target.backgroundRepeat = 'no-repeat';
				target.backgroundSize = '100% 100%';
				break;
			case 1:
				target.backgroundRepeat = 'no-repeat';
				target.backgroundSize = 'cover';
				target.backgroundPosition = 'center';
				break;
			case 2:
				target.backgroundRepeat = 'no-repeat';
				target.backgroundSize = 'contain';
				target.backgroundPosition = 'center';
				break;
			case 3:
				target.backgroundRepeat = 'no-repeat';
				target.backgroundPosition = 'center';
				break;
		}
	}

	var oldStyle = dial.Style;
	dial.Style = document.createElement('style'), StyleSheet;
	document.head.appendChild(dial.Style);
	dial.styles = {};
	var s = app.settings, c = s.grid.cells, T = QDThemes;
	function rule(text){ var sheet = dial.Style.sheet; return sheet.cssRules[sheet.insertRule(text, sheet.cssRules.length)].style; }
	var motion = +c.hoverEffect || 0; // 0 none, 1 smooth, 2 lift, 3 zoom
	var overlay = c.titlePosition == 1; // title over the bottom of the picture
	dial.styles.html = rule('html { height: 100%; }');
	dial.styles.body = rule('body { user-select: none; -moz-user-select: none; display: flex; width: 100%; height: 100%; margin: 0px; padding: 0px; background-color: ' + s.backgroundColor + '; background-image: ' + T.background(s.backgroundImage, s.backgroundGradient) + '; }');
	applyImageMode(s.backgroundMode, dial.styles.body);
	dial.styles.grid = {};
	dial.styles.grid.grid = rule('.Grid { border-collapse: collapse; margin: auto; }');
	dial.styles.grid.cell = rule('.Grid td { margin: 0px; padding: 0px; }');
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
	dial.styles.grid.linkFolder = rule('.Grid td>a.Folder :first-child { background-image: ' + s.grid.folderIcon + '; background-repeat: no-repeat; background-size: 100% 100%; }');
	applyImageMode(s.grid.folderIconMode, dial.styles.grid.linkFolder);
	dial.styles.grid.linkBookmark = rule('.Grid td>a.Bookmark :first-child { background-repeat: no-repeat; background-size: 100% 100%; }');
	dial.styles.grid.linkBookmarkLoading = rule('.Grid td>a.BookmarkLoading :first-child { background-image: url("' + c.loadingIcon + '"); background-repeat: no-repeat; background-position: center center; }');
	dial.applyAccent();
	if(oldStyle) document.head.removeChild(oldStyle);
};
dial.initGrid = function(){
	var oldGrid = dial.Grid;
	dial.Grid = document.createElement('table');
	var grid = document.createElement('table');
	dial.Grid.className = 'Grid';
	dial.Grid.getLink = function(index){
		var num_columns = dial.Grid.rows[0].cells.length;
		return dial.Grid.rows[Math.floor(index/num_columns)].cells[index % num_columns].childNodes[0];
	}
	for(var i=0; i<app.settings.grid.rows; i++){
		var row = dial.Grid.insertRow();
		for(var j=0; j<app.settings.grid.columns; j++){
			var cell = row.insertCell();
			var link = document.createElement('a');
			cell.setAttribute('gridindex', (i * app.settings.grid.columns + j));
			cell.appendChild(link);
			link.className = 'Empty';
			link.appendChild(document.createElement('div'));
			link.appendChild(document.createElement('div'));
			link.onmousedown = function(){
				dial._selectedItem = this;
				/*
				if(dial._selectedItem.Node){
					switch(dial._selectedItem.Node.type){
						case app.GridNodes.GridNodeType.folder:
							dial.ItemMenuCaptureHere.hidden = true;
							break;
						case app.GridNodes.GridNodeType.bookmark:
							//dial.ItemMenuCaptureHere.hidden = false;
							dial.ItemMenuCaptureHere.hidden = true;
							break;
					}
				}
				*/
			};
			
			function dragstart_handler(ev) {
				if(!ev.target.Node){
					ev.preventDefault();
					return;
				}
				if(dial.page == 0) dial.page = 1;
				var index = (dial.page - 1) * (app.settings.grid.rows * app.settings.grid.columns) + +(ev.target.parentElement.getAttribute('gridindex'));
				if(app.settings.grid.backNode && dial.path != '/') index -= dial.page;
				ev.dataTransfer.setData("text/plain", JSON.stringify({parentId: app.node.id, index: index}));
			}
			function dragover_handler(ev) {
				ev.preventDefault();
				var data = ev.dataTransfer.getData("text");
				try {
					data = JSON.parse(data);
				} catch(e) {
					data = null;
				}
				if(!data){
					ev.dataTransfer.dropEffect = "none";
					return;
				} else if(data.parentId != app.node.id){
					ev.dataTransfer.dropEffect = "none";
					return;
				}
				if(app.settings.grid.backNode && dial.path != '/'){
					var gridIndex = 0;
					if(ev.target.tagName == 'DIV') gridIndex = +(ev.target.parentElement.parentElement.getAttribute('gridindex'));
					else gridIndex = +(ev.target.getAttribute('gridindex'));
					if(gridIndex==0) ev.dataTransfer.dropEffect = "none";
					else ev.dataTransfer.dropEffect = "move";
				} else {
					ev.dataTransfer.dropEffect = "move";
				}
			}
			function drop_handler(ev) {
				ev.preventDefault();
				if(ev.buttons == 1) return;
				var data = ev.dataTransfer.getData("text");
				try {
					data = JSON.parse(data);
				} catch(e) {
					data = null;
				}
				if(!data) return;
				else if(data.parentId != app.node.id) return;
				var StartIndex = data.index;
				var EndIndex = 0;
				if(ev.target.tagName == 'DIV'){
					EndIndex = (dial.page - 1) * (app.settings.grid.rows * app.settings.grid.columns) + +(ev.target.parentElement.parentElement.getAttribute('gridindex'));
				} else{
					EndIndex = (dial.page - 1) * (app.settings.grid.rows * app.settings.grid.columns) + +(ev.target.getAttribute('gridindex'));
				}
				if(app.settings.grid.backNode && dial.path != '/') EndIndex -= dial.page;
				if(StartIndex != EndIndex) app.Messages.setNodeIndex(StartIndex, EndIndex);
			}
			link.draggable = true;
			link.ondragstart = dragstart_handler;
			cell.ondragover = dragover_handler;
			cell.ondrop = drop_handler;
		}
	}
	document.body.appendChild(dial.Grid);
	dial.updateGridLayout();
	if(oldGrid) document.body.removeChild(oldGrid);
	return dial.Grid;
};
dial.updateGridLayout = function(){
	var parentWidth = dial.Grid.parentElement.offsetWidth;
	var parentHeight = dial.Grid.parentElement.offsetHeight;
	
	function calc(gridMargin, cellsMargin, borderSize, titleBorderSize){
		var fullWidth = parentWidth - 2 * gridMargin;
		var fullHeight = parentHeight - 2 * gridMargin;
		var cellWidth = fullWidth / app.settings.grid.columns;
		var cellHeight = fullHeight / app.settings.grid.rows;
		var linkWidth = 0;
		var linkHeight = 0;
		if(cellWidth <= cellHeight * app.settings.grid.ratioX / app.settings.grid.ratioY) cellHeight = cellWidth / app.settings.grid.ratioX * app.settings.grid.ratioY;
		else cellWidth = cellHeight / app.settings.grid.ratioY * app.settings.grid.ratioX;
		linkWidth = cellWidth - 2 * (cellsMargin + 1) - 2 * borderSize;
		linkHeight = cellHeight - 2 * (cellsMargin + 1) - 2 * borderSize - titleBorderSize;
		return {
			cellWidth: cellWidth,
			cellHeight: cellHeight,
			linkWidth: linkWidth,
			linkHeight: linkHeight
		};
	}

	var c = app.settings.grid.cells;
	var below = c.titlePosition != 1; // a title over the picture takes no room of its own
	var values = calc(app.settings.grid.margin, c.margin, c.borderSize, below ? c.titleBorderSize : 0);
	dial.styles.grid.cell.width = values.cellWidth.toString() + 'px';
	dial.styles.grid.cell.height = values.cellHeight.toString() + 'px';
	dial.styles.grid.link.width = values.linkWidth.toString() + 'px';
	dial.styles.grid.link.height = values.linkHeight.toString() + 'px';
	if(below && c.title) dial.styles.grid.linkPanel.height = (values.linkHeight - c.titleHeight - 1 - c.titleBorderSize).toString() + 'px';
	else dial.styles.grid.linkPanel.height = values.linkHeight.toString() + 'px';

	values = calc(app.settings.grid.margin, c.marginHover, c.borderSizeHover, below ? c.titleBorderSizeHover : 0);
	dial.styles.grid.cellHover.width = values.cellWidth.toString() + 'px';
	dial.styles.grid.cellHover.height = values.cellHeight.toString() + 'px';
	dial.styles.grid.linkHover.width = values.linkWidth.toString() + 'px';
	dial.styles.grid.linkHover.height = values.linkHeight.toString() + 'px';
	if(below && c.titleHover) dial.styles.grid.linkPanelHover.height = (values.linkHeight - c.titleHeightHover - 1 - c.titleBorderSizeHover).toString() + 'px';
	else dial.styles.grid.linkPanelHover.height = values.linkHeight.toString() + 'px';
};dial.populateGrid = function(){
	function applyImageMode(imageMode, target){
		switch(imageMode){
			case -1:
				target.backgroundRepeat = '';
				target.backgroundSize = '';
				target.backgroundPosition = '';
				break;
			case 0:
				target.backgroundRepeat = 'no-repeat';
				target.backgroundSize = '100% 100%';
				target.backgroundPosition = '';
				break;
			case 1:
				target.backgroundRepeat = 'no-repeat';
				target.backgroundSize = 'cover';
				target.backgroundPosition = 'center';
				break;
			case 2:
				target.backgroundRepeat = 'no-repeat';
				target.backgroundSize = 'contain';
				target.backgroundPosition = 'center';
				break;
			case 3:
				target.backgroundRepeat = 'no-repeat';
				target.backgroundSize = 'auto auto';
				target.backgroundPosition = 'center';
				break;
		}
	}
	var pendingImages = [];
	function applyImage(link, node){ // Returns false when the node has no image yet
		var style = link.childNodes[0].style;
		if(!node.image || node.image == '0'){
			link._imageId = null;
			link._imageSrc = null;
			style.backgroundImage = '';
			return node.image == '0';
		}
		if(node.image == '1'){ // Stored separately, loaded on demand
			var cached = app.bg && app.bg.Images && app.bg.Images._cache.get(node.id);
			if(cached){ // Already in memory: show it in this same frame (no message, no copy)
				if(link._imageSrc != cached) style.backgroundImage = 'url("' + cached + '")';
				link._imageId = node.id;
				link._imageSrc = cached;
				return true;
			}
			if(link._imageId != node.id) style.backgroundImage = '';
			pendingImages.push({ link: link, node: node });
			return true;
		}
		link._imageId = null;
		link._imageSrc = null;
		if(node.image.indexOf('url(')>=0) style.backgroundImage = node.image;
		else style.backgroundImage = 'url(' + node.image + ')';
		return true;
	}
	populateEmpty = function(link){
		link.Node = null;
		link._imageId = null;
		link._imageSrc = null;
		link.className = 'Empty';
		link.childNodes[0].style.backgroundImage = '';
		if(link.target) delete link.target;
		link.href = null;
		link.onclick = null;
		link.removeAttribute('contextmenu');
	}
	populateBack = function(link){
		link.Node = null;
		link._imageId = null;
		link._imageSrc = null;
		link.className = 'Back';
		link.childNodes[0].style.backgroundImage = '';
		link.childNodes[1].innerText = 'Back';
		if(link.target) delete link.target;
		link.href = '#';
		link.onclick = function(){ window.history.back(); }
		link.removeAttribute('contextmenu');
	}
	populateFolder = function(link, node){
		link.Node = node;
		link.className = 'Folder';
		if(node.imageMode || node.imageMode == 0) applyImageMode(node.imageMode, link.childNodes[0].style);
		else applyImageMode(-1, link.childNodes[0].style);
		applyImage(link, node);
		link.childNodes[1].innerText = node.title;
		switch(app.settings.grid.openFolderMethod){
			case 0:
				if(link.target) delete link.target;
				break;
			case 1:
				link.target = '_blank';
				break;
		}
		if(dial.path) link.href = '?' + 'bg=' + encodeURIComponent(app.settings.backgroundColor) + '&path=' + encodeURIComponent(dial.path + node.title);
		else link.href = '?' + 'bg=' + encodeURIComponent(app.settings.backgroundColor) + '&path=' + encodeURIComponent(node.title);
		link.onclick = null;
		link.setAttribute('contextmenu', 'item');
	}
	populateBookmark = function(link, node){
		link.Node = node;
		if(node.imageMode || node.imageMode == 0) applyImageMode(node.imageMode, link.childNodes[0].style);
		else applyImageMode(-1, link.childNodes[0].style);
		if(applyImage(link, node)){
			link.className = 'Bookmark';
		} else {
			link.className = 'BookmarkLoading';
			dial.refreshNode(link);
		}
		link.childNodes[1].innerText = node.title;
		switch(app.settings.grid.openBookmarkMethod){
			case 0:
				if(link.target) delete link.target;
				break;
			case 1:
				link.target = '_blank';
				break;
		}
		link.href = node.url;
		link.onclick = null;
		link.setAttribute('contextmenu', 'item');
	}

	var iBase = 0;
	var linkItem = 0;
	var allCells = app.settings.grid.rows * app.settings.grid.columns;
	var maxCells = allCells;
	if(app.settings.grid.backNode && dial.path != '/'){
		populateBack(dial.Grid.getLink(linkItem));
		linkItem++;
		maxCells -= 1;
	}
	dial.maxpage = Math.floor(app.node.children.length / maxCells);
	if(dial.maxpage != app.node.children.length / maxCells) dial.maxpage += 1;
	if(dial.page > dial.maxpage) dial.page = dial.maxpage;
	if(dial.page > 1) iBase = (dial.page -1) * maxCells;
	for(var i = iBase; i<app.node.children.length && i<maxCells + iBase; i++) {
		switch(app.node.children[i].type){
			case app.GridNodes.GridNodeType.empty:
				populateEmpty(dial.Grid.getLink(linkItem));
				break;
			case app.GridNodes.GridNodeType.folder:
				populateFolder(dial.Grid.getLink(linkItem), app.node.children[i]);
				break;
			case app.GridNodes.GridNodeType.bookmark:
				populateBookmark(dial.Grid.getLink(linkItem), app.node.children[i]);
				break;
		}
		linkItem++;
	}
	while(linkItem<allCells){
		populateEmpty(dial.Grid.getLink(linkItem));
		linkItem++;
	}
	if(pendingImages.length > 0){
		var requests = pendingImages;
		app.Messages.getImages(requests.map(function(r){ return r.node.id; }), function(images){
			for(var r of requests){
				if(r.link.Node != r.node || !images || !images[r.node.id]) continue;
				r.link._imageId = r.node.id;
				r.link._imageSrc = images[r.node.id];
				r.link.childNodes[0].style.backgroundImage = 'url("' + images[r.node.id] + '")';
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
	if(!dial._ui) dial._ui = new Promise(function(resolve){
		var pending = 2, done = function(){ if(--pending == 0){ dial.applyAccent(); resolve(window.QDUI); } };
		var css = document.createElement('link');
		css.rel = 'stylesheet'; css.href = '/css/ui.css';
		css.onload = css.onerror = done;
		var js = document.createElement('script');
		js.src = '/js/ui.js';
		js.onload = js.onerror = done;
		document.head.appendChild(css);
		document.head.appendChild(js);
	});
	return dial._ui;
};
dial.createBookmark = function(){
	dial.loadUI().then(function(ui){
		return ui.dialog({
			title: browser.i18n.getMessage("dialogNewBookmark"),
			message: browser.i18n.getMessage("AddBookmarkPrompt"),
			value: 'https://', placeholder: 'https://example.com', okText: 'Add',
			validate: function(v){
				var u = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v;
				try { var p = new URL(u); if(!/^https?:$/.test(p.protocol) || p.hostname) return ''; } catch(e) {}
				return 'Enter a web address, e.g. https://example.com';
			},
			transform: function(v){ return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v; }
		});
	}).then(function(url){ if(url) app.Messages.createBookmark(url); });
};
dial.createFolder = function(){
	dial.loadUI().then(function(ui){
		return ui.dialog({ title: browser.i18n.getMessage("dialogNewFolder"), message: browser.i18n.getMessage("AddFolderPrompt"), value: 'New Folder', okText: 'Create' });
	}).then(function(name){ if(name) app.Messages.createFolder(name); });
};
dial.deleteNode = function(){
	var node = dial._selectedItem.Node;
	dial.loadUI().then(function(ui){
		return ui.dialog({ title: browser.i18n.getMessage("deleteItemConfimation", node.title), message: node.url || '', okText: browser.i18n.getMessage("menuDeleteItem"), danger: true });
	}).then(function(ok){ if(ok) app.Messages.deleteNode(node.id); });
}
dial.refreshNode = function(selectedItem){
	selectedItem.className = 'BookmarkLoading';
	selectedItem._imageSrc = null; // Show the result even if the picture comes back unchanged
	selectedItem.childNodes[0].style.backgroundImage = app.settings.grid.loadingIcon;
	app.Messages.refreshNode(selectedItem.Node.id);
}
dial.capturePage = function(selectedItem){
	selectedItem.className = 'BookmarkLoading';
	selectedItem._imageSrc = null; // Show the result even if the picture comes back unchanged
	selectedItem.childNodes[0].style.backgroundImage = app.settings.grid.loadingIcon;
	app.Messages.capturePage(selectedItem.Node.id);
}




dial.PopupPanel = function(width, height){ // Modal frame for the Settings and Properties pages
	var self = this;
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
	this.overlay.addEventListener('mousedown', function(e){ // keep focus in the frame
		if(e.target === self.overlay){ e.preventDefault(); var f = self.panel.querySelector('iframe'); if(f) f.focus(); }
	});
	this.popup = function(){
		if(dial._popup) dial._popup.close(true);
		dial._popup = self;
		window.addEventListener('contextmenu', self._contextMenuHandler, false);
		window.addEventListener('keydown', self._keyHandler, false);
		document.body.appendChild(self.overlay);
	};
	this.fit = function(){ // Called by the page inside: shrink the frame to its content (never above the requested height)
		var f = self.panel.querySelector('iframe'), d = f && f.contentDocument;
		if(!d) return;
		var needed = 2, content = d.querySelector('.qd-content');
		if(content) content.style.flex = '0 0 auto'; // natural height instead of "fill the frame"
		for(var el of d.body.children) needed += el.offsetHeight;
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
		else { self.overlay.classList.add('is-closing'); setTimeout(function(){ self.overlay.remove(); }, 120); }
	};
}

dial.openPopup = function(src, width, height){
	dial.loadUI().then(function(){
		var popup = new dial.PopupPanel(width, height);
		var iframe = document.createElement('iframe');
		iframe.src = src;
		iframe.popup = popup;
		popup.frame.appendChild(iframe);
		popup.popup();
		iframe.focus();
	});
}

dial.editSettings = function(tab){ // tab: optional settings tab to open ('backup')
	dial.openPopup('/html/settings.html' + (tab ? '?tab=' + tab : ''), 640, 600);
}

dial.editProperties = function(selectedItem){
	dial.openPopup('/html/properties.html?id=' + selectedItem.Node.id, 560, 590);
}
