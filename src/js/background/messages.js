// Quick Dial NG — background page: messages from the dial, Settings and Properties pages
app.Messages = {};
app.Messages.Commands = QDCommon.Commands;

app.Messages.broadcast = function(cmd){ // Notify open Quick Dial pages; having none open is normal
	browser.runtime.sendMessage({ cmd }).catch(() => {});
};

app.Messages.init = function(){
	const Commands = app.Messages.Commands, GridNodes = app.GridNodes;
	const nodeAt = path => GridNodes.getNode(app.node, path.slice(1)); // pages send folder paths like "/Work/"
	const tileAt = request => { const folder = nodeAt(request.path); return folder && GridNodes.getChildNode(folder, request.id); };
	const loaded = () => app.Messages.broadcast(Commands.gridNodesLoaded); // The pages show the tiles again
	// Each case answers through sendResponse, or returns a promise of the answer
	browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
		switch(request.cmd){
			case Commands.getSettings:
				sendResponse(app.settings);
				break;
			case Commands.setSettings: {
				const rootChanged = app.settings.grid.root != request.settings.grid.root;
				app.Settings.update(request.settings);
				sendResponse(app.settings);
				app.Language.apply().then(() => { // The pages and the menus get the texts of a new language with the change
					app.Messages.broadcast(Commands.settingsChanged);
					if(rootChanged){
						app.Images.removeTree(app.node);
						app.node = { children: [] };
						GridNodes.sync(app.node, app.settings.grid.root).then(loaded);
					} else {
						loaded();
					}
					app.ContextMenus.updateMenu();
				});
				break;
			}
			case Commands.getNodeById:
				sendResponse(GridNodes.getNodeById(request.id));
				break;
			case Commands.updateNode: { // Answers false when the tile is gone (deleted while its Properties window was open)
				const gridNode = GridNodes.getNodeById(request.id);
				if(gridNode){
					const updated = GridNodes.updateNode(gridNode, request.value);
					loaded(); // and again once a new address has its title and picture
					updated.then(loaded);
				}
				sendResponse(!!gridNode);
				break;
			}
			case Commands.getNode:
				sendResponse(nodeAt(request.path));
				break;
			case Commands.setNodeIndex:
				GridNodes.setNodeIndex(nodeAt(request.path), request.index, request.newIndex);
				loaded();
				break;
			case Commands.createBookmark:
				GridNodes.createBookmark(nodeAt(request.path), request.url, request.title).then(loaded);
				break;
			case Commands.createFolder:
				GridNodes.createFolder(nodeAt(request.path), request.name).then(loaded);
				break;
			case Commands.deleteNode:
				GridNodes.deleteNode(nodeAt(request.path), request.id);
				loaded();
				break;
			case Commands.refreshNode: { // A tile deleted meanwhile is left alone
				const gridNode = tileAt(request);
				if(gridNode) GridNodes.refreshNode(gridNode).then(loaded);
				break;
			}
			case Commands.capturePage: {
				const gridNode = tileAt(request);
				if(gridNode) GridNodes.capturePage(gridNode).then(loaded);
				break;
			}
			case Commands.getImages:
				return app.Images.get(request.ids);
			case Commands.exportData:
				return app.Backup.export();
			case Commands.importData:
				return app.Backup.import(request.data);
			case Commands.getThemes:
				sendResponse(app.Themes.list);
				break;
			case Commands.setThemes:
				return app.Themes.save(request.themes);
			case Commands.openSettings:
				return app.openSettings(request.tab);
		}
	});
};
