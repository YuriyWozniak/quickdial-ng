#!/usr/bin/env node
// Makes the screenshots of Quick Dial NG (see README.md in this folder): the main set for the README and
// addons.mozilla.org, and more views for the website (qdng.srv.if.ua) in a subfolder.
//
// It runs the real extension pages from src/ in Chromium against the simulated Firefox API of the test
// harness (../mock.js), inside a drawn browser window (browser-frame.js). It fills the dial with invented
// sites (sites.js, dark-sites.js) or icons (icons.js) laid out like real dials, applies themes and takes
// the pictures. Nothing touches a real Firefox profile.
//
// Usage, from the test folder:  node screenshots/make-screenshots.js [--out <folder>]
// Default output: the screenshots folder at the top of the repository, and its website subfolder.
'use strict';
const fs = require('fs'), path = require('path');
const { ROOT, SRC, prepare, serve, launch } = require('../lib/harness');
const { SITES, WALLPAPER } = require('./sites.js');
const { DARK_SITES } = require('./dark-sites.js');
const { ICONS, DESKTOP_WALLPAPER, DAY_WALLPAPER } = require('./icons.js');
const { RETRO_ICONS, MONO_ICONS, RETRO_TITLES, RETRO_FOLDER, MONO_FOLDER, MONO_PATTERN } = require('./retro-icons.js');
const { FRAME_HEIGHT, frameHtml } = require('./browser-frame.js');

const args = process.argv.slice(2);
const OUT = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(ROOT, 'screenshots'));
const WEBSITE_OUT = path.join(OUT, 'website');
const WINDOW = { width: 1600, height: 1000 };   // the browser window, in CSS pixels
const SCALE = 1.6;                              // device pixels per CSS pixel: the pictures are 2560×1600
const CAPTURE = { width: 1280, height: 960 };   // page size of the tile pictures (4:3, like the tiles)
const ICON_CAPTURE = { width: 256, height: 256 };
const WALLPAPER_SIZE = { width: 2560, height: 1600 };
const DUSK_SIZE = { width: 1920, height: 1200 };
const VERSION = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8')).version;
const NodeType = { empty: 0, folder: 1, bookmark: 2 }; // as QDCommon.NodeType
const ImageMode = { stretch: 0, cover: 1, fit: 2 };    // as QDCommon.applyImageMode
const BACKGROUND_COVER = 1;                            // settings.backgroundMode: the picture covers the page
const SPLIT_TOP = 56, SPLIT_BOTTOM = 44;        // where the light and dark halves of settings.png meet at the top and bottom edge, in % of the width
const SETTINGS_URL = 'moz-extension://7c1e9a52-4b0d-4f3e-9a61-2d8b5f0c3e17/html/settings.html';
const EXTENSION_NAME = 'Quick Dial NG';
// Waits, in ms, for pages to draw; the background page is waited for with waitForBackgroundIdle()
const DIAL_WAIT = 1800, SETTINGS_WAIT = 1300, HOVER_WAIT = 500, SHOT_WAIT = 500, CLICK_WAIT = 300;
// How long the background page may take to settle (ms): after a settings change, and after loading a whole layout
const SETTLE_TIMEOUT = 20000, LOAD_TIMEOUT = 30000;
// JPEG quality of the tile pictures and of the wallpapers
const TILE_JPEG_QUALITY = 88, WALLPAPER_JPEG_QUALITY = 90;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------- a temporary copy of the extension, served over HTTP ----------
// The test harness (../lib/harness.js): the pages run in frames of index.html, which provides the mock API.
// Here the pages also get the real version number and English texts (the test mock returns message keys),
// the host page draws the browser window, the page frame fills the rest of it and the background frame is hidden.
const messages = JSON.parse(fs.readFileSync(path.join(SRC, '_locales', 'en', 'messages.json'), 'utf8'));
const extensionCopy = prepare({ prefix: 'qdng-shots-', pageScript: `
	browser.runtime.getManifest = () => ({ version: ${JSON.stringify(VERSION)} });
	browser.i18n.getMessage = (function(messages){ return function(key, substitutions){
		const entry = messages[key]; if (!entry) return key;
		substitutions = [].concat(substitutions === undefined ? [] : substitutions);
		return entry.message.replace(/\\$(\\w+)\\$/g, (placeholder, name) => ((entry.placeholders || {})[name.toLowerCase()] || {}).content || '')
			.replace(/\\$(\\d)/g, (placeholder, number) => substitutions[number - 1] === undefined ? '' : substitutions[number - 1]);
	}; })(${JSON.stringify(messages)});` });
{
	const index = fs.readFileSync(path.join(extensionCopy, 'index.html'), 'utf8');
	const frameSize = /frame\.style\.width = '1200px';\s*frame\.style\.height = '700px';/;
	if (!frameSize.test(index) || !index.includes('<body>')) throw new Error('test/index.html changed: frame size or body not found');
	fs.writeFileSync(path.join(extensionCopy, 'index.html'), index.replace(frameSize,
		`frame.style.width = '${WINDOW.width}px'; frame.style.height = role === 'bg' ? '0' : '${WINDOW.height - FRAME_HEIGHT}px'; frame.style.border = '0'; frame.style.display = 'block';`)
		.replace('<body>', '<body style="margin:0;overflow:hidden">' + frameHtml()));
}
let server;

