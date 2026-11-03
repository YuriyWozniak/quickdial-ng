#!/usr/bin/env node
// Makes the README screenshots of Quick Dial NG (see README.md in this folder).
//
// It runs the real extension pages from src/ in Chromium against the simulated Firefox API of the
// test harness (../mock.js), fills the dial with the invented sites from sites.js, applies themes
// and takes the pictures. Nothing touches a real Firefox profile.
//
// Usage, from the test folder:  node screenshots/make-screenshots.js [--out <folder>]
// Default output: the screenshots folder at the top of the repository.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('Playwright not found. Run "npm install" in the test folder.'); process.exit(1); }

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const TEST = path.join(ROOT, 'test');
const { SITES, WALLPAPER } = require('./sites.js');

const args = process.argv.slice(2);
const OUT = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(ROOT, 'screenshots'));
const VIEW = { width: 1280, height: 800 };      // browser window the screenshots show
const CAPTURE = { width: 1280, height: 960 };   // page size used for the tile pictures (4:3, like the tiles)
const VERSION = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8')).version;
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- a temporary copy of the extension, served over HTTP ----------
// Same setup as test-storage.js: the pages run in frames of index.html, which provides the mock API.
// The dial frame is sized to the screenshot and the background frame is hidden.
const H = fs.mkdtempSync(path.join(os.tmpdir(), 'qdng-shots-'));
fs.cpSync(SRC, H, { recursive: true });
fs.copyFileSync(path.join(TEST, 'mock.js'), path.join(H, 'mock.js'));
{
	const index = fs.readFileSync(path.join(TEST, 'index.html'), 'utf8');
	const size = "f.style.width = '1200px'; f.style.height = '700px';";
	if (!index.includes(size)) throw new Error('test/index.html changed: frame size not found');
	fs.writeFileSync(path.join(H, 'index.html'), index.replace(size,
		`f.style.width = '${VIEW.width}px'; f.style.height = role === 'bg' ? '0' : '${VIEW.height}px'; f.style.border = '0'; f.style.display = 'block';`).replace('<body>', '<body style="margin:0">'));
}
// Background page: the scripts listed in the manifest, after the mock
const bgScripts = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8')).background.scripts;
fs.writeFileSync(path.join(H, 'bg.html'), '<!doctype html><html><head><script>window.browser = top.makeBrowser(window, "bg");</script>'
	+ bgScripts.map(s => `<script src="${s}"></script>`).join('') + '</head><body></body></html>');
// Extension pages: the mock first, with the real version number and English texts (the test mock returns message keys)
const messages = JSON.parse(fs.readFileSync(path.join(SRC, '_locales', 'en', 'messages.json'), 'utf8'));
const pageMock = `<script>window.browser = top.makeBrowser(window, "dial");
	browser.runtime.getManifest = () => ({ version: ${JSON.stringify(VERSION)} });
	browser.i18n.getMessage = (function(messages){ return function(key, subs){
		const m = messages[key]; if (!m) return key;
		subs = [].concat(subs === undefined ? [] : subs);
		return m.message.replace(/\\$(\\w+)\\$/g, (_, name) => ((m.placeholders || {})[name.toLowerCase()] || {}).content || '')
			.replace(/\\$(\\d)/g, (_, n) => subs[n - 1] === undefined ? '' : subs[n - 1]);
	}; })(${JSON.stringify(messages)});</script>`;
for (const f of ['dial.html', 'html/settings.html', 'html/properties.html']) {
	const p = path.join(H, f);
	fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/<head[^>]*>/, m => m + pageMock));
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
	'.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
	const file = path.join(H, decodeURIComponent(new URL(req.url, 'http://x').pathname));
	if (!file.startsWith(H) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
	res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
	fs.createReadStream(file).pipe(res);
});

