/* exported dial */
// The dial's grid: draws a page of tiles from what js/dial.js holds (app.settings, app.node, app.path and the
// pictures already in memory, app.getCachedImage). It sends no messages and handles no input: what it can't
// draw by itself (pictures still to load or make) it hands back to js/dial.js.
// A window property, like `app`: the tests, the benchmark probe and the screenshot maker reach it.
// eslint-disable-next-line no-var
var dial = {
	page: 1, // shown page of the folder, 1-based
	maxPage: 1,
	LOADING_ICON: 'url(/img/loading.svg)' // Spinner on a tile while its picture is made
};

dial.init = function(){
	dial.titleElement = document.createElement('title');
	document.head.appendChild(dial.titleElement);
};

// ----- Styles: one stylesheet built from the settings, replaced as a whole when they change -----
dial.initStyles = function(){
	const applyImageMode = QDCommon.applyImageMode; // on CSS rules here; ImageMode.inherit leaves a rule's own values
	const oldStyle = dial.styleElement;
	dial.styleElement = document.createElement('style');
	document.head.appendChild(dial.styleElement);
	dial.styles = {};
	const s = app.settings, c = s.grid.cells, Themes = QDThemes;
	function rule(text){ const sheet = dial.styleElement.sheet; return sheet.cssRules[sheet.insertRule(text, sheet.cssRules.length)].style; }
	const smooth = (+c.hoverEffect || Themes.HoverEffect.instant) != Themes.HoverEffect.instant;
	const hoverTransform = Themes.hoverTransform(c.hoverEffect);
	const titleOverlay = c.titlePosition == Themes.TitlePosition.over;
	dial.styles.html = rule('html { height: 100%; }');
	dial.styles.body = rule('body { user-select: none; display: flex; width: 100%; height: 100%; margin: 0; padding: 0; background-color: ' + s.backgroundColor + '; background-image: ' + Themes.background(s.backgroundImage, s.backgroundGradient) + '; }');
	applyImageMode(s.backgroundMode, dial.styles.body);
	dial.styles.grid = {};
	dial.styles.grid.grid = rule('.qd-grid { border-collapse: collapse; margin: auto; }');
	dial.styles.grid.cell = rule('.qd-grid td { margin: 0; padding: 0; }');
	dial.styles.grid.cellHover = rule('.qd-grid td:hover {}');
	dial.styles.grid.link = rule('.qd-grid td>a { display: block; position: relative; z-index: 0; outline: none; overflow: hidden; text-decoration: none;'
		+ ' margin: ' + c.margin + 'px; opacity: ' + c.opacity + '; border: ' + c.borderSize + 'px solid ' + c.borderColor + '; border-radius: ' + c.borderRadius + 'px;'
		+ ' box-shadow: ' + Themes.shadow(c.shadow) + '; backdrop-filter: ' + (c.blur > 0 ? 'blur(' + c.blur + 'px)' : 'none') + ';'
		+ (smooth ? ' transition: margin .2s, width .2s, height .2s, border-color .2s, border-width .2s, border-radius .2s, opacity .2s, box-shadow .2s, transform .2s, backdrop-filter .2s;' : '') + ' }');
	dial.styles.grid.linkHover = rule('.qd-grid td>a:hover { z-index: 1; border-color: ' + c.borderColorHover + '; border-width: ' + c.borderSizeHover + 'px; margin: ' + c.marginHover + 'px; opacity: ' + c.opacityHover + '; border-radius: ' + c.borderRadiusHover + 'px;'
		+ ' box-shadow: ' + Themes.shadow(c.shadowHover) + '; backdrop-filter: ' + (c.blurHover > 0 ? 'blur(' + c.blurHover + 'px)' : 'none') + ';'
		+ (hoverTransform ? ' transform: ' + hoverTransform + ';' : '') + ' }');
	if(smooth) rule('.qd-grid td>a>div { transition: color .2s, background-color .2s, height .2s, line-height .2s, font-size .2s, border-color .2s; }');
	// Reduced motion (e.g. Windows' "Show animations" off): the hover still fades colours, borders, opacity and shadows,
	// but nothing moves or grows: no lift or zoom, and sizes change at once
	rule('@media (prefers-reduced-motion: reduce) { .qd-grid td>a { transition-property: border-color, opacity, box-shadow, backdrop-filter !important; }'
		+ ' .qd-grid td>a>div { transition-property: color, background-color, border-color !important; } .qd-grid td>a:hover { transform: none !important; } }');
	dial.styles.grid.linkPanel = rule('.qd-grid td>a>div:first-child { background-repeat: no-repeat; }');
	if(c.backgroundColor) dial.styles.grid.linkPanel.backgroundColor = Themes.rgba(c.backgroundColor, c.backgroundOpacity);
	dial.styles.grid.linkPanelHover = rule('.qd-grid td>a:hover>div:first-child { }');
	dial.styles.grid.linkPanelHover.backgroundColor = Themes.rgba(c.backgroundColorHover, c.backgroundOpacityHover);
	dial.styles.grid.linkTitle = rule('.qd-grid td>a>div:last-child { display: ' + (c.title ? 'block' : 'none') + '; height: ' + c.titleHeight + 'px; line-height: ' + c.titleHeight + 'px; padding: 0 4px;'
		+ ' font-size: ' + c.titleFontSize + 'pt; font-family: ' + c.titleFont + '; font-weight: ' + (c.titleBold ? '600' : 'normal') + ';'
		+ ' text-align: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: ' + c.titleColor + '; border-top: ' + c.titleBorderSize + 'px solid ' + c.borderColor + ';'
		+ ' background-color: ' + Themes.rgba(c.titleBackgroundColor, c.titleBackgroundOpacity) + ';'
		+ (titleOverlay ? ' position: absolute; left: 0; right: 0; bottom: 0;' : '') + ' }');
	dial.styles.grid.linkTitleHover = rule('.qd-grid td>a:hover>div:last-child { display: ' + (c.titleHover ? 'block' : 'none') + '; height: ' + c.titleHeightHover + 'px; line-height: ' + c.titleHeightHover + 'px;'
		+ ' font-size: ' + c.titleFontSizeHover + 'pt; color: ' + c.titleColorHover + '; border-top-width: ' + c.titleBorderSizeHover + 'px; border-top-color: ' + c.borderColorHover + ';'
		+ ' background-color: ' + Themes.rgba(c.titleBackgroundColorHover, c.titleBackgroundOpacityHover) + '; }');
	dial.styles.grid.linkEmpty = rule('.qd-grid td>a.is-empty { display: none; }');
	dial.styles.grid.linkBack = rule('.qd-grid td>a.is-back :first-child { background-image: ' + s.grid.backIcon + '; }');
	applyImageMode(s.grid.backIconMode, dial.styles.grid.linkBack);
	// Folder and bookmark pictures are stretched unless a mode says otherwise (no-repeat comes from linkPanel)
	dial.styles.grid.linkFolder = rule('.qd-grid td>a.is-folder :first-child { background-image: ' + s.grid.folderIcon + '; background-size: 100% 100%; }');
	applyImageMode(s.grid.folderIconMode, dial.styles.grid.linkFolder);
	dial.styles.grid.linkBookmark = rule('.qd-grid td>a.is-bookmark :first-child { background-size: 100% 100%; }');
	dial.styles.grid.linkLoading = rule('.qd-grid td>a.is-loading :first-child { background-image: ' + dial.LOADING_ICON + '; background-size: auto; background-position: center; }');
	Themes.clickEffectRules('.qd-grid td>a', c.clickEffect, c.titleColorHover).forEach(rule);
	dial.applyAccent();
	if(oldStyle) document.head.removeChild(oldStyle);
};
// The theme's accent colour for the dialogs and popups, once js/ui.js is loaded (js/dial.js loads it when first needed)
dial.applyAccent = function(){
	if(window.QDUI && app.settings) QDUI.setAccent(app.settings.accentColor);
};

