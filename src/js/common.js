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
		findSiteIcons: 17,
		useSiteIcon: 18,
		applyTilePicture: 19,
		drawIcon: 20,
		iconSets: 21,
		iconSet: 22,
		downloadIconSet: 23,
		removeIconSet: 24,
		settingsChanged: 100,
		gridNodesLoaded: 101,
		menuCreateBookmark: 200,
		menuCreateFolder: 201,
		menuEditProperties: 203,
		menuRefreshNode: 204,
		menuCapturePage: 206,
		menuDeleteNode: 207,
		showSettingsSection: 209,
		menuUseSiteIcon: 210
	}),
	// Kinds of cell in the grid (node.type)
	NodeType: Object.freeze({
		back: -1,
		empty: 0,
		folder: 1,
		bookmark: 2
	}),
	// Where a tile opens its site or folder (grid.openBookmarkMethod, grid.openFolderMethod)
	OpenIn: Object.freeze({
		thisTab: 0,
		newTab: 1
	}),
	// How a picture fills its box (applyImageMode): backgroundMode, grid.backIconMode, grid.folderIconMode and
	// a tile's imageMode. `inherit` is a tile's "Default": the folder picture's mode, or stretched.
	ImageMode: Object.freeze({
		inherit: -1,
		stretch: 0,
		cover: 1,
		contain: 2,
		original: 3
	}),
	// Where a tile's picture comes from (node.imageSource): Refresh makes the same kind of picture again.
	// A tile without one shows a screenshot of its page (`page` is never stored).
	ImageSource: Object.freeze({
		page: 0,
		siteIcon: 1, // the site's own icon (js/background/siteicons.js)
		letter: 2, // a letter tile, for a site without an icon
		file: 3, // a picture the user chose, dropped or pasted: Refresh keeps it
		icon: 4 // an icon of the icon picker's sets (js/background/iconsets.js), chosen in Properties: Refresh keeps it
	}),
	// The picture a new tile gets (grid.newTilePicture), and what Settings › Tiles › Apply to tiles makes
	TilePicture: Object.freeze({
		page: 0, // a screenshot of the page
		siteIcon: 1, // the site's icon, or a letter tile when it has none
		siteIconOrPage: 2 // the site's icon, or a screenshot when it has none
	}),

	DIAL_PAGE: '/dial.html',
	// The built-in Back and folder pictures, as CSS values like the settings hold them
	BACK_ICON: 'url(/img/back.svg)',
	FOLDER_ICON: 'url(/img/folder.svg)',
	// Tile shape (width : height) of a new install, and wherever the setting is missing
	TILE_RATIO_X: 4,
	TILE_RATIO_Y: 3,
	// A full backup file (Settings › Backup): { format, version, settings, node, images, themes }
	BACKUP_FORMAT: 'quickdial-ng',

	// Pictures that are uploaded or imported are stored as WebP, longest side at most IMAGE_MAX_SIZE pixels.
	// The page background fills the whole screen, so it may be larger: BACKGROUND_MAX_SIZE.
	IMAGE_MAX_SIZE: 1200,
	BACKGROUND_MAX_SIZE: 2560,
	WEBP_QUALITY: 0.85,

	// ---------- texts and their language ----------
	// The texts follow Firefox's language (browser.i18n) unless the Language setting (settings.language) picks
	// one of LANGUAGES. The background page reads the chosen language's messages.json (app.Language) and keeps
	// { language, messages: { key: text } } in localStorage under LANGUAGE_KEY; every page reads that copy when
	// it starts and again when the settings change (useLanguage), so it draws in the right language at once.

	// The languages of _locales (folder names, quoted as they are), each named in its own language (the Language list in Settings)
	LANGUAGES: Object.freeze({
		'de': 'Deutsch', 'en': 'English', 'es': 'Español', 'fr': 'Français', 'he_IL': 'עברית', 'it': 'Italiano',
		'pl': 'Polski', 'pt_BR': 'Português (Brasil)', 'ru': 'Русский', 'sr': 'Српски', 'uk': 'Українська'
	}),
	RTL_LANGUAGE: /^(ar|fa|he|ur|yi)([-_]|$)/, // languages written right to left, by their first subtag
	LANGUAGE_KEY: 'language',
	/** The language chosen in Settings and its texts; '' and null: Firefox's own. Set by useLanguage only.
	 *  @type {{ language: string, messages: Record<string, string> | null }} */
	_chosen: { language: '', messages: null },

	/**
	 * Shows the texts in this language: { language: a LANGUAGES key, messages }, or null for Firefox's own.
	 * Without an argument, the copy the background page keeps in localStorage.
	 * @param {{ language: string, messages: Record<string, string> } | null} [chosen]
	 */
	useLanguage(chosen){
		if(chosen === undefined){
			try { chosen = JSON.parse(localStorage.getItem(QDCommon.LANGUAGE_KEY)); } catch(e){ chosen = null; }
		}
		const valid = !!chosen && Object.prototype.hasOwnProperty.call(QDCommon.LANGUAGES, chosen.language) && !!chosen.messages && typeof chosen.messages == 'object';
		QDCommon._chosen.language = valid ? chosen.language : '';
		QDCommon._chosen.messages = valid ? chosen.messages : null;
	},
	/** The language of the texts as a language tag ('uk', 'pt-BR'): for lang attributes and Intl. @returns {string} */
	language(){
		return QDCommon._chosen.language ? QDCommon._chosen.language.replace('_', '-') : browser.i18n.getUILanguage();
	},
	/** The writing direction of the texts: 'rtl' or 'ltr'. @returns {string} */
	direction(){
		if(QDCommon._chosen.language) return QDCommon.RTL_LANGUAGE.test(QDCommon._chosen.language) ? 'rtl' : 'ltr';
		return browser.i18n.getMessage('@@bidi_dir') || 'ltr';
	},
	/**
	 * A text from the language files (_locales/<language>/messages.json), with $1, $2... filled from the
	 * substitutions. A key that has no text gives the key itself, so a missing text shows up instead of an empty label.
	 * @param {string} key
	 * @param {...(string|number)} substitutions
	 * @returns {string}
	 */
	text(key, ...substitutions){
		const own = QDCommon._chosen.messages && QDCommon._chosen.messages[key];
		if(typeof own == 'string') return own.replace(/\$(\d)/g, (_, n) => substitutions[n - 1] === undefined ? '' : String(substitutions[n - 1]));
		return browser.i18n.getMessage(key, substitutions.map(String)) || key;
	},
	/**
	 * A text with a number in it, in the plural form the language uses for that number: the key followed by
	 * One, Two, Few, Many or Other (the Intl.PluralRules categories). A form a language doesn't have falls back
	 * to Other. $1 is the number. countText('countTiles', 3) -> "3 tiles"
	 * @param {string} key
	 * @param {number} count
	 * @returns {string}
	 */
	countText(key, count){
		const form = new Intl.PluralRules(QDCommon.language()).select(count);
		const formKey = key + form.charAt(0).toUpperCase() + form.slice(1), text = QDCommon.text(formKey, count);
		return text == formKey ? QDCommon.text(key + 'Other', count) : text;
	},

	/**
	 * Height : width of a tile (grid.ratioY / grid.ratioX), in the default shape where a value is missing.
	 * @param {{ ratioX?: number|string, ratioY?: number|string }} grid
	 * @returns {number}
	 */
	tileRatio(grid){
		return (+grid.ratioY || QDCommon.TILE_RATIO_Y) / (+grid.ratioX || QDCommon.TILE_RATIO_X);
	},
	/**
	 * Whether a value is one of QDCommon.TilePicture (stored settings and messages may hold anything).
	 * @param {any} value
	 * @returns {boolean}
	 */
	isTilePicture(value){
		return Object.values(QDCommon.TilePicture).some(kind => kind === value);
	},

	/**
	 * How a picture fills its box. style: an element's style or a CSS rule's style.
	 * Modes (ImageMode): stretched, cover, contain, original size, centred. `inherit` clears the three values, so
	 * the CSS rule underneath applies again (on the dial: the folder picture's mode, or stretched). Other values stretch.
	 * @param {number|string} mode
	 * @param {CSSStyleDeclaration} style
	 */
	applyImageMode(mode, style){
		if(+mode == QDCommon.ImageMode.inherit){
			style.backgroundRepeat = style.backgroundSize = style.backgroundPosition = '';
			return;
		}
		const sizes = ['100% 100%', 'cover', 'contain', 'auto']; // background-size of each ImageMode, in their order
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
		const match = image.match(/^\s*url\(\s*["']?(.*?)["']?\s*\)\s*$/);
		return match ? match[1] : image;
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
				let width = img.naturalWidth || 300;
				let height = img.naturalHeight || 150;
				const tooBig = maxSize && Math.max(width, height) > maxSize;
				if(dataUrl.startsWith('data:image/webp') && !tooBig){ // Already WebP: don't re-encode
					resolve(dataUrl);
					return;
				}
				if(tooBig){
					const ratio = maxSize / Math.max(width, height);
					width = Math.round(width * ratio);
					height = Math.round(height * ratio);
				}
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				canvas.getContext('2d').drawImage(img, 0, 0, width, height);
				const webp = canvas.toDataURL('image/webp', QDCommon.WEBP_QUALITY);
				resolve(webp.startsWith('data:image/webp') && webp.length < dataUrl.length ? webp : dataUrl);
			};
			img.onerror = () => resolve(dataUrl);
			img.src = dataUrl;
		});
	}
});
QDCommon.useLanguage(); // the language chosen in Settings, before the page draws anything