// ---------- pictures: tile captures and the background picture ----------
async function renderPictures(browser) {
	const page = await browser.newPage({ viewport: CAPTURE, deviceScaleFactor: 1 });
	const thumbs = {};
	for (const site of SITES) {
		await page.setContent(site.html);
		thumbs[site.title] = 'data:image/jpeg;base64,' + (await page.screenshot({ type: 'jpeg', quality: 88 })).toString('base64');
	}
	await page.setViewportSize({ width: 1920, height: 1200 });
	await page.setContent(WALLPAPER);
	const wallpaper = 'url(data:image/jpeg;base64,' + (await page.screenshot({ type: 'jpeg', quality: 90 })).toString('base64') + ')';
	await page.close();
	return { thumbs, wallpaper };
}

// ---------- a dial filled with the sample sites ----------
// Returns helpers for one browser window in the given colour scheme ('light' or 'dark').
async function openDial(browser, port, scheme, pictures, errors) {
	const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, colorScheme: scheme });
	const pg = await ctx.newPage();
	pg.on('pageerror', e => errors.push(String(e)));
	pg.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
	await pg.goto(`http://127.0.0.1:${port}/index.html`);
	const BG = "document.getElementById('bg').contentWindow";

	// Bookmarks: a Quick Dial folder with the sites and two folders
	await pg.evaluate(sites => {
		const menu = S.bm.children[0]; S.bm.type = 'folder'; menu.type = 'folder'; S.bm.children[1].type = 'folder';
		menu.children.push({ id: 'qd', type: 'folder', title: 'Quick Dial', children: [
			...sites.map((s, i) => ({ id: 'b' + (i + 1), type: 'bookmark', title: s.title, url: s.url, parentId: 'qd' })),
			{ id: 'f1', type: 'folder', title: 'Work', parentId: 'qd', children: [] },
			{ id: 'f2', type: 'folder', title: 'Travel', parentId: 'qd', children: [] }] });
	}, SITES.map(s => ({ title: s.title, url: s.url })));
	await pg.evaluate("loadFrame('bg', 'bg.html')"); await wait(1500);
	// Pictures go in as original Quick Dial data (inline images), so they take the normal migration path into storage
	await pg.evaluate(thumbs => {
		const data = { version: 4, settings: S.storage.settings, node: JSON.parse(JSON.stringify(S.storage.node)) };
		data.settings.grid.rows = 3; data.settings.grid.columns = 5;
		data.node.children.forEach(n => { if (n.type === 2) n.image = thumbs[n.title]; });
		S.storage = JSON.parse(JSON.stringify(data));
	}, pictures.thumbs);
	await pg.evaluate("loadFrame('bg', 'bg.html')"); await wait(3000);

	const s = {
		ctx, pg,
		/** Changes the settings in the background page: fn(settings, QDThemes) edits them in place. */
		settings: async (fn, arg) => pg.evaluate(`(() => { const bg = ${BG}; const s = JSON.parse(JSON.stringify(bg.app.settings));
			(${fn})(s, bg.QDThemes, ${JSON.stringify(arg === undefined ? null : arg)}); return new Promise(r => bg.app.Settings.update(s, r)); })()`),
		/** Saves the user's own themes list. */
		themes: async list => pg.evaluate(`${BG}.app.Themes.save(${JSON.stringify(list)})`),
		/** The style part of the current settings. */
		currentStyle: async () => pg.evaluate(`${BG}.QDThemes.extract(${BG}.app.settings)`),
		/** (Re)loads the dial page and returns its frame. */
		dial: async () => { await pg.evaluate("loadFrame('dial', 'dial.html')"); await wait(1800); return pg.frame({ url: /dial\.html/ }); },
		/** Opens Settings (optionally on a tab) over the dial and returns the settings frame. */
		openSettings: async (dial, tab) => { await dial.evaluate(() => dial.editSettings()); await wait(1300); const f = pg.frame({ url: /settings\.html/ }); if (tab) await f.click(`#Tab${tab}Button`); return f; },
		/** Moves the mouse over the tile with this title (hover state), or away when no title is given. */
		hover: async (dial, title) => {
			if (!title) return pg.mouse.move(2, 2);
			const box = await dial.locator('table.Grid a', { hasText: title }).boundingBox();
			await pg.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await wait(500);
		},
		/** Saves the window as <name>.png in the output folder. */
		shot: async name => { await wait(500); await pg.screenshot({ path: path.join(OUT, name + '.png') }); console.log('saved', name + '.png'); }
	};
	return s;
}