// ---------- themes ----------
// The looks come from the built-in themes (src/js/themes.js), by id. One more is the user's own theme in the
// pictures: a built-in one with some values changed, saved in Settings › Themes.
const OWN_THEMES = {
	desktopDay: { name: 'Desktop (day)', description: 'Desktop with dark names, for a light wallpaper.', base: 'desktop', changes: {
		backgroundColor: '#dbe7f2', backgroundGradient: null,
		grid: { cells: { titleColor: '#13212e', titleColorHover: '#13212e', backgroundOpacityHover: .45, titleBackgroundOpacityHover: .45 } } } }
};

// ---------- layouts: what the Quick Dial folder holds and where each tile sits ----------
// A cell: { at: [row, column] (1-based; omitted: the next free cell), title, url, picture (key in the pictures),
// imageMode } or a folder { at, title, children: [cells] }. Cells without `at` fill the cells left free.
const site = (key, at) => ({ at, title: DARK_SITES[key].title, url: DARK_SITES[key].url, picture: 'dark:' + key });
const lightSite = title => ({ title, url: SITES.find(lightPage => lightPage.title === title).url, picture: 'light:' + title });
const folder = (title, at, children = []) => ({ at, title, children });
const plain = (title, host) => ({ title, url: `https://${host}.example/` }); // a bookmark whose tile is never shown
// Icon bookmarks: the dark sites, plus a few apps that are only icons
const ICON_ONLY = { calendar: 'Calendar', maps: 'Maps', news: 'News', weather: 'Weather', notes: 'Notes', terminal: 'Web terminal', market: 'Market' };
const iconTile = (key, at) => ({ at, title: DARK_SITES[key] ? DARK_SITES[key].title : ICON_ONLY[key],
	url: DARK_SITES[key] ? DARK_SITES[key].url : `https://${key}.example/`, picture: 'icon:' + key, imageMode: ImageMode.fit });

