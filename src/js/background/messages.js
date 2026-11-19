// Quick Dial NG — background page: messages from the dial, Settings and Properties pages
app.Messages = {};
app.Messages.Commands = QDCommon.Commands;

app.Messages.broadcast = function(cmd){ // Notify open Quick Dial pages; having none open is normal
	browser.runtime.sendMessage({ cmd }).catch(() => {});
};

app.Messages.init = function(){
	const C = app.Messages.Commands, G = app.GridNodes;
	const nodeAt = path => G.getNode(app.node, path.slice(1)); // pages send folder paths like "/Work/"
	const loaded = () => app.Messages.broadcast(C.gridNodesLoaded);
	// Each case answers through sendResponse, or returns a promise of the answer
	browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
		switch(request.cmd){
			case C.getSettings:
				sendResponse(app.settings);
				break;
			case C.setSettings: {
				const rootChanged = app.settings.grid.root != request.settings.grid.root;
				app.settings = request.settings;
				app.Settings.save();
				sendResponse(app.settings);
				app.Messages.broadcast(C.settingsChanged);
				if(rootChanged){
					app.Images.removeTree(app.node);
					app.node = { children: [] };
					G.sync(app.node, app.settings.grid.root, loaded);
				} else {
					loaded();
				}
				app.ContextMenus.updateMenu();
				break;
			}
			case C.getNodeByID:
				sendResponse(G.getNodeById(request.id));
				break;
			case C.updateNode:
				G.updateNode(G.getNodeById(request.id), request.value, loaded);
				break;
			case C.getNode:
				sendResponse(nodeAt(request.path));
				break;
			case C.setNodeIndex:
				G.setNodeIndex(nodeAt(request.path), request.index, request.newIndex, loaded);
				break;
			case C.createBookmark:
				G.createBookmark(nodeAt(request.path), request.url, request.title, loaded);
				break;
			case C.createFolder:
				G.createFolder(nodeAt(request.path), request.name, loaded);
				break;
			case C.deleteNode:
				G.deleteNode(nodeAt(request.path), request.id, loaded);
				break;
			case C.refreshNode:
				G.refreshNode(G.getChildNode(nodeAt(request.path), request.id), loaded);
				break;
			case C.capturePage:
				G.capturePage(G.getChildNode(nodeAt(request.path), request.id), loaded);
				break;
			case C.getImages:
				return app.Images.get(request.ids);
			case C.exportData:
				return app.Backup.export();
			case C.importData:
				return app.Backup.import(request.data);
			case C.getThemes:
				sendResponse(app.Themes.list);
				break;
			case C.setThemes:
				return app.Themes.save(request.themes);
			case C.openSettings:
				return app.openSettings(request.tab);
		}
	});
};
