var app = {};

var BackgroundImage = null;
var GridBackImage = null;
var GridFolderImage = null;

document.addEventListener("DOMContentLoaded", function(event) {
	app.init();
});


app.init = function(){
	document.addEventListener('keydown', function(e){
		if(e.key == 'Escape') QDUI.closePopup();
	});
	try { Version.textContent = 'Version ' + browser.runtime.getManifest().version; } catch(e) { Version.textContent = ''; }
	app.tabs = QDUI.tabs(Tabs, function(){ Content.scrollTop = 0; });
	app.changes = QDUI.changes(BtnApply, Status);

	app.Messages.getSettings(function(settings){
		app.settings = settings;
		MenuShowAdd.checked = app.settings.menuShowAdd;
		BackgroundColor.value = app.settings.backgroundColor;
		BackgroundImage = app.settings.backgroundImage;
		BackgroundMode.value = app.settings.backgroundMode;
		ButtonOpenInNewPage.checked = app.settings.openQuickDialInNewPage;
		GridRoot.value = app.settings.grid.root;
		GridRows.value = app.settings.grid.rows;
		GridRatioX.value = app.settings.grid.ratioX;
		GridRatioY.value = app.settings.grid.ratioY;
		GridMargins.value = app.settings.grid.margin;
		GridColumns.value = app.settings.grid.columns;
		GridOpenBookmarksIn.value = app.settings.grid.openBookmarkMethod;
		GridOpenFoldersIn.value = app.settings.grid.openFolderMethod;
		GridBackNode.checked = app.settings.grid.backNode;
		GridBackMode.value = app.settings.grid.backIconMode;
		GridBackImage = app.settings.grid.backIcon;
		GridFolderMode.value = app.settings.grid.folderIconMode;
		GridFolderImage = app.settings.grid.folderIcon;
		GridCellsMargins.value = app.settings.grid.cells.margin;
		GridCellsMarginsHover.value = app.settings.grid.cells.marginHover;
		GridCellsOpacity.value = Math.round(app.settings.grid.cells.opacity * 100);
		GridCellsOpacityHover.value = Math.round(app.settings.grid.cells.opacityHover * 100);
		GridCellsBorderSize.value = app.settings.grid.cells.borderSize;
		GridCellsBorderSizeHover.value = app.settings.grid.cells.borderSizeHover;
		GridCellsBackgroundTransparent.checked = (app.settings.grid.cells.backgroundColor == null);
		GridCellsBackgroundColor.value = app.settings.grid.cells.backgroundColor || '#ffffff';
		GridCellsBackgroundTransparentHover.checked = (app.settings.grid.cells.backgroundColorHover == null);
		GridCellsBackgroundColorHover.value = app.settings.grid.cells.backgroundColorHover || '#ffffff';
		GridCellsBorderRadius.value = app.settings.grid.cells.borderRadius;
		GridCellsBorderRadiusHover.value = app.settings.grid.cells.borderRadiusHover;
		GridCellsBorderColor.value = app.settings.grid.cells.borderColor;
		GridCellsBorderColorHover.value = app.settings.grid.cells.borderColorHover;
		GridCellsTitle.checked = app.settings.grid.cells.title;
		GridCellsTitleHover.checked = app.settings.grid.cells.titleHover;
		GridCellsTitleHeight.value = app.settings.grid.cells.titleHeight;
		GridCellsTitleHeightHover.value = app.settings.grid.cells.titleHeightHover;
		GridCellsTitleFontSize.value = app.settings.grid.cells.titleFontSize;
		GridCellsTitleFontSizeHover.value = app.settings.grid.cells.titleFontSizeHover;
		GridCellsTitleBorderSize.value = app.settings.grid.cells.titleBorderSize;
		GridCellsTitleBorderSizeHover.value = app.settings.grid.cells.titleBorderSizeHover;
		GridCellsTitleColor.value = app.settings.grid.cells.titleColor;
		GridCellsTitleColorHover.value = app.settings.grid.cells.titleColorHover;
		GridCellsTitleBackgroundTransparent.checked = (app.settings.grid.cells.titleBackgroundColor == null);
		GridCellsTitleBackgroundColor.value = app.settings.grid.cells.titleBackgroundColor || '#ffffff';
		GridCellsTitleBackgroundColorHover.value = app.settings.grid.cells.titleBackgroundColorHover || '#ffffff';
		GridCellsTitleBackgroundTransparentHover.checked = (app.settings.grid.cells.titleBackgroundColorHover == null);
		GridCellsSnapshotDelay.value = app.settings.grid.cells.snapshotDelay;
		app.updatePreviews();
		app.changes.start();
	});

	BtnOk.onclick = function(){
		BtnApply.onclick();
		QDUI.closePopup();
	}
	BtnApply.onclick = function(){
		if(!app.settings) return;
		app.settings.menuShowAdd = MenuShowAdd.checked;
		app.settings.backgroundColor = BackgroundColor.value;
		app.settings.backgroundImage = BackgroundImage;
		app.settings.backgroundMode = +(BackgroundMode.value);
		app.settings.openQuickDialInNewPage = ButtonOpenInNewPage.checked;
		app.settings.grid.rows = +(GridRows.value);
		app.settings.grid.margin = +(GridMargins.value);
		app.settings.grid.columns = +(GridColumns.value);
		app.settings.grid.ratioX = GridRatioX.value;
		app.settings.grid.ratioY = GridRatioY.value;
		app.settings.grid.openBookmarkMethod = +(GridOpenBookmarksIn.value);
		app.settings.grid.openFolderMethod = +(GridOpenFoldersIn.value);
		app.settings.grid.backNode = GridBackNode.checked;
		app.settings.grid.backIconMode = +(GridBackMode.value);
		app.settings.grid.backIcon = GridBackImage;
		app.settings.grid.folderIconMode = +(GridFolderMode.value);
		app.settings.grid.folderIcon = GridFolderImage;
		app.settings.grid.cells.margin = +(GridCellsMargins.value);
		app.settings.grid.cells.marginHover = +(GridCellsMarginsHover.value);
		app.settings.grid.cells.opacity = +(GridCellsOpacity.value) / 100;
		app.settings.grid.cells.opacityHover = +(GridCellsOpacityHover.value) / 100;
		app.settings.grid.cells.borderSize = +(GridCellsBorderSize.value);
		app.settings.grid.cells.borderSizeHover = +(GridCellsBorderSizeHover.value);
		if(GridCellsBackgroundTransparent.checked == true) app.settings.grid.cells.backgroundColor = null;
		else app.settings.grid.cells.backgroundColor = GridCellsBackgroundColor.value;
		if(GridCellsBackgroundTransparentHover.checked == true) app.settings.grid.cells.backgroundColorHover = null;
		else app.settings.grid.cells.backgroundColorHover = GridCellsBackgroundColorHover.value;
		app.settings.grid.cells.borderRadius = +(GridCellsBorderRadius.value);
		app.settings.grid.cells.borderRadiusHover = +(GridCellsBorderRadiusHover.value);
		app.settings.grid.cells.borderColor = GridCellsBorderColor.value;
		app.settings.grid.cells.borderColorHover = GridCellsBorderColorHover.value;
		app.settings.grid.cells.title = GridCellsTitle.checked;
		app.settings.grid.cells.titleHover = GridCellsTitleHover.checked;
		app.settings.grid.cells.titleHeight = GridCellsTitleHeight.value;
		app.settings.grid.cells.titleHeightHover = GridCellsTitleHeightHover.value;
		app.settings.grid.cells.titleFontSize = GridCellsTitleFontSize.value;
		app.settings.grid.cells.titleFontSizeHover = GridCellsTitleFontSizeHover.value;
		app.settings.grid.cells.titleBorderSize = GridCellsTitleBorderSize.value;
		app.settings.grid.cells.titleBorderSizeHover = GridCellsTitleBorderSizeHover.value;
		app.settings.grid.cells.titleColor = GridCellsTitleColor.value;
		app.settings.grid.cells.titleColorHover = GridCellsTitleColorHover.value;
		if(GridCellsTitleBackgroundTransparent.checked == true) app.settings.grid.cells.titleBackgroundColor = null;
		else app.settings.grid.cells.titleBackgroundColor = GridCellsTitleBackgroundColor.value;
		if(GridCellsTitleBackgroundTransparentHover.checked == true) app.settings.grid.cells.titleBackgroundColorHover = null;
		else app.settings.grid.cells.titleBackgroundColorHover = GridCellsTitleBackgroundColorHover.value;
		app.settings.grid.cells.snapshotDelay = GridCellsSnapshotDelay.value;
		app.settings.grid.root = GridRoot.value;
		browser.runtime.sendMessage( { cmd: app.Messages.Commands.setSettings, settings: app.settings } );
		app.changes.saved('Changes applied to the dial');
	}
	BtnCancel.onclick = BtnClose.onclick = function(){
		QDUI.closePopup();
	}

	// ----- Backup -----
	BtnExport.onclick = function(){
		browser.runtime.sendMessage({ cmd: app.Messages.Commands.exportData }).then(function(data){
			var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
			var link = document.createElement('a');
			link.href = URL.createObjectURL(blob);
			link.download = 'quickdial-ng-backup-' + new Date().toISOString().substr(0, 10) + '.json';
			document.body.appendChild(link);
			link.click();
			setTimeout(function(){ URL.revokeObjectURL(link.href); link.remove(); }, 1000);
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
		var fileReader = new FileReader();
		fileReader.onload = function(e){
			var data = null;
			try { data = JSON.parse(e.target.result); } catch(err) {}
			if(!data || !data.settings || !data.node || !data.settings.grid){
				app.Backup.showStatus('This file is not a Quick Dial export or Quick Dial NG backup.', true);
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
				app.Backup.showStatus('Importing…', false, true);
				browser.runtime.sendMessage({ cmd: app.Messages.Commands.importData, data: data }).then(function(r){
					var text = 'Imported ' + r.tiles + ' tile' + (r.tiles == 1 ? '' : 's') + ' in ' + (r.folders + 1) + ' folder' + (r.folders ? 's' : '') + ' with ' + r.images + ' picture' + (r.images == 1 ? '' : 's') + ', plus grid and style settings. '
						+ r.matched + ' matched existing bookmarks, ' + r.created + ' bookmark' + (r.created == 1 ? ' was' : 's were') + ' created.';
					location.search = '?tab=backup&result=' + encodeURIComponent(text); // Reload so the form shows the imported settings
				}, function(err){
					BtnImport.disabled = false;
					app.Backup.showStatus('Import failed: ' + err.message, true);
				});
			});
		}
		fileReader.readAsText(ImportFile.files[0]);
	}

	var params = new URLSearchParams(location.search);
	if(params.get('tab') == 'backup') app.tabs.select('TabBackupButton');
	if(params.get('result')) app.Backup.showStatus(params.get('result'));

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

	BackgroundImageClear.onclick = function(){
		BackgroundImage = null;
		app.updatePreviews();
		app.changes.mark();
	}
	GridBackImageReset.onclick = function(){
		GridBackImage = 'url(/img/back.png)';
		app.updatePreviews();
		app.changes.mark();
	}
	GridFolderImageReset.onclick = function(){
		GridFolderImage = 'url(/img/folder.png)';
		app.updatePreviews();
		app.changes.mark();
	}

	// Live previews follow every edit
	document.addEventListener('input', app.updatePreviews);
	document.addEventListener('change', app.updatePreviews);
};

app.updatePreviews = function(){
	if(!app.settings) return;
	BackgroundPreview.style.backgroundColor = BackgroundColor.value;
	BackgroundPreview.style.backgroundImage = BackgroundImage || 'none';
	QDUI.applyMode(BackgroundPreview, BackgroundMode.value);
	BackgroundImageClear.disabled = !BackgroundImage;
	GridBackPreview.style.backgroundImage = GridBackImage || 'none';
	QDUI.applyMode(GridBackPreview, GridBackMode.value);
	GridFolderPreview.style.backgroundImage = GridFolderImage || 'none';
	QDUI.applyMode(GridFolderPreview, GridFolderMode.value);

	// "None" switches off the colour next to it
	[['GridCellsBackgroundTransparent', 'GridCellsBackgroundColor'], ['GridCellsBackgroundTransparentHover', 'GridCellsBackgroundColorHover'],
	 ['GridCellsTitleBackgroundTransparent', 'GridCellsTitleBackgroundColor'], ['GridCellsTitleBackgroundTransparentHover', 'GridCellsTitleBackgroundColorHover']
	].forEach(function(p){ document.getElementById(p[1]).disabled = document.getElementById(p[0]).checked; });

	app.updateTilePreview();
};

// Two sample tiles drawn with the values in the form (normal and hover state)
app.updateTilePreview = function(){
	TileStage.style.backgroundColor = BackgroundColor.value;
	TileStage.style.backgroundImage = BackgroundImage || 'none';
	var rx = +GridRatioX.value || 4, ry = +GridRatioY.value || 3;
	function n(el){ return Math.max(0, +el.value || 0); }
	function draw(tile, hover){
		var h = hover ? 'Hover' : '';
		var v = function(name){ return document.getElementById('GridCells' + name + h); };
		var margin = n(v('Margins')), border = n(v('BorderSize'));
		var showTitle = v('Title').checked, titleHeight = n(v('TitleHeight'));
		var w = 152 - 2 * margin, height = Math.round((152 - 2 * margin - 2 * border) * ry / rx) + 2 * border + (showTitle ? titleHeight : 0);
		tile.parentNode.style.height = (Math.min(height, 200) + 2 * margin) + 'px';
		var s = tile.style;
		s.margin = margin + 'px';
		s.opacity = Math.min(100, n(v('Opacity'))) / 100;
		s.border = border + 'px solid ' + v('BorderColor').value;
		s.borderRadius = n(v('BorderRadius')) + 'px';
		s.backgroundColor = v('BackgroundTransparent').checked ? 'transparent' : v('BackgroundColor').value;
		var title = tile.lastElementChild.style;
		title.display = showTitle ? '' : 'none';
		title.height = titleHeight + 'px';
		title.lineHeight = titleHeight + 'px';
		title.fontSize = n(v('TitleFontSize')) + 'pt';
		title.color = v('TitleColor').value;
		title.backgroundColor = v('TitleBackgroundTransparent').checked ? 'transparent' : v('TitleBackgroundColor').value;
		title.borderTop = n(v('TitleBorderSize')) + 'px solid ' + v('BorderColor').value;
	}
	draw(TileNormal, false);
	draw(TileHover, true);
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
	settingsChanged: 100,
	gridNodesLoaded: 101
};
app.Backup = {};
app.Backup.exportSnippet = "(async()=>{const a=(await browser.runtime.getBackgroundPage()).app;const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([JSON.stringify({version:4,settings:a.settings,node:a.node})],{type:'application/json'}));l.download='quickdial-export.json';document.body.appendChild(l);l.click();})()";
app.Backup.showStatus = function(text, isError, isBusy){
	ImportStatus.textContent = text;
	ImportStatus.className = 'qd-banner' + (isError ? ' is-error' : '') + (isBusy ? ' is-busy' : '');
	ImportStatus.hidden = false;
};
app.Messages.getSettings = function(callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getSettings }).then(callback);
};