const SERVER_FOLDER = ['server', 'backup', 'monitor', 'webStats', 'dns', 'logs', 'mailQueue'].map(key => site(key));
const LAYOUTS = {
	// The sites grouped in the corners of a large grid, with room between the groups
	zones: { rows: 8, columns: 12, ratioX: 4, ratioY: 3, cells: [
		...['mail', 'drive', 'translate', 'photos', 'video', 'music'].map((k, i) => site(k, [1, i + 1])),
		site('vault', [1, 11]), site('cloud', [1, 12]),
		...['server', 'router', 'addons', 'repo'].map((k, i) => site(k, [4, i + 1])),
		site('secureMail', [8, 11]), site('assistant', [8, 12])] },
	// The same groups as categories, each with folders for the rest of its sites
	categories: { rows: 8, columns: 12, ratioX: 4, ratioY: 3, cells: [
		...['mail', 'drive', 'translate', 'photos'].map((k, i) => site(k, [1, i + 1])),
		folder('Office', [1, 5], [plain('Spreadsheets', 'sheets'), plain('Slides', 'slides'), plain('Forms', 'forms')]),
		site('vault', [1, 11]), site('cloud', [1, 12]), folder('Backups', [2, 12], [plain('Photo backup', 'photobackup'), plain('Phone backup', 'phonebackup')]),
		...['router', 'addons', 'repo'].map((k, i) => site(k, [4, i + 1])),
		folder('Servers', [4, 4], SERVER_FOLDER), folder('Projects', [5, 1], [plain('Garden planner', 'garden'), plain('Speed tiles', 'tiles')]),
		site('video', [6, 6]), site('music', [6, 7]), folder('Watch later', [6, 8], [plain('Kayak build', 'kayak'), plain('Glaciers', 'glaciers')]),
		folder('Archive', [7, 12], [plain('Old forum', 'forum'), plain('Old blog', 'blog')]), site('secureMail', [8, 11]), site('assistant', [8, 12])] },
	// Icons on a wallpaper, in columns at the edges like a computer desktop
	desktop: { rows: 8, columns: 14, ratioX: 1, ratioY: 1, cells: [
		...['mail', 'drive', 'translate', 'photos', 'video', 'music', 'calendar', 'maps'].map((k, i) => iconTile(k, [i + 1, 1])),
		...['notes', 'news', 'weather', 'market'].map((k, i) => iconTile(k, [i + 1, 2])),
		folder('Documents', [5, 2], [plain('Letters', 'letters')]),
		...['vault', 'cloud', 'terminal'].map((k, i) => iconTile(k, [i + 1, 14])), folder('Backups', [4, 14], [plain('Photo backup', 'photobackup')]),
		folder('Projects', [6, 14], [plain('Garden planner', 'garden')]),
		iconTile('repo', [7, 13]), iconTile('server', [7, 14]), iconTile('secureMail', [8, 13]), iconTile('assistant', [8, 14])] },
	// The usual speed dial: the light sites, then two folders
	speedDial: { rows: 3, columns: 5, ratioX: 4, ratioY: 3, cells: [...SITES.map(s => lightSite(s.title)),
		folder('Work', null, [plain('Timesheet', 'timesheet')]), folder('Travel', null, [plain('Ferries', 'ferries')])] }
};
// The categories as desktop icons: the same places on square tiles, the right half moved to the right edge (14 columns instead of 12)
LAYOUTS.categoryIcons = { ...LAYOUTS.categories, rows: 8, columns: 14, ratioX: 1, ratioY: 1,
	cells: LAYOUTS.categories.cells.map(c => c.children ? c : iconTile(Object.keys(DARK_SITES).find(k => DARK_SITES[k].title === c.title), c.at))
		.map(c => ({ ...c, at: [c.at[0], c.at[1] > LAYOUTS.categories.columns / 2 ? c.at[1] + 2 : c.at[1]] })) };

// The desktop with the retro icons, in colour and in black and white; titles: changed with the icons (key -> title)
const withIcons = (layout, set, titles = {}) => ({ ...layout, cells: layout.cells.map(cell => {
	if (!cell.picture) return cell;
	const key = cell.picture.slice(cell.picture.indexOf(':') + 1);
	return { ...cell, title: titles[key] || cell.title, picture: set + ':' + key };
}) });
LAYOUTS.retroDesktop = withIcons(LAYOUTS.desktop, 'retro', RETRO_TITLES);
LAYOUTS.monoDesktop = withIcons(LAYOUTS.desktop, 'mono');

/**
 * The bookmarks and the tile tree of a layout. Ids are given in order (b1, b2...).
 * @returns {{ bookmarks: object[], nodes: object[] }} bookmarks for the mock (mockState.bookmarkTree), nodes as original Quick Dial
 * data: a folder's children are its cells, with gaps; pictures inline, as Quick Dial kept them
 */
function buildTree(cells, columns, parentId, pictures, counter = { next: 1 }) {
	const bookmarks = [], nodes = [];
	const place = (position, node) => {
		let index = position ? (position[0] - 1) * columns + position[1] - 1 : nodes.findIndex(taken => !taken);
		if (index < 0) index = nodes.length;
		if (nodes[index]) throw new Error('two tiles in the same cell: ' + node.title);
		nodes[index] = node;
	};
	for (const cell of cells.filter(c => c.at).concat(cells.filter(c => !c.at))) {
		const id = 'b' + counter.next++;
		if (cell.children) {
			const inner = buildTree(cell.children, columns, id, pictures, counter);
			bookmarks.push({ id, type: 'folder', title: cell.title, parentId, children: inner.bookmarks });
			place(cell.at, { id, type: NodeType.folder, title: cell.title, children: inner.nodes });
		} else {
			bookmarks.push({ id, type: 'bookmark', title: cell.title, url: cell.url, parentId });
			const node = { id, type: NodeType.bookmark, title: cell.title, url: cell.url };
			if (cell.picture) node.image = pictures[cell.picture];
			if (cell.imageMode !== undefined) node.imageMode = cell.imageMode;
			place(cell.at, node);
		}
	}
	for (let i = 0; i < nodes.length; i++) if (!nodes[i]) nodes[i] = { type: NodeType.empty };
	return { bookmarks, nodes };
}