// ----- The grid: a table of rows x columns cells, each holding one tile (an <a> with a picture and a title) -----
dial.initGrid = function(){
	const oldGrid = dial.grid;
	const { rows, columns } = app.settings.grid;
	dial.grid = document.createElement('table');
	dial.grid.className = 'qd-grid';
	dial.grid.getLink = index => dial.grid.rows[Math.floor(index / columns)].cells[index % columns].firstChild;
	for(let i = 0; i < rows; i++){
		const row = dial.grid.insertRow();
		for(let j = 0; j < columns; j++){
			const cell = row.insertCell();
			cell.dataset.index = i * columns + j;
			const link = document.createElement('a');
			link.className = 'is-empty';
			link.appendChild(document.createElement('div')); // picture
			link.appendChild(document.createElement('div')); // title
			link.draggable = true;
			cell.appendChild(link);
		}
	}
	document.body.appendChild(dial.grid);
	dial.updateGridLayout();
	if(oldGrid) oldGrid.remove();
	return dial.grid;
};
dial.cellIndex = function(target){ // cell number on this page of the cell an element is in; -1 outside the grid
	const cell = dial.grid && target && target.closest ? target.closest('td') : null;
	return cell && dial.grid.contains(cell) ? +cell.dataset.index : -1;
};
dial.isBackShown = () => !!app.settings.grid.backNode && app.path != '/';
dial.isBackCell = cellIndex => cellIndex == 0 && dial.isBackShown();
dial.nodeIndex = function(cellIndex){ // position in the folder of the tile shown at cellIndex
	const g = app.settings.grid;
	return (dial.page - 1) * g.rows * g.columns + cellIndex - (dial.isBackShown() ? dial.page : 0);
};
dial.updateGridLayout = function(){ // Cell and tile sizes for this window (normal and hover)
	const g = app.settings.grid, c = g.cells, rules = dial.styles.grid;
	const titleBelow = c.titlePosition != QDThemes.TitlePosition.over; // a title over the picture takes no room of its own
	const parentWidth = dial.grid.parentElement.offsetWidth;
	const parentHeight = dial.grid.parentElement.offsetHeight;
	const px = v => v + 'px';
	const layout = (suffix, cell, link, panel) => { // suffix: '' or 'Hover'
		const margin = c['margin' + suffix], border = c['borderSize' + suffix], titleBorder = titleBelow ? c['titleBorderSize' + suffix] : 0;
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
		panel.height = px(titleBelow && c['title' + suffix] ? linkHeight - c['titleHeight' + suffix] - 1 - c['titleBorderSize' + suffix] : linkHeight);
	};
	layout('', rules.cell, rules.link, rules.linkPanel);
	layout('Hover', rules.cellHover, rules.linkHover, rules.linkPanelHover);
};

