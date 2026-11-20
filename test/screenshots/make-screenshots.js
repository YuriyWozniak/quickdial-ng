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
// Waits, in ms, for pages to draw; the background page is waited for with bgIdle()
const DIAL_WAIT = 1800, SETTINGS_WAIT = 1300, HOVER_WAIT = 500, SHOT_WAIT = 500, CLICK_WAIT = 300;
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- a temporary copy of the extension, served over HTTP ----------
// The test harness (../lib/harness.js): the pages run in frames of index.html, which provides the mock API.
// Here the pages also get the real version number and English texts (the test mock returns message keys),
// the host page draws the browser window, the page frame fills the rest of it and the background frame is hidden.
const messages = JSON.parse(fs.readFileSync(path.join(SRC, '_locales', 'en', 'messages.json'), 'utf8'));
const H = prepare({ prefix: 'qdng-shots-', pageScript: `
	browser.runtime.getManifest = () => ({ version: ${JSON.stringify(VERSION)} });
	browser.i18n.getMessage = (function(messages){ return function(key, subs){
		const m = messages[key]; if (!m) return key;
		subs = [].concat(subs === undefined ? [] : subs);
		return m.message.replace(/\\$(\\w+)\\$/g, (_, name) => ((m.placeholders || {})[name.toLowerCase()] || {}).content || '')
			.replace(/\\$(\\d)/g, (_, n) => subs[n - 1] === undefined ? '' : subs[n - 1]);
	}; })(${JSON.stringify(messages)});` });
{
	const index = fs.readFileSync(path.join(H, 'index.html'), 'utf8');
	const size = "f.style.width = '1200px'; f.style.height = '700px';";
	if (!index.includes(size) || !index.includes('<body>')) throw new Error('test/index.html changed: frame size or body not found');
	fs.writeFileSync(path.join(H, 'index.html'), index.replace(size,
		`f.style.width = '${WINDOW.width}px'; f.style.height = role === 'bg' ? '0' : '${WINDOW.height - FRAME_HEIGHT}px'; f.style.border = '0'; f.style.display = 'block';`)
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
const lightSite = title => { const s = SITES.find(x => x.title === title); return { title, url: s.url, picture: 'light:' + title }; };
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
const withIcons = (layout, set, titles = {}) => ({ ...layout, cells: layout.cells.map(c => {
	if (!c.picture) return c;
	const key = c.picture.slice(c.picture.indexOf(':') + 1);
	return { ...c, title: titles[key] || c.title, picture: set + ':' + key };
}) });
LAYOUTS.retroDesktop = withIcons(LAYOUTS.desktop, 'retro', RETRO_TITLES);
LAYOUTS.monoDesktop = withIcons(LAYOUTS.desktop, 'mono');

/**
 * The bookmarks and the tile tree of a layout. Ids are given in order (b1, b2...).
 * @returns {{ bookmarks: object[], nodes: object[] }} bookmarks for the mock (S.bm), nodes as original Quick Dial
 * data: a folder's children are its cells, with gaps; pictures inline, as Quick Dial kept them
 */
function buildTree(cells, columns, parentId, pictures, counter = { next: 1 }) {
	const bookmarks = [], nodes = [];
	const place = (at, node) => {
		let index = at ? (at[0] - 1) * columns + at[1] - 1 : nodes.findIndex(n => !n);
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
	const pg = await browser.newPage({ viewport: CAPTURE, deviceScaleFactor: 1 });
	const pictures = {};
	const jpeg = async quality => 'data:image/jpeg;base64,' + (await pg.screenshot({ type: 'jpeg', quality })).toString('base64');
	for (const s of SITES) { await pg.setContent(s.html); pictures['light:' + s.title] = await jpeg(88); }
	for (const [key, s] of Object.entries(DARK_SITES)) { await pg.setContent(s.html); pictures['dark:' + key] = await jpeg(88); }
	await pg.setViewportSize(ICON_CAPTURE);
	for (const [key, html] of Object.entries(ICONS)) {
		await pg.setContent(html);
		pictures['icon:' + key] = 'data:image/png;base64,' + (await pg.screenshot({ type: 'png', omitBackground: true })).toString('base64');
	}
	for (const [set, icons] of [['retro', RETRO_ICONS], ['mono', MONO_ICONS]]) {
		for (const [key, html] of Object.entries(icons)) {
			await pg.setContent(html);
			pictures[set + ':' + key] = 'data:image/png;base64,' + (await pg.screenshot({ type: 'png', omitBackground: true })).toString('base64');
		}
	}
	for (const [name, html] of [['retroFolder', RETRO_FOLDER], ['monoFolder', MONO_FOLDER]]) {
		await pg.setContent(html); pictures[name] = 'url(data:image/png;base64,' + (await pg.screenshot({ type: 'png', omitBackground: true })).toString('base64') + ')';
	}
	await pg.setViewportSize(DUSK_SIZE); await pg.setContent(WALLPAPER); pictures.dusk = `url(${await jpeg(90)})`;
	await pg.setViewportSize(WALLPAPER_SIZE);
	await pg.setContent(DESKTOP_WALLPAPER); pictures.night = `url(${await jpeg(90)})`;
	await pg.setContent(DAY_WALLPAPER); pictures.day = `url(${await jpeg(90)})`;
	await pg.setContent(MONO_PATTERN(WALLPAPER_SIZE.width, WALLPAPER_SIZE.height));
	pictures.monoPattern = 'url(data:image/png;base64,' + (await pg.screenshot({ type: 'png' })).toString('base64') + ')';
	await pg.close();
	return pictures;
}

// ---------- a browser window with the dial ----------
/**
 * Opens a window in the colour scheme ('light' or 'dark'), fills the Quick Dial folder with the layout
 * and applies a theme. look: { theme (a THEMES key, or 'anori' / 'classic'), wallpaper (a pictures key) }.
 * Returns helpers for the window.
 */
async function openDial(browser, port, scheme, layout, look, pictures, errors) {
	const ctx = await browser.newContext({ viewport: WINDOW, deviceScaleFactor: SCALE, colorScheme: scheme });
	const pg = await ctx.newPage();
	pg.on('pageerror', e => errors.push(String(e)));
	pg.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
	await pg.goto(`http://127.0.0.1:${port}/index.html`);
	const BG = "document.getElementById('bg').contentWindow";
	const tree = buildTree(layout.cells, layout.columns, 'qd', pictures);

	await pg.evaluate(bookmarks => {
		const menu = S.bm.children[0]; S.bm.type = 'folder'; menu.type = 'folder'; S.bm.children[1].type = 'folder';
		menu.children.push({ id: 'qd', type: 'folder', title: 'Quick Dial', parentId: menu.id, children: bookmarks });
	}, tree.bookmarks);
	await pg.evaluate("loadFrame('bg', 'bg.html')"); await pg.evaluate('bgIdle(20000)');
	// The tiles go in as original Quick Dial data (pictures inside the tree), so they take the normal migration path into storage
	await pg.evaluate(([nodes, grid]) => {
		const data = { version: 4, settings: S.storage.settings, node: JSON.parse(JSON.stringify(S.storage.node)) };
		Object.assign(data.settings.grid, grid);
		data.node.children = nodes;
		S.storage = JSON.parse(JSON.stringify(data));
	}, [tree.nodes, { rows: layout.rows, columns: layout.columns, ratioX: layout.ratioX, ratioY: layout.ratioY, folderIconMode: layout.ratioX === layout.ratioY ? ImageMode.fit : ImageMode.stretch }]);
	await pg.evaluate("loadFrame('bg', 'bg.html')"); await pg.evaluate('bgIdle(30000)');

	const s = {
		ctx, pg,
		/** Changes the settings in the background page: fn(settings, QDThemes, arg) edits them in place. */
		settings: async (fn, arg) => { await pg.evaluate(`(() => { const bg = ${BG}; const s = JSON.parse(JSON.stringify(bg.app.settings));
			(${fn})(s, bg.QDThemes, ${JSON.stringify(arg === undefined ? null : arg)}); return bg.app.Settings.update(s); })()`); await pg.evaluate('bgIdle(20000)'); },
		/** Applies a look: a theme (a built-in id or an OWN_THEMES key), a background picture or none, and a folder picture
		 *  or the default one (all pictures are keys in the pictures). */
		look: async ({ theme, wallpaper, folder }) => {
			const own = OWN_THEMES[theme];
			await s.settings((st, T, a) => {
				const merge = (base, over) => { for (const k in over) base[k] = over[k] && typeof over[k] == 'object' ? merge(base[k] || {}, over[k]) : over[k]; return base; };
				const style = JSON.parse(JSON.stringify(T.BUILTIN.find(t => t.id === a.base).style));
				T.apply(st, a.changes ? merge(style, a.changes) : style);
				st.backgroundImage = a.wallpaper;
				if (a.wallpaper) st.backgroundMode = a.cover;
				if (a.folder) st.grid.folderIcon = a.folder;
			}, { base: own ? own.base : theme, changes: own ? own.changes : null, wallpaper: wallpaper ? pictures[wallpaper] : null, folder: folder ? pictures[folder] : null, cover: BACKGROUND_COVER });
		},
		/** Saves the user's own themes (OWN_THEMES keys) as they look when applied. */
		saveThemes: async keys => {
			const list = [];
			for (const key of keys) {
				await s.look({ theme: key });
				list.push({ name: OWN_THEMES[key].name, description: OWN_THEMES[key].description, style: await pg.evaluate(`${BG}.QDThemes.extract(${BG}.app.settings)`) });
			}
			await pg.evaluate(`${BG}.app.Themes.save(${JSON.stringify(list)})`);
		},
		/** Draws the browser window: tabs before the active one, then the active one; url and identity as setBrowser(). */
		browser: (tabs, url, identity) => pg.evaluate(o => setBrowser(o), { tabs, url, identity }),
		/** (Re)loads the dial page, shows it as the New Tab and returns its frame. */
		dial: async (others = []) => {
			await pg.evaluate("loadFrame('dial', 'dial.html')"); await wait(DIAL_WAIT);
			const frame = pg.frame({ url: /dial\.html/ });
			await s.browser([...others, { title: (await frame.title()) || 'New Tab', icon: 'qd', active: true }], '');
			return frame;
		},
		/** Opens Settings (optionally on a section) in the window, as its own tab, and returns its frame. */
		openSettings: async tab => {
			await pg.evaluate(`loadFrame('dial', 'html/settings.html${tab ? '?tab=' + tab.toLowerCase() : ''}')`); await wait(SETTINGS_WAIT);
			const frame = pg.frame({ url: /settings\.html/ });
			await s.browser([{ title: 'New Tab', icon: 'qd' }, { title: (await frame.title()) || EXTENSION_NAME + ' Settings', icon: 'qd', active: true }], SETTINGS_URL, EXTENSION_NAME);
			return frame;
		},
		/** Moves the mouse over the tile with this title (hover state), or away when no title is given. */
		hover: async (dial, title) => {
			if (!title) return pg.mouse.move(2, 2);
			const box = await dial.locator('table.qd-grid a', { hasText: title }).first().boundingBox();
			await pg.mouse.move(box.x + box.width / 2, box.y + box.height / 3); await wait(HOVER_WAIT);
		},
		/** The window as a PNG buffer. */
		capture: async () => { await wait(SHOT_WAIT); return pg.screenshot(); },
		/** Saves the window as <name>.png in the folder. */
		shot: async (name, folderPath = OUT) => { fs.writeFileSync(path.join(folderPath, name + '.png'), await s.capture()); console.log('saved', path.relative(OUT, path.join(folderPath, name + '.png'))); }
	};
	await s.look(look);
	return s;
}

// Scrolls the Settings content so `selector` sits just below the top edge (below a sticky table header if there is one)
const scrollTo = (frame, selector, offset = 16) => frame.evaluate(([sel, off]) => {
	const content = document.getElementById('Content'), el = document.querySelector(sel);
	content.scrollTop += el.getBoundingClientRect().top - content.getBoundingClientRect().top - off;
}, [selector, offset]);

// Two pictures of the same size as one: the left part of `left` and the right part of `right`, split on a slant (SPLIT_TOP to SPLIT_BOTTOM)
async function combine(browser, left, right, file) {
	const pg = await browser.newPage({ viewport: WINDOW, deviceScaleFactor: SCALE });
	const img = (buf, clip) => `<img src="data:image/png;base64,${buf.toString('base64')}" style="position:absolute;inset:0;width:100%;height:100%;${clip}">`;
	await pg.setContent(`<body style="margin:0;position:relative;width:${WINDOW.width}px;height:${WINDOW.height}px;overflow:hidden">${img(left, '')}
		${img(right, `clip-path:polygon(${SPLIT_TOP}% 0,100% 0,100% 100%,${SPLIT_BOTTOM}% 100%)`)}
		<svg style="position:absolute;inset:0" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="${SPLIT_TOP}" y1="0" x2="${SPLIT_BOTTOM}" y2="100" stroke="#8f8f9d" stroke-width="2" vector-effect="non-scaling-stroke"/></svg></body>`);
	await pg.waitForLoadState('load');
	await pg.screenshot({ path: file }); console.log('saved', path.relative(OUT, file));
	await pg.close();
}

// The tabs open next to the dial in each scene, so the window looks used
const TABS = {
	mail: { title: 'Inbox (4) – Mailbox', icon: '#c25b4f' }, repo: { title: 'garden-planner · Repo', icon: '#7a7f88' },
	music: { title: 'Rainy day piano – Tunes', icon: '#8a5cc2' }, wiki: { title: 'Lighthouse – Wiki Notes', icon: '#8a94a6' }
};

// ---------- the screenshots ----------
async function main() {
	fs.mkdirSync(WEBSITE_OUT, { recursive: true });
	server = await serve(H);
	const port = server.port;
	const browser = await launch(port);
	const errors = [];
	const pictures = await renderPictures(browser);
	const open = (scheme, layout, look) => openDial(browser, port, scheme, LAYOUTS[layout], look, pictures, errors);
	let s, dial;

	// ===== Main set: README and addons.mozilla.org =====
	// 1. Desktop icons on a wallpaper
	s = await open('dark', 'desktop', { theme: 'desktop', wallpaper: 'night' });
	dial = await s.dial([TABS.mail, TABS.repo]); await s.hover(dial, 'Photos'); await s.shot('dial-desktop');
	await s.ctx.close();

	// 2. Zones: groups in the corners of a large grid, the look of a real dial
	s = await open('dark', 'zones', { theme: 'plum' });
	dial = await s.dial([TABS.mail]); await s.hover(dial, 'Photos'); await s.shot('dial-zones');
	await dial.evaluate(() => app.editProperties([...document.querySelectorAll('.qd-grid a')].find(a => a.gridNode && a.gridNode.title === 'Photos')));
	await wait(SETTINGS_WAIT); await s.shot('properties');                                                  // 7. Properties, dark
	await s.ctx.close();

	// 3. Categories with folders, then 4. one folder opened
	s = await open('dark', 'categories', { theme: 'plum' });
	dial = await s.dial([TABS.music]); await s.hover(dial, 'Servers'); await s.shot('dial-categories');
	await dial.locator('table.qd-grid a', { hasText: 'Servers' }).first().click(); await wait(DIAL_WAIT);
	dial = s.pg.frame({ url: /dial\.html/ }); await s.hover(dial, 'Monitoring'); await s.shot('dial-folder');
	await s.ctx.close();

	// 5. The usual speed dial in Anori
	s = await open('light', 'speedDial', { theme: 'anori' });
	dial = await s.dial([TABS.wiki]); await s.hover(dial, 'Streamly'); await s.shot('dial-anori');
	await s.ctx.close();

	// 6. Settings › Themes, light on the left and dark on the right
	const themesShot = async scheme => {
		const w = await open(scheme, 'zones', { theme: 'plum' });
		await w.saveThemes(['desktopDay']); await w.look({ theme: 'plum' });
		const settings = await w.openSettings('Themes');
		await scrollTo(settings, '#TabThemes .qd-card');
		const shot = await w.capture(); await w.ctx.close();
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
		s = await open(scheme, layout, look);
		dial = await s.dial([TABS.mail]); await s.hover(dial, hovered); await s.shot(name, WEBSITE_OUT);
		await s.ctx.close();
	}
	// Every Settings section, light; Themes also dark; Properties light
	for (const scheme of ['light', 'dark']) {
		s = await open(scheme, 'zones', { theme: 'plum' });
		await s.saveThemes(['desktopDay']); await s.look({ theme: 'plum' });
		const settings = await s.openSettings('Themes');
		await scrollTo(settings, '#TabThemes .qd-card'); await s.shot(scheme === 'light' ? 'settings-themes' : 'settings-themes-dark', WEBSITE_OUT);
		if (scheme === 'light') {
			await settings.click('#TabTilesButton'); await wait(CLICK_WAIT); await s.shot('settings-tiles', WEBSITE_OUT);
			await scrollTo(settings, 'tr:has(#GridCellsBackgroundColor)', 44); await s.shot('settings-tiles-glass', WEBSITE_OUT);
			await settings.click('#TabPageButton'); await wait(CLICK_WAIT); await s.shot('settings-page', WEBSITE_OUT);
			await settings.click('#TabGridButton'); await wait(CLICK_WAIT); await s.shot('settings-grid', WEBSITE_OUT);
			dial = await s.dial();
			await dial.evaluate(() => app.editProperties([...document.querySelectorAll('.qd-grid a')].find(a => a.gridNode && a.gridNode.title === 'Photos')));
			await wait(SETTINGS_WAIT); await s.shot('properties', WEBSITE_OUT);
		}
		await s.ctx.close();
	}

	await browser.close();
	if (errors.length) { console.error('Page errors:\n  ' + errors.join('\n  ')); process.exitCode = 1; }
	else console.log('Done:', OUT);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
	if (server) await server.close();
	fs.rmSync(H, { recursive: true, force: true });
});