// ---------- pictures: tile captures, icons and backgrounds ----------
async function renderPictures(browser) {
	const capturePage = await browser.newPage({ viewport: CAPTURE, deviceScaleFactor: 1 });
	const pictures = {};
	const jpeg = async quality => 'data:image/jpeg;base64,' + (await capturePage.screenshot({ type: 'jpeg', quality })).toString('base64');
	const transparentPng = async () => 'data:image/png;base64,' + (await capturePage.screenshot({ type: 'png', omitBackground: true })).toString('base64');
	for (const lightPage of SITES) { await capturePage.setContent(lightPage.html); pictures['light:' + lightPage.title] = await jpeg(TILE_JPEG_QUALITY); }
	for (const [key, darkPage] of Object.entries(DARK_SITES)) { await capturePage.setContent(darkPage.html); pictures['dark:' + key] = await jpeg(TILE_JPEG_QUALITY); }
	await capturePage.setViewportSize(ICON_CAPTURE);
	for (const [key, html] of Object.entries(ICONS)) {
		await capturePage.setContent(html);
		pictures['icon:' + key] = await transparentPng();
	}
	for (const [set, icons] of [['retro', RETRO_ICONS], ['mono', MONO_ICONS]]) {
		for (const [key, html] of Object.entries(icons)) {
			await capturePage.setContent(html);
			pictures[set + ':' + key] = await transparentPng();
		}
	}
	for (const [name, html] of [['retroFolder', RETRO_FOLDER], ['monoFolder', MONO_FOLDER]]) {
		await capturePage.setContent(html); pictures[name] = 'url(' + await transparentPng() + ')';
	}
	await capturePage.setViewportSize(DUSK_SIZE); await capturePage.setContent(WALLPAPER); pictures.dusk = `url(${await jpeg(WALLPAPER_JPEG_QUALITY)})`;
	await capturePage.setViewportSize(WALLPAPER_SIZE);
	await capturePage.setContent(DESKTOP_WALLPAPER); pictures.night = `url(${await jpeg(WALLPAPER_JPEG_QUALITY)})`;
	await capturePage.setContent(DAY_WALLPAPER); pictures.day = `url(${await jpeg(WALLPAPER_JPEG_QUALITY)})`;
	await capturePage.setContent(MONO_PATTERN(WALLPAPER_SIZE.width, WALLPAPER_SIZE.height));
	pictures.monoPattern = 'url(data:image/png;base64,' + (await capturePage.screenshot({ type: 'png' })).toString('base64') + ')';
	await capturePage.close();
	return pictures;
}

// ---------- a browser window with the dial ----------
/**
 * Opens a window in the colour scheme ('light' or 'dark'), fills the Quick Dial folder with the layout
 * and applies a theme. look: { theme (a THEMES key, or 'anori' / 'classic'), wallpaper (a pictures key) }.
 * Returns helpers for the window.
 */