// Fills the cells of the current page from app.node. Returns what it could not finish:
//   pending: [{ link, node }] whose pictures are stored apart and not in memory yet (js/dial.js loads them, then showImages)
//   missing: links of bookmarks with no picture at all, shown loading (js/dial.js has their pictures made)
dial.populateGrid = function(){
	const NodeType = QDCommon.NodeType, OpenIn = QDCommon.OpenIn, ImageMode = QDCommon.ImageMode, g = app.settings.grid;
	const pending = [], missing = [];
	const setImage = (link, id, src) => { // id: the node whose stored picture this is (null for a picture kept in the node)
		link._imageId = id;
		link._imageSrc = src;
	};
	const applyImage = (link, node) => { // Returns false when the node has no image yet
		const style = link.firstChild.style;
		if(!node.image || node.image == '0'){
			setImage(link, null, null);
			style.backgroundImage = '';
			return node.image == '0';
		}
		if(node.image == '1'){ // Stored separately, loaded on demand
			const cached = app.getCachedImage(node.id);
			if(cached){ // Already in memory: show it in this same frame (no message, no copy)
				if(link._imageSrc != cached) style.backgroundImage = 'url("' + cached + '")';
				setImage(link, node.id, cached);
				return true;
			}
			if(link._imageId != node.id) style.backgroundImage = '';
			pending.push({ link, node });
			return true;
		}
		setImage(link, null, null);
		style.backgroundImage = QDCommon.toCssUrl(node.image);
		return true;
	};
	const reset = (link, node, className) => {
		link.gridNode = node;
		link.className = className;
		link.onclick = null;
		const mode = node && (node.imageMode || node.imageMode == 0) ? node.imageMode : ImageMode.inherit;
		QDCommon.applyImageMode(mode, link.firstChild.style);
		if(!node){
			setImage(link, null, null);
			link.firstChild.style.backgroundImage = '';
		}
	};
	const openIn = (link, method) => { // method: OpenIn
		if(method == OpenIn.newTab) link.target = '_blank';
		else link.removeAttribute('target');
	};
	const populateEmpty = link => {
		reset(link, null, 'is-empty');
		openIn(link, OpenIn.thisTab);
		link.removeAttribute('href');
	};
	const populateBack = link => {
		reset(link, null, 'is-back');
		link.lastChild.innerText = QDCommon.text('tileBack');
		openIn(link, OpenIn.thisTab);
		link.href = '#';
		link.onclick = () => { window.history.back(); };
	};
	const populateFolder = (link, node) => {
		reset(link, node, 'is-folder');
		applyImage(link, node);
		link.lastChild.innerText = node.title;
		openIn(link, g.openFolderMethod);
		link.href = '?bg=' + encodeURIComponent(app.settings.backgroundColor) + '&path=' + encodeURIComponent(app.path + node.title);
	};
	const populateBookmark = (link, node) => {
		reset(link, node, 'is-bookmark');
		if(!applyImage(link, node)){
			dial.showLoading(link);
			missing.push(link);
		}
		link.lastChild.innerText = node.title;
		openIn(link, g.openBookmarkMethod);
		link.href = node.url;
	};

	const cellCount = g.rows * g.columns;
	let cellsPerPage = cellCount, linkIndex = 0;
	if(dial.isBackShown()){
		populateBack(dial.grid.getLink(linkIndex++));
		cellsPerPage -= 1;
	}
	const children = app.node.children;
	dial.maxPage = Math.max(1, Math.ceil(children.length / cellsPerPage)); // an empty folder still has its first page
	if(dial.page > dial.maxPage) dial.page = dial.maxPage;
	const first = dial.page > 1 ? (dial.page - 1) * cellsPerPage : 0;
	for(const node of children.slice(first, first + cellsPerPage)){
		const link = dial.grid.getLink(linkIndex++);
		switch(node.type){
			case NodeType.folder: populateFolder(link, node); break;
			case NodeType.bookmark: populateBookmark(link, node); break;
			default: populateEmpty(link);
		}
	}
	while(linkIndex < cellCount) populateEmpty(dial.grid.getLink(linkIndex++));
	return { pending, missing };
};
// The pictures populateGrid left pending: images is { node id: data URL }. A tile that shows another node by now is left alone.
dial.showImages = function(pending, images){
	for(const entry of pending){
		if(entry.link.gridNode != entry.node || !images[entry.node.id]) continue;
		entry.link._imageId = entry.node.id;
		entry.link._imageSrc = images[entry.node.id];
		entry.link.firstChild.style.backgroundImage = 'url("' + images[entry.node.id] + '")';
	}
};
// The click effect of the settings on a tile (Back, a folder or a bookmark); pointerX, pointerY: the pointer, or none for the middle
dial.showClick = function(link, pointerX, pointerY){
	if(+app.settings.grid.cells.clickEffect && !link.classList.contains('is-empty')) QDThemes.playClickEffect(link, pointerX, pointerY);
};
dial.showLoading = function(link){ // A spinner until the background page sends the new picture
	link.className = 'is-loading';
	link._imageSrc = null; // Show the result even if the picture comes back unchanged
	link.firstChild.style.backgroundImage = dial.LOADING_ICON;
};
