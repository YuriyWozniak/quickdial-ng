var app = {};

var Image = null;

document.addEventListener("DOMContentLoaded", function(event) {
	app.init();
});

app.init = function(){
	document.addEventListener('keyup', function(e){
		switch(e.key){
			case 'Escape':
				window.frameElement.popup.close();
				break;
		}
	});
	app.Messages.getSettings(function(settings){
		app.settings = settings;
		app.Messages.getNodeByID(new URL(window.location).searchParams.get('id'), function(node){
			app.Messages.getImages([node.id], function(images){ // Images are stored separately: get this one
				if(node.image == '1') node.image = images[node.id] || null;
				app.initNode(node);
			});
		});
	});
	app.initButtons();
};

app.initNode = function(node){
			app.node = node;
			Title.value = node.title;
			if(node.imageMode == 0) ImageMode.value = 0;
			else if(node.imageMode) ImageMode.value = node.imageMode;
			ImagePreview.style.backgroundRepeat = 'no-repeat';
			ImagePreview.style.backgroundSize = '100% 100%';
			switch(node.type){
				case app.GridNodes.GridNodeType.folder:
					TitleLocked.parentNode.style.display = 'none';
					ImageLocked.parentNode.style.display = 'none';
					Url.parentNode.parentNode.style.display = 'none';
					if(node.image){
						if(node.image.indexOf('url(')>=0) Image = node.image;
						else Image = 'url(' + node.image + ')';
					} else Image = null;
					if(Image==null) ImagePreview.style.backgroundImage = app.settings.grid.folderIcon;
					else ImagePreview.style.backgroundImage = Image;
					break;
				case app.GridNodes.GridNodeType.bookmark:
					TitleLocked.checked = (node.titleLocked==true);
					ImageLocked.checked = (node.imageLocked==true);
					ImageDefault.style.display = 'none';
					Url.value = node.url;
					if(!node.image || node.image == '0') Image = null;
					else if(node.image.indexOf('url(')>=0) Image = node.image;
					else Image = 'url(' + node.image + ')';
					ImagePreview.style.backgroundImage = Image;
					break;
			}

			ImageReset.onclick = function(){
				switch(node.type){
					case app.GridNodes.GridNodeType.folder:
						if(node.image){
							Image = node.image;
							ImagePreview.style.backgroundImage = 'url(' + Image + ')';
						} else {
							Image = null;
							ImagePreview.style.backgroundImage = app.settings.grid.folderIcon;
						} 
						break;
					case app.GridNodes.GridNodeType.bookmark:
						Image = node.image;
						ImagePreview.style.backgroundImage = 'url(' + Image + ')';
						break;
				}
			};

			ImageDefault.onclick = function(){
				switch(node.type){
					case app.GridNodes.GridNodeType.folder:
						Image = null;
						ImagePreview.style.backgroundImage = app.settings.grid.folderIcon;
						break;
					case app.GridNodes.GridNodeType.bookmark:
						break;
				}
			};


			ImageFile.onclick = function(){
				this.value = null;
			}
			ImageFile.onchange = function(){
				var fileReader = new FileReader();
				fileReader.onload = function(e){
					app.toWebp(e.target.result, function(webp){ // Store uploads as compact WebP
						Image = webp;
						ImageFile.value = null;
						ImagePreview.style.backgroundImage = 'url(' + Image + ')';
					});
				}
				fileReader.readAsDataURL(ImageFile.files[0]);
			}
};

app.initButtons = function(){
	BtnOk.onclick = function(){
		BtnApply.onclick();
		window.frameElement.popup.close();
	}
	BtnApply.onclick = function(){
		switch(app.node.type){
			case app.GridNodes.GridNodeType.folder:
				app.Messages.updateNode(app.node.id, { title: Title.value, image: Image, imageMode: +(ImageMode.value) })
				break;
			case app.GridNodes.GridNodeType.bookmark:
				app.Messages.updateNode(app.node.id, { title: Title.value, titleLocked: TitleLocked.checked, imageLocked: ImageLocked.checked, url: Url.value, image: Image, imageMode: +(ImageMode.value) })
				break;
		}
	}
	BtnCancel.onclick = function(){
		window.frameElement.popup.close();
	}

	var tabButtons = Tabs.children[0].children[0].children[0];
	for(var i=0; i<tabButtons.children.length-1; i++){
		tabButtons.children[i].index = i;
		tabButtons.children[i].onclick = function(){
			for(var j=0; j<tabButtons.children.length-1; j++){
				if(j==this.index){
					tabButtons.children[j].className = 'TabButtonActive';
					Tabs.children[1].children[j].className = '';
				} else {
					tabButtons.children[j].className = 'TabButton';
					Tabs.children[1].children[j].className = 'hidden';
				}
			}
		}
	}

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
	gridNodesLoaded: 101
};
app.Messages.getSettings = function(callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getSettings }).then(callback);
};
app.Messages.getNodeByID = function(id, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getNodeByID, id: id }).then(callback);
};
app.Messages.getImages = function(ids, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.getImages, ids: ids }).then(callback, function(){ callback({}); });
};
app.Messages.updateNode = function(id, value, callback){
	browser.runtime.sendMessage({ cmd: app.Messages.Commands.updateNode, id: id, value: value }).then(callback);
};

app.GridNodes = {};
app.GridNodes.GridNodeType = { // GridNodeType
	back: -1,
	empty: 0,
	folder: 1,
	bookmark: 2
}

app.toWebp = function(dataUrl, callback){ // Re-encode an image to WebP (longest side max 1200 px)
	var img = document.createElement('img'); // (the global "Image" is reused by this page)
	img.onload = function(){
		var w = img.naturalWidth || 300, h = img.naturalHeight || 150, max = 1200;
		if(Math.max(w, h) > max){ var r = max / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
		var canvas = document.createElement('canvas');
		canvas.width = w; canvas.height = h;
		canvas.getContext('2d').drawImage(img, 0, 0, w, h);
		var webp = canvas.toDataURL('image/webp', 0.85);
		callback(webp.startsWith('data:image/webp') && webp.length < dataUrl.length ? webp : dataUrl);
	};
	img.onerror = function(){ callback(dataUrl); };
	img.src = dataUrl;
};