async function openDial(browser, port, scheme, layout, look, pictures, errors) {
	const context = await browser.newContext({ viewport: WINDOW, deviceScaleFactor: SCALE, colorScheme: scheme });
	const page = await context.newPage();
	page.on('pageerror', error => errors.push(String(error)));
	page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
	await page.goto(`http://127.0.0.1:${port}/index.html`);
	const tree = buildTree(layout.cells, layout.columns, 'qd', pictures);
	const backgroundIdle = timeout => page.evaluate(ms => waitForBackgroundIdle(ms), timeout);

	await page.evaluate(bookmarks => {
		const root = mockState.bookmarkTree, menu = root.children[0];
		root.type = 'folder'; menu.type = 'folder'; root.children[1].type = 'folder';
		menu.children.push({ id: 'qd', type: 'folder', title: 'Quick Dial', parentId: menu.id, children: bookmarks });
	}, tree.bookmarks);
	await page.evaluate(() => loadFrame('bg', 'bg.html')); await backgroundIdle(SETTLE_TIMEOUT);
	// The tiles go in as original Quick Dial data (pictures inside the tree), so they take the normal migration path into storage
	await page.evaluate(([nodes, grid]) => {
		const data = { version: 4, settings: mockState.storage.settings, node: JSON.parse(JSON.stringify(mockState.storage.node)) };
		Object.assign(data.settings.grid, grid);
		data.node.children = nodes;
		mockState.storage = JSON.parse(JSON.stringify(data));
	}, [tree.nodes, { rows: layout.rows, columns: layout.columns, ratioX: layout.ratioX, ratioY: layout.ratioY, folderIconMode: layout.ratioX === layout.ratioY ? ImageMode.fit : ImageMode.stretch }]);
	await page.evaluate(() => loadFrame('bg', 'bg.html')); await backgroundIdle(LOAD_TIMEOUT);

	const dialWindow = {
		context, page,
		/** Changes the settings in the background page: editSettings(settings, QDThemes, arg) edits them in place.
		 *  It runs in the page, so it can use only its arguments. */
		settings: async (editSettings, arg) => {
			await page.evaluate(`(() => { const background = backgroundPage(); const settings = JSON.parse(JSON.stringify(background.app.settings));
				(${editSettings})(settings, background.QDThemes, ${JSON.stringify(arg === undefined ? null : arg)}); return background.app.Settings.update(settings); })()`);
			await backgroundIdle(SETTLE_TIMEOUT);
		},
		/** Applies a look: a theme (a built-in id or an OWN_THEMES key), a background picture or none, and a folder picture
		 *  or the default one (all pictures are keys in the pictures). */
		look: async ({ theme, wallpaper, folder }) => {
			const own = OWN_THEMES[theme];
			await dialWindow.settings((settings, Themes, wanted) => {
				const merge = (base, changes) => {
					for (const key in changes) base[key] = changes[key] && typeof changes[key] == 'object' ? merge(base[key] || {}, changes[key]) : changes[key];
					return base;
				};
				const style = JSON.parse(JSON.stringify(Themes.BUILTIN.find(builtIn => builtIn.id === wanted.base).style));
				Themes.apply(settings, wanted.changes ? merge(style, wanted.changes) : style);
				settings.backgroundImage = wanted.wallpaper;
				if (wanted.wallpaper) settings.backgroundMode = wanted.cover;
				if (wanted.folder) settings.grid.folderIcon = wanted.folder;
			}, { base: own ? own.base : theme, changes: own ? own.changes : null, wallpaper: wallpaper ? pictures[wallpaper] : null, folder: folder ? pictures[folder] : null, cover: BACKGROUND_COVER });
		},
		/** Saves the user's own themes (OWN_THEMES keys) as they look when applied. */
		saveThemes: async keys => {
			const list = [];
			for (const key of keys) {
				await dialWindow.look({ theme: key });
				const style = await page.evaluate(() => backgroundPage().QDThemes.extract(backgroundPage().app.settings));
				list.push({ name: OWN_THEMES[key].name, description: OWN_THEMES[key].description, style });
			}
			await page.evaluate(themes => backgroundPage().app.Themes.save(themes), list);
		},
		/** Draws the browser window: tabs before the active one, then the active one; url and identity as setBrowser(). */
		browser: (tabs, url, identity) => page.evaluate(windowLook => setBrowser(windowLook), { tabs, url, identity }),
		/** (Re)loads the dial page, shows it as the New Tab and returns its frame. */
		dial: async (others = []) => {
			await page.evaluate(() => loadFrame('dial', 'dial.html')); await wait(DIAL_WAIT);
			const frame = page.frame({ url: /dial\.html/ });
			await dialWindow.browser([...others, { title: (await frame.title()) || 'New Tab', icon: 'qd', active: true }], '');
			return frame;
		},
		/** Opens Settings (optionally on a section) in the window, as its own tab, and returns its frame. */
		openSettings: async tab => {
			await page.evaluate(src => loadFrame('dial', src), 'html/settings.html' + (tab ? '?tab=' + tab.toLowerCase() : '')); await wait(SETTINGS_WAIT);
			const frame = page.frame({ url: /settings\.html/ });
			await dialWindow.browser([{ title: 'New Tab', icon: 'qd' }, { title: (await frame.title()) || EXTENSION_NAME + ' Settings', icon: 'qd', active: true }], SETTINGS_URL, EXTENSION_NAME);
			return frame;
		},
		/** Moves the mouse over the tile with this title (hover state), or away when no title is given. */
		hover: async (dial, title) => {
			if (!title) return page.mouse.move(2, 2);
			const box = await dial.locator('table.qd-grid a', { hasText: title }).first().boundingBox();
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3); await wait(HOVER_WAIT);
		},
		/** The window as a PNG buffer. */
		capture: async () => { await wait(SHOT_WAIT); return page.screenshot(); },
		/** Saves the window as <name>.png in the folder. */
		shot: async (name, folderPath = OUT) => {
			const file = path.join(folderPath, name + '.png');
			fs.writeFileSync(file, await dialWindow.capture());
			console.log('saved', path.relative(OUT, file));
		}
	};
	await dialWindow.look(look);
	return dialWindow;
}