// Scrolls the Settings content so `selector` sits just below the top edge (below a sticky table header if there is one)
const scrollTo = (frame, selector, offset = 16) => frame.evaluate(([sel, off]) => {
	const content = document.getElementById('Content'), el = document.querySelector(sel);
	content.scrollTop += el.getBoundingClientRect().top - content.getBoundingClientRect().top - off;
}, [selector, offset]);

// ---------- the screenshots ----------
async function main() {
	fs.mkdirSync(OUT, { recursive: true });
	await new Promise(r => server.listen(0, '127.0.0.1', r));
	const port = server.address().port;
	const browser = await chromium.launch();
	const errors = [];
	const pictures = await renderPictures(browser);

	// Light mode: the dial in three looks, then Settings and Properties
	let s = await openDial(browser, port, 'light', pictures, errors);
	let dial = await s.dial();
	await s.hover(dial, 'Weather'); await s.shot('dial-classic');                       // Classic, a tile hovered

	await s.settings((st, T) => T.apply(st, T.BUILTIN.find(t => t.id === 'anori').style));
	dial = await s.dial();
	await s.hover(dial, 'Streamly'); await s.shot('dial-anori');                        // Anori, a tile lifted
	await s.hover();

	await s.settings((st, T, wallpaper) => {                                             // a user's own theme over a picture
		T.apply(st, T.BUILTIN.find(t => t.id === 'anori').style);
		st.backgroundImage = wallpaper; st.backgroundMode = 1; st.accentColor = '#7e57c2';
		Object.assign(st.grid.cells, { borderColor: '#ffffff', borderColorHover: '#ffffff', backgroundOpacity: .12, hoverEffect: 3,
			titleBackgroundColor: '#1b1638', titleBackgroundColorHover: '#7e57c2', titleBackgroundOpacity: .55 });
	}, pictures.wallpaper);
	dial = await s.dial();
	await s.hover(dial, 'Photos'); await s.shot('dial-picture');                        // tile grows on hover
	await s.hover();
	await s.themes([{ name: 'Dusk', description: 'Violet glass tiles that grow on hover, made for a sunset background picture.', style: await s.currentStyle() }]);

	await s.settings((st, T) => { T.apply(st, T.BUILTIN.find(t => t.id === 'anori').style); st.backgroundImage = null; });
	dial = await s.dial();
	const settings = await s.openSettings(dial, 'Themes');
	await scrollTo(settings, '#TabThemes .qd-card'); await s.shot('settings-themes');   // gallery: Classic, Anori (in use), Dusk
	await settings.click('#TabTilesButton'); await s.shot('settings-tiles');            // live preview of the tile style
	await scrollTo(settings, 'tr:has(#GridCellsBackgroundColor)', 44); await s.shot('settings-tiles-glass'); // glass, shadow, hover effect
	await settings.click('#TabPageButton'); await s.shot('settings-page');
	await settings.click('#TabGridButton'); await s.shot('settings-grid');
	await settings.click('#BtnCancel'); await wait(600);
	await dial.evaluate(() => dial.editProperties([...document.querySelectorAll('.Grid a')].find(a => a.Node && a.Node.title === 'Weather')));
	await wait(1300); await s.shot('properties');
	await s.ctx.close();

	// Dark mode: the theme gallery after choosing Use on Anori
	s = await openDial(browser, port, 'dark', pictures, errors);
	dial = await s.dial();
	const dark = await s.openSettings(dial, 'Themes');
	await dark.locator('.qd-theme', { hasText: 'Anori' }).locator('button', { hasText: 'Use' }).click(); await wait(300);
	await scrollTo(dark, '#TabThemes .qd-card'); await s.shot('settings-themes-dark');
	await s.ctx.close();

	await browser.close();
	if (errors.length) { console.error('Page errors:\n  ' + errors.join('\n  ')); process.exitCode = 1; }
	else console.log('Done:', OUT);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => {
	server.close();
	fs.rmSync(H, { recursive: true, force: true });
});