// The pages' side of the messages to the background page (js/background/messages.js answers them). Every
// method returns a promise of the answer. The pages call these instead of browser.runtime.sendMessage, so
// a command is spelt out in one place.
/* exported QDClient */
// eslint-disable-next-line no-var -- a global shared by the page's other scripts
var QDClient = (function(){
	const Commands = QDCommon.Commands;
	/** @param {number} cmd @param {object} [fields] */
	const send = (cmd, fields) => browser.runtime.sendMessage(Object.assign({ cmd }, fields));
	const noIcons = () => ({ title: null, icons: [], letter: null }); // findSiteIcons when the background page can't answer
	return Object.freeze({
		send,
		/**
		 * Calls handlers[request.cmd] for the messages the background page sends to every page (settingsChanged,
		 * gridNodesLoaded, the tile menu's commands). Answers nothing, so the background page's own answers are left alone.
		 * When the settings change, the texts follow first: the language may be another one.
		 * @param {Record<number, (request: any) => void>} handlers
		 */
		listen(handlers){
			browser.runtime.onMessage.addListener(request => {
				if(request && request.cmd == Commands.settingsChanged) QDCommon.useLanguage();
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
		capturePage: (path, id) => send(Commands.capturePage, { path, id }),
		useSiteIcon: (path, id) => send(Commands.useSiteIcon, { path, id }),
		// Every tile whose picture isn't kept or the user's own gets one of this kind (QDCommon.TilePicture); answers the number of tiles
		applyTilePicture: kind => send(Commands.applyTilePicture, { kind }).then(count => count || 0),
		// An icon of the icon picker as a tile picture: { image: data URL, width, height, isVector, background: '#rrggbb' or null }.
		// Answers the picture (a WebP data URL), or null when the icon can't be drawn.
		drawIcon: icon => send(Commands.drawIcon, { icon }).then(picture => picture || null, () => null),
		// The icon picker's sets and whether each is downloaded (see js/background/iconsets.js); [] when they can't be read
		iconSets: () => send(Commands.iconSets).then(sets => sets || [], () => []),
		// A downloaded set, as in its file, or null
		iconSet: name => send(Commands.iconSet, { name }).then(set => set || null, () => null),
		// Downloads a set: answers null when it is kept, else why it isn't (a text)
		downloadIconSet: name => send(Commands.downloadIconSet, { name }).then(answer => answer ? answer.error : 'no answer', e => String(e && e.message || e)),
		removeIconSet: name => send(Commands.removeIconSet, { name }),
		// The icons of a site and a letter tile for it, as tile pictures: { title, icons: [{ picture, width, height, isVector }], letter }
		findSiteIcons: (url, title) => send(Commands.findSiteIcons, { url, title }).then(found => found || noIcons(), noIcons)
	});
})();