// Two pictures of the same size as one: the left part of `left` and the right part of `right`, split on a slant (SPLIT_TOP to SPLIT_BOTTOM)
async function combine(browser, left, right, file) {
	const page = await browser.newPage({ viewport: WINDOW, deviceScaleFactor: SCALE });
	const img = (buffer, clip) => `<img src="data:image/png;base64,${buffer.toString('base64')}" style="position:absolute;inset:0;width:100%;height:100%;${clip}">`;
	await page.setContent(`<body style="margin:0;position:relative;width:${WINDOW.width}px;height:${WINDOW.height}px;overflow:hidden">${img(left, '')}
		${img(right, `clip-path:polygon(${SPLIT_TOP}% 0,100% 0,100% 100%,${SPLIT_BOTTOM}% 100%)`)}
		<svg style="position:absolute;inset:0" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="${SPLIT_TOP}" y1="0" x2="${SPLIT_BOTTOM}" y2="100" stroke="#8f8f9d" stroke-width="2" vector-effect="non-scaling-stroke"/></svg></body>`);
	await page.waitForLoadState('load');
	await page.screenshot({ path: file }); console.log('saved', path.relative(OUT, file));
	await page.close();
}

// The tabs open next to the dial in each scene, so the window looks used
const TABS = {
	mail: { title: 'Inbox (4) – Mailbox', icon: '#c25b4f' }, repo: { title: 'garden-planner · Repo', icon: '#7a7f88' },
	music: { title: 'Rainy day piano – Tunes', icon: '#8a5cc2' }, wiki: { title: 'Lighthouse – Wiki Notes', icon: '#8a94a6' }
};

