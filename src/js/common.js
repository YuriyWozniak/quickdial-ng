// Quick Dial NG — values and helpers shared by the background page and the extension pages (QDCommon),
// and the pages' message client (QDClient). Loaded before the other scripts of each page (see manifest.json
// and the html files). Helpers that need a page's own DOM (dialogs, tabs, forms) live in js/ui.js instead.
/* exported QDCommon */
// eslint-disable-next-line no-var -- a global shared by the page's other scripts
var QDCommon = Object.freeze({
	// Message commands between the background page (js/background/) and the pages.
	// 202 and 208 (the menu's Settings and Import items, sent to the dial) are unused since 0.5.0:
	// those items open the Settings tab.
	Commands: Object.freeze({
		getSettings: 0,
		setSettings: 1,
		getNode: 2,
		getNodeById: 3,
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
		getThemes: 14,
		setThemes: 15,
		openSettings: 16,
		settingsChanged: 100,
		gridNodesLoaded: 101,
		menuCreateBookmark: 200,
		menuCreateFolder: 201,
		menuEditProperties: 203,
		menuRefreshNode: 204,
		menuCapturePage: 206,
		menuDeleteNode: 207,
		showSettingsSection: 209
	}),
	// Kinds of cell in the grid (node.type)
	NodeType: Object.freeze({
		back: -1,
		empty: 0,
		folder: 1,
		bookmark: 2
	}),

	// Pictures that are uploaded or imported are stored as WebP, longest side at most IMAGE_MAX_SIZE pixels.
	// The page background fills the whole screen, so it may be larger: BACKGROUND_MAX_SIZE.
	IMAGE_MAX_SIZE: 1200,
	BACKGROUND_MAX_SIZE: 2560,
	WEBP_QUALITY: 0.85,

	/**
	 * How a picture fills its box. style: an element's style or a CSS rule's style.
	 * Modes: 0 stretched, 1 cover, 2 contain, 3 original size, centred. -1 clears the three values, so the
	 * CSS rule underneath applies again (on the dial: the folder picture's mode, or stretched). Other values stretch.
	 * @param {number|string} mode
	 * @param {CSSStyleDeclaration} style
	 */
	applyImageMode(mode, style){
		if(+mode == -1){
			style.backgroundRepeat = style.backgroundSize = style.backgroundPosition = '';
			return;
		}
		const sizes = ['100% 100%', 'cover', 'contain', 'auto'];
		style.backgroundRepeat = 'no-repeat';
		style.backgroundSize = sizes[+mode] || sizes[0];
		style.backgroundPosition = 'center';
	},

	/**
	 * A picture as a CSS background-image value: a data URL or an address becomes url("..."), a url(...) value
	 * is kept as it is. No picture (empty, or '0': none could be made) gives null.
	 * @param {string} [image]
	 * @returns {string|null}
	 */
	toCssUrl(image){
		if(!image || image == '0') return null;
		return image.includes('url(') ? image : 'url("' + image + '")';
	},
	/**
	 * The other way: 'url("data:...")' gives 'data:...'. Anything else is returned as it is.
	 * @template T
	 * @param {T} image
	 * @returns {T|string}
	 */
	fromCssUrl(image){
		if(typeof image != 'string') return image;
		const m = image.match(/^\s*url\(\s*["']?(.*?)["']?\s*\)\s*$/);
		return m ? m[1] : image;
	},

	/**
	 * Re-encodes a picture (a data URL) as WebP, making it at most maxSize pixels on its longest side.
	 * Resolves with the original when it can't be read, is already a small enough WebP, or WebP would be larger.
	 * Never rejects.
	 * @param {string} dataUrl
	 * @param {number} [maxSize] none: keep the size
	 * @returns {Promise<string>}
	 */
	toWebp(dataUrl, maxSize){
		return new Promise(resolve => {
			if(typeof dataUrl != 'string' || !dataUrl.startsWith('data:image/')){
				resolve(dataUrl);
				return;
			}
			const img = new Image();
			img.onload = () => {
				let w = img.naturalWidth || 300;
				let h = img.naturalHeight || 150;
				const tooBig = maxSize && Math.max(w, h) > maxSize;
				if(dataUrl.startsWith('data:image/webp') && !tooBig){ // Already WebP: don't re-encode
					resolve(dataUrl);
					return;
				}
				if(tooBig){
					const ratio = maxSize / Math.max(w, h);
					w = Math.round(w * ratio);
					h = Math.round(h * ratio);
				}
				const canvas = document.createElement('canvas');
				canvas.width = w;
				canvas.height = h;
				canvas.getContext('2d').drawImage(img, 0, 0, w, h);
				const webp = canvas.toDataURL('image/webp', QDCommon.WEBP_QUALITY);
				resolve(webp.startsWith('data:image/webp') && webp.length < dataUrl.length ? webp : dataUrl);
			};
			img.onerror = () => resolve(dataUrl);
			img.src = dataUrl;
		});
	}
});

// The pages' side of the messages to the background page (js/background/messages.js answers them). Every
// method returns a promise of the answer. The pages call these instead of browser.runtime.sendMessage, so
// a command is spelt out in one place.
/* exported QDClient */
// eslint-disable-next-line no-var -- a global shared by the page's other scripts
var QDClient = (function(){
	const Commands = QDCommon.Commands;
	/** @param {number} cmd @param {object} [fields] */
	const send = (cmd, fields) => browser.runtime.sendMessage(Object.assign({ cmd }, fields));
	return Object.freeze({
		send,
		/**
		 * Calls handlers[request.cmd] for the messages the background page sends to every page (settingsChanged,
		 * gridNodesLoaded, the tile menu's commands). Answers nothing, so the background page's own answers are left alone.
		 * @param {Record<number, (request: any) => void>} handlers
		 */
		listen(handlers){
			browser.runtime.onMessage.addListener(request => {
				const handler = request && handlers[request.cmd];
				if(handler) handler(request);
			});
		},
		getSettings: () => send(Commands.getSettings),
		setSettings: settings => send(Commands.setSettings, { settings }),
		getThemes: () => send(Commands.getThemes).then(list => list || [], () => []),
		setThemes: themes => send(Commands.setThemes, { themes }),
		exportData: () => send(Commands.exportData),
		importData: data => send(Commands.importData, { data }),
		openSettings: tab => send(Commands.openSettings, { tab: typeof tab == 'string' ? tab : null }).catch(() => {}), // tab: a section ('backup'), optional
		// Tiles: `path` is the folder's path on the dial ("/", "/Work/"), `id` the tile's bookmark id
		getNode: path => send(Commands.getNode, { path }),
		getNodeById: id => send(Commands.getNodeById, { id }),
		getImages: ids => send(Commands.getImages, { ids }).then(images => images || {}, () => ({})), // { id: data URL }
		updateNode: (id, value) => send(Commands.updateNode, { id, value }), // Answers false when the tile is gone
		setNodeIndex: (path, index, newIndex) => send(Commands.setNodeIndex, { path, index, newIndex }),
		createBookmark: (path, url, title) => send(Commands.createBookmark, { path, url, title }),
		createFolder: (path, name) => send(Commands.createFolder, { path, name }),
		deleteNode: (path, id) => send(Commands.deleteNode, { path, id }),
		refreshNode: (path, id) => send(Commands.refreshNode, { path, id }),
		capturePage: (path, id) => send(Commands.capturePage, { path, id })
	});
})();