// ---------- the screenshots ----------
async function main() {
	fs.mkdirSync(WEBSITE_OUT, { recursive: true });
	server = await serve(extensionCopy);
	const port = server.port;
	const browser = await launch(port);
	const errors = [];
	const pictures = await renderPictures(browser);
	const open = (scheme, layout, look) => openDial(browser, port, scheme, LAYOUTS[layout], look, pictures, errors);
	let dialWindow, dial;

	// ===== Main set: README and addons.mozilla.org =====
	// 1. Desktop icons on a wallpaper
	dialWindow = await open('dark', 'desktop', { theme: 'desktop', wallpaper: 'night' });
	dial = await dialWindow.dial([TABS.mail, TABS.repo]); await dialWindow.hover(dial, 'Photos'); await dialWindow.shot('dial-desktop');
	await dialWindow.context.close();

	// 2. Zones: groups in the corners of a large grid, the look of a real dial
	dialWindow = await open('dark', 'zones', { theme: 'plum' });
	dial = await dialWindow.dial([TABS.mail]); await dialWindow.hover(dial, 'Photos'); await dialWindow.shot('dial-zones');
	await dial.evaluate(() => app.editProperties([...document.querySelectorAll('.qd-grid a')].find(link => link.gridNode && link.gridNode.title === 'Photos')));
	await wait(SETTINGS_WAIT); await dialWindow.shot('properties');                                                  // 7. Properties, dark
	await dialWindow.context.close();

	// 3. Categories with folders, then 4. one folder opened
	dialWindow = await open('dark', 'categories', { theme: 'plum' });
	dial = await dialWindow.dial([TABS.music]); await dialWindow.hover(dial, 'Servers'); await dialWindow.shot('dial-categories');
	await dial.locator('table.qd-grid a', { hasText: 'Servers' }).first().click(); await wait(DIAL_WAIT);
	dial = dialWindow.page.frame({ url: /dial\.html/ }); await dialWindow.hover(dial, 'Monitoring'); await dialWindow.shot('dial-folder');
	await dialWindow.context.close();

	// 5. The usual speed dial in Anori
	dialWindow = await open('light', 'speedDial', { theme: 'anori' });
	dial = await dialWindow.dial([TABS.wiki]); await dialWindow.hover(dial, 'Streamly'); await dialWindow.shot('dial-anori');
	await dialWindow.context.close();

	// 6. Settings › Themes, light on the left and dark on the right
	const themesShot = async scheme => {
		const themesWindow = await open(scheme, 'zones', { theme: 'plum' });
		await themesWindow.saveThemes(['desktopDay']); await themesWindow.look({ theme: 'plum' });
		await themesWindow.openSettings('Themes');
		const shot = await themesWindow.capture(); await themesWindow.context.close();
		return shot;
	};
	await combine(browser, await themesShot('light'), await themesShot('dark'), path.join(OUT, 'settings.png'));

	// ===== Website set: more themes and views =====
	for (const [name, scheme, layout, look, hovered] of [
		['dial-zones-anori', 'dark', 'zones', { theme: 'anori' }, 'Photos'],
		['dial-zones-classic', 'dark', 'zones', { theme: 'classic' }, 'Photos'],
		['dial-zones-dusk', 'dark', 'zones', { theme: 'dusk', wallpaper: 'dusk' }, 'Streamly'],
		['dial-desktop-day', 'light', 'desktop', { theme: 'desktopDay', wallpaper: 'day' }, 'Drive'],
		['dial-categories-desktop', 'dark', 'categoryIcons', { theme: 'desktop', wallpaper: 'night' }, 'Servers'],
		['dial-retro-pc', 'light', 'retroDesktop', { theme: 'retro-pc', folder: 'retroFolder' }, 'Photos'],
		['dial-retro-mono', 'light', 'monoDesktop', { theme: 'retro-mono', wallpaper: 'monoPattern', folder: 'monoFolder' }, 'Photos'],
		['dial-classic', 'light', 'speedDial', { theme: 'classic' }, 'Weather'],
		['dial-picture', 'light', 'speedDial', { theme: 'dusk', wallpaper: 'dusk' }, 'Photos']]) {
		dialWindow = await open(scheme, layout, look);
		dial = await dialWindow.dial([TABS.mail]); await dialWindow.hover(dial, hovered); await dialWindow.shot(name, WEBSITE_OUT);
		await dialWindow.context.close();
	}
	// Every Settings section, light; Themes also dark; Properties light
	for (const scheme of ['light', 'dark']) {
		dialWindow = await open(scheme, 'zones', { theme: 'plum' });
		await dialWindow.saveThemes(['desktopDay']); await dialWindow.look({ theme: 'plum' });
		const settings = await dialWindow.openSettings('Themes');
		await dialWindow.shot(scheme === 'light' ? 'settings-themes' : 'settings-themes-dark', WEBSITE_OUT);
		if (scheme === 'light') {
			await settings.click('#TabTilesButton'); await wait(CLICK_WAIT); await dialWindow.shot('settings-tiles', WEBSITE_OUT);
			await settings.click('#TabPageButton'); await wait(CLICK_WAIT); await dialWindow.shot('settings-page', WEBSITE_OUT);
			await settings.click('#TabGridButton'); await wait(CLICK_WAIT); await dialWindow.shot('settings-grid', WEBSITE_OUT);
			dial = await dialWindow.dial();
			await dial.evaluate(() => app.editProperties([...document.querySelectorAll('.qd-grid a')].find(link => link.gridNode && link.gridNode.title === 'Photos')));
			await wait(SETTINGS_WAIT); await dialWindow.shot('properties', WEBSITE_OUT);
			// Glass: Tiles in Dusk over its sunset picture, with the blur, background opacity and shadow it sets
			// (the mouse moves away first: it is still where the Grid button was, which would show that button hovered)
			await dialWindow.look({ theme: 'dusk', wallpaper: 'dusk' });
			await dialWindow.openSettings('Tiles'); await dialWindow.hover(); await dialWindow.shot('settings-tiles-glass', WEBSITE_OUT);
		}
		await dialWindow.context.close();
	}

	await browser.close();
	if (errors.length) { console.error('Page errors:\n  ' + errors.join('\n  ')); process.exitCode = 1; }
	else console.log('Done:', OUT);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
	if (server) await server.close();
	fs.rmSync(extensionCopy, { recursive: true, force: true });
});
