#!/usr/bin/env node
// Functional tests for Quick Dial NG storage logic. See README.md in this folder.
// Runs the extension pages in Chromium (Playwright) against a simulated Firefox
// WebExtension API (test/mock.js). Usage: node test/test-storage.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('Playwright not found. Run "npm install" in the test folder.'); process.exit(1); }

// ---------- temporary copy of the extension, with test versions of its pages ----------
const H = fs.mkdtempSync(path.join(os.tmpdir(), 'qdng-test-'));
const ext = (...p) => path.join(H, 'ext', ...p);
fs.cpSync(path.join(__dirname, '..', 'src'), ext(), { recursive: true });
for (const f of ['mock.js', 'index.html']) fs.copyFileSync(path.join(__dirname, f), path.join(H, f));
const bgScripts = JSON.parse(fs.readFileSync(ext('manifest.json'), 'utf8')).background.scripts.map(s => `<script src="${s}"></script>`).join('');
fs.writeFileSync(ext('bg.html'), '<!doctype html><html><head><script>window.browser = parent.makeBrowser(window, "bg");</script>' + bgScripts + '</head><body></body></html>');
const patchPage = (from, to, tag, src) => {
	const html = fs.readFileSync(ext(from), 'utf8');
	if (!html.includes(tag)) throw new Error(`${from}: "${tag}" not found`);
	fs.writeFileSync(ext(to), html.replace(tag, '<script>window.browser = parent.makeBrowser(window, "dial");</script><script type="text/javascript" src="' + src + '">'));
};
patchPage('html/settings.html', 'html/settingstest.html', '<script type="text/javascript" src="/js/settings.js">', '/ext/js/settings.js');
patchPage('dial.html', 'dialtest.html', '<script type="text/javascript" src="js/dial.js">', 'js/dial.js');

// ---------- static file server ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
	'.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
	const file = path.join(H, decodeURIComponent(new URL(req.url, 'http://x').pathname));
	if (!file.startsWith(H) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
	res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
	fs.createReadStream(file).pipe(res);
});

// ---------- helpers ----------
let ok = true;
const show = v => v === undefined ? '' : (typeof v === 'string' ? v : JSON.stringify(v));
function check(name, cond, info) { ok = ok && !!cond; console.log((cond ? 'PASS ' : 'FAIL ') + name, show(info)); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = ms => new Promise(r => setTimeout(r, ms));

// Playwright's own Chromium, or else Edge / Chrome if it isn't downloaded.
async function launch() {
	const errors = [];
	for (const opts of [{}, { channel: 'msedge' }, { channel: 'chrome' }]) {
		try { return await chromium.launch(opts); } catch (e) { errors.push(e.message.split('\n')[0]); }
	}
	throw new Error('No browser could be started. Run "npx playwright install chromium" in the test folder.\n  ' + errors.join('\n  '));
}

async function main() {
	await new Promise(r => server.listen(0, '127.0.0.1', r));
	const port = server.address().port;
	const b = await launch(), pg = await b.newPage();
	const errs = [];
	pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
	pg.on('pageerror', e => errs.push(String(e)));
	await pg.goto(`http://127.0.0.1:${port}/index.html`);
	const J = s => pg.evaluate(s);
	const dial = () => pg.frameLocator('#dial');
	const BG = "document.getElementById('bg').contentWindow";

	// bookmarks: Quick Dial folder with 6 bookmarks + subfolder, and an unrelated folder
	await J(`(() => { const m = S.bm.children[0]; S.bm.type='folder'; m.type='folder'; S.bm.children[1].type='folder';
	  m.children.push({ id:'qd', type:'folder', title:'Quick Dial', children: [
	    ...[1,2,3,4,5,6].map(i => ({ id:'b'+i, type:'bookmark', title:'Site '+i, url:'https://site'+i+'.example/', parentId:'qd' })),
	    { id:'f1', type:'folder', title:'Folder', parentId:'qd', children:[ { id:'b7', type:'bookmark', title:'Site 7', url:'https://site7.example/', parentId:'f1' } ] } ] });
	  m.children.push({ id:'other', type:'folder', title:'Other', children: [] }); })()`);

	// Phase A: fresh install -> defaults
	await J("loadFrame('bg', 'ext/bg.html')"); await wait(1500);
	let st = await J('Object.keys(S.storage)');
	check('A fresh install creates settings+node', ['version', 'settings', 'node'].every(k => st.includes(k)), st);
	const node = await J('S.storage.node'); check('A sync picked up 7 tiles', node.children.length === 7, node.children.length);

	// Phase B: original Quick Dial v4 data with inline PNG screenshots
	await J(`(() => { const mk = (seed) => { const c = document.createElement('canvas'); c.width = 600; c.height = 450; const x = c.getContext('2d');
	    for (let i = 0; i < 400; i++) { x.fillStyle = \`hsl(\${(i*37+seed*91)%360},70%,\${30+i%40}%)\`; x.fillRect((i*53)%600, (i*29+seed)%450, 40+i%60, 20+i%30); }
	    x.fillStyle = '#000'; x.font = '28px sans-serif'; for (let r = 0; r < 12; r++) x.fillText('Sample page text ' + seed + ' line ' + r, 20, 40 + r*34); return c.toDataURL('image/png'); };
	  const v4 = { version: 4, settings: S.storage.settings, node: JSON.parse(JSON.stringify(S.storage.node)) };
	  v4.node.children.forEach((n, i) => { if (n.type === 2) { n.image = i % 2 ? 'url(' + mk(i) + ')' : mk(i); n.imageLocked = true; } });
	  v4.node.children[6].children[0].image = mk(77);
	  S.storage = JSON.parse(JSON.stringify(v4)); window.v4size = JSON.stringify(v4).length; S.writes = []; S.removes = []; })()`);
	await J("loadFrame('bg', 'ext/bg.html')"); await wait(3000);
	let s = await J(`({ version: S.storage.version, nodeLen: JSON.stringify(S.storage.node).length, imgKeys: Object.keys(S.storage).filter(k => k.startsWith('img_')).sort(),
	  webp: Object.keys(S.storage).filter(k => k.startsWith('img_')).every(k => S.storage[k].startsWith('data:image/webp')), total: JSON.stringify(S.storage).length, v4: window.v4size })`);
	check('B migrated to version 5', s.version === 5);
	check('B 7 images moved to own keys', same(s.imgKeys, ['img_b1', 'img_b2', 'img_b3', 'img_b4', 'img_b5', 'img_b6', 'img_b7']), s.imgKeys);
	check('B images are WebP', s.webp);
	check('B node tree no longer holds images', s.nodeLen < 5000, s.nodeLen);
	console.log('   storage size v4 -> v5:', s.v4, '->', s.total, `(${(s.v4 / s.total).toFixed(1)}x smaller)`);

	// Phase C: restart -> nothing written
	await J("S.writes = []; S.removes = []; loadFrame('bg', 'ext/bg.html')"); await wait(1500);
	let w = await J('S.writes'); check('C restart writes nothing', w.length === 0, w);

	// Phase D: bookmark outside the tree is ignored, inside triggers sync
	await J(`S.writes = []; ${BG}.browser.bookmarks.create({ parentId: 'other', title: 'X', url: 'https://x.example/' })`); await wait(800);
	w = await J('S.writes'); check('D unrelated bookmark: no write', w.length === 0, w);
	await J(`${BG}.browser.bookmarks.update('b1', { title: 'Renamed 1' })`); await wait(800);
	w = await J('S.writes.map(x => x.k)'); const t = await J('S.storage.node.children[0].title');
	check('D tracked bookmark rename saved without rewriting images', t === 'Renamed 1' && w.includes('node') && !w.some(k => k.startsWith('img_')), [w, t]);

	// Phase E: dial page shows images for visible tiles
	await J("loadFrame('dial', 'ext/dialtest.html')"); await wait(1500);
	const d = await dial().locator('table.Grid a').evaluateAll(as => as.map(a => (a.className + '|' + (a.firstChild.style.backgroundImage || '').slice(0, 20) + '|' + (a.lastChild.innerText || ''))));
	const shown = d.filter(x => x.includes('data:image/webp'));
	check('E dial shows 6 WebP tiles + folder', shown.length === 6 && d.some(x => x.startsWith('Folder|')), d.filter(x => !x.startsWith('Empty')));

	// Phase F: export -> fresh profile -> import
	const exp = await J(`${BG}.app.Backup.export()`);
	check('F export has 7 images', Object.keys(exp.images).length === 7);
	await J("S.storage = {}; loadFrame('bg', 'ext/bg.html')"); await wait(1500);
	await J(`${BG}.app.Backup.import(${JSON.stringify(exp)})`); await wait(1500);
	let k = await J("Object.keys(S.storage).filter(k => k.startsWith('img_')).length"); check('F import restored 7 images', k === 7, k);

	// Phase G: delete tile removes its image; URL change drops image
	await J(`S.removes = []; ${BG}.app.GridNodes.deleteNode(${BG}.app.node, 'b2')`); await wait(800);
	let r = await J('S.removes'); check('G delete removes img_b2', r.includes('img_b2') && !(await J('Object.keys(S.storage)')).includes('img_b2'), r);
	await J(`${BG}.browser.bookmarks.update('b3', { url: 'https://changed.example/' })`); await wait(800);
	r = await J("({ removed: S.removes, flag: S.storage.node.children.find(n => n.id === 'b3').image })");
	check('G URL change drops old image', r.removed.includes('img_b3') && r.flag == null, r);

	// Phase H: removing a whole folder removes nested images
	await J(`${BG}.browser.bookmarks.removeTree('f1')`); await wait(800);
	check('H folder removal drops nested img_b7', !(await J('Object.keys(S.storage)')).includes('img_b7'));

	// Phase I: import an original Quick Dial export whose bookmark ids don't exist here (other profile / deleted bookmarks)
	const settings = await J('S.storage.settings');
	settings.startpageTimeout = 500; // obsolete start page timer: must be dropped on import
	settings.grid = { ...settings.grid, columns: 7, cells: { ...settings.grid.cells, titleColor: '#ff0000' } };
	delete settings.grid.cells.snapshotDelay;
	const orig = { version: 4, settings, node: { id: 'oldroot', type: 1, title: 'Quick Dial', children: [
		{ id: 'x1', type: 2, title: 'Site 1', url: 'https://site1.example/', image: 'IMG1', imageLocked: true, imageMode: 2 },
		{ type: 0 }, null,
		{ id: 'x9', type: 2, title: 'New 9', url: 'https://new9.example/', image: 'url(IMG2)', __isLoading: true },
		{ id: 'xf', type: 1, title: 'Folder', children: [{ type: 0 }, { id: 'x7', type: 2, title: 'Site 7', url: 'https://site7.example/', image: 'IMG3' }, { id: 'x10', type: 2, title: 'New 10', url: 'https://new10.example/' }] },
		{ id: 'xg', type: 1, title: 'Brand new', children: [{ id: 'x11', type: 2, title: 'New 11', url: 'https://new11.example/' }] }] } };
	const imgs = await J(`[1,2,3].map(i => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d'); x.fillStyle = \`hsl(\${i*100},60%,50%)\`; x.fillRect(0,0,320,240); x.fillStyle = '#fff'; x.fillText('tile ' + i, 20, 40); return c.toDataURL('image/png'); })`);
	const js = JSON.stringify(orig).replace('"IMG1"', () => JSON.stringify(imgs[0])).replace('IMG2', () => imgs[1]).replace('"IMG3"', () => JSON.stringify(imgs[2]));
	r = await J(`${BG}.app.Backup.import(${js})`); await wait(1500);
	check('I import reports stats', r && r.ok && r.tiles === 5 && r.folders === 2 && r.matched === 1 && r.created === 6 && r.images === 3, r);
	st = await J(`(() => { const qd = S.bm.children[0].children.find(c => c.id === 'qd'); const n = S.storage.node; const urls = f => (f.children||[]).map(c => c.url || ('[' + c.title + ']'));
	  return { rootId: n.id, c0: n.children[0], c3: n.children[3], c4: n.children[4], c5: n.children[5], len: n.children.length,
	    qd: urls(qd), f: urls(qd.children.find(c => c.title === 'Folder') || {}), g: urls(qd.children.find(c => c.title === 'Brand new') || {}),
	    imgs: Object.keys(S.storage).filter(k => k.startsWith('img_')).sort(), s: S.storage.settings }; })()`);
	check('I matched tile reuses existing bookmark b1 at cell 0 with its options', st.c0.id === 'b1' && st.c0.imageLocked && st.c0.imageMode === 2 && st.c0.image === '1', st.c0);
	check('I missing bookmark created at cell 3', st.c3.url === 'https://new9.example/' && st.qd.includes('https://new9.example/') && st.c3.image === '1' && !('__isLoading' in st.c3), st.c3);
	check('I folder recreated at cell 4 keeping inner gap', st.c4.type === 1 && st.c4.children[0].type === 0 && st.c4.children[1].url === 'https://site7.example/' && same(st.f, ['https://site7.example/', 'https://new10.example/']), [st.c4, st.f]);
	check('I new folder at cell 5 with its bookmark', st.c5.title === 'Brand new' && same(st.g, ['https://new11.example/']), st.g);
	check('I root linked to the Quick Dial folder', st.rootId === 'qd', st.rootId);
	check('I pictures follow their tiles (3, under new ids)', st.imgs.length === 3 && st.imgs.includes('img_b1') && st.imgs.includes('img_' + st.c3.id) && st.imgs.includes('img_' + st.c4.children[1].id), st.imgs);
	check('I style/grid imported, missing fields defaulted', st.s.grid.columns === 7 && st.s.grid.cells.titleColor === '#ff0000' && st.s.grid.cells.snapshotDelay === 2000 && !('startpageTimeout' in st.s), st.s.grid.columns);

	// Phase J: importing the same export again creates nothing (idempotent)
	r = await J(`${BG}.app.Backup.import(${js})`); await wait(1000);
	check('J re-import matches everything, creates nothing', r.created === 0 && r.matched === 7, r);

	// Phase K: UI entry points
	const m = await J('S.menus'); check('K page menu has Import from Quick Dial', m.includes('menuImportQuickDial'), m);
	await J("loadFrame('dial', 'ext/html/settingstest.html?tab=backup')"); await wait(800);
	const ui = await dial().locator('body').evaluate(() => ({ tab: document.getElementById('TabBackup').hidden, btn: document.getElementById('TabBackupButton').getAttribute('aria-selected'), imp: !!document.getElementById('BtnImport'), copy: !!document.getElementById('BtnCopySnippet') }));
	check('K settings ?tab=backup opens the Backup tab', ui.tab === false && ui.btn === 'true' && ui.imp && ui.copy, ui);

	// Phase L: dial picks up a changed picture from the background cache (refresh / capture)
	await J("loadFrame('dial', 'ext/dialtest.html')"); await wait(1000);
	const before = await dial().locator('table.Grid a').first().evaluate(a => a.firstChild.style.backgroundImage.length);
	await J(`(() => { const bg = ${BG}; const c = document.createElement('canvas'); c.width = 40; c.height = 30;
	    const n = bg.app.node.children[0]; return bg.app.Images.setNodeImage(n, c.toDataURL('image/webp')).then(() => bg.app.Messages.broadcast(bg.app.Messages.Commands.gridNodesLoaded)); })()`); await wait(800);
	const after = await dial().locator('table.Grid a').first().evaluate(a => a.firstChild.style.backgroundImage.length);
	check('L dial shows the updated picture', before > 1000 && after > 0 && after < 1000, [before, after]);

	// Phase M: brand-new profile without a Quick Dial folder (Firefox returns the new folder without children)
	await J("S.storage = {}; S.bm.children[0].children = S.bm.children[0].children.filter(c => c.id !== 'qd'); loadFrame('bg', 'ext/bg.html')"); await wait(1500);
	await J(`${BG}.browser.bookmarks.create({ parentId: S.bm.children[0].children.find(c => c.title === 'Quick Dial').id, title: 'Fresh', url: 'https://fresh.example/' })`); await wait(1000);
	st = await J(`({ syncing: !!${BG}.app.GridNodes._syncing, tiles: (S.storage.node && S.storage.node.children || []).map(c => c.url) })`);
	check('M fresh profile creates the folder and keeps syncing', !st.syncing && same(st.tiles, ['https://fresh.example/']), st);

	// Phase N: start page paints the remembered background colour, and waits for the background page instead of a fixed retry
	let ls = await J(`${BG}.localStorage.getItem('dialBackgroundColor')`); const cur = await J(`${BG}.app.settings.backgroundColor`);
	check('N background colour remembered on load', ls === cur, [ls, cur]);
	await J(`(() => { const a = ${BG}.app; const s = JSON.parse(JSON.stringify(a.settings)); s.backgroundColor = '#123456'; return new Promise(r => a.Settings.update(s, r)); })()`);
	ls = await J(`${BG}.localStorage.getItem('dialBackgroundColor')`);
	check('N changed colour remembered', ls === '#123456', ls);
	await J(`(() => { const w = ${BG}; w.app.ready = new Promise(r => { window.releaseBg = r; }); })()`); // background page still loading
	await J("loadFrame('dial', 'ext/dialtest.html')"); await wait(1200);
	st = await J(`(() => { const w = document.getElementById('dial').contentWindow; return { html: w.document.documentElement.style.backgroundColor, drawn: !!w.app.settings,
	    listeners: (S.listeners['rt.onMessage.dial'] || []).length }; })()`);
	check('N early colour shown while background loads, nothing drawn, no retry', st.html === 'rgb(18, 52, 86)' && !st.drawn && st.listeners === 0, st);
	await J('window.releaseBg()'); await wait(500);
	st = await J(`(() => { const w = document.getElementById('dial').contentWindow; return { html: w.document.documentElement.style.backgroundColor, body: w.getComputedStyle(w.document.body).backgroundColor,
	    tiles: w.document.querySelectorAll('table.Grid a').length, listeners: (S.listeners['rt.onMessage.dial'] || []).length }; })()`);
	check('N dial drawn once background is ready', st.html === '' && st.body === 'rgb(18, 52, 86)' && st.tiles > 0 && st.listeners === 1, st);

	// Phase O: the old start page timer setting (before 0.3.5) is removed from storage on the next start
	await J('S.storage.settings.startpageTimeout = 500; S.writes = [];');
	await J("loadFrame('bg', 'ext/bg.html')"); await wait(1500);
	st = await J(`({ stored: 'startpageTimeout' in S.storage.settings, live: 'startpageTimeout' in ${BG}.app.settings, writes: S.writes.map(w => w.k) })`);
	check('O obsolete startpageTimeout dropped and saved once', !st.stored && !st.live && st.writes.includes('settings'), st);
	await J('S.writes = [];');
	await J("loadFrame('bg', 'ext/bg.html')"); await wait(1500);
	st = await J('S.writes.map(w => w.k)');
	check('O next start writes nothing again', st.length === 0, st);

	// Phase P: themes (0.4.0)
	st = await J(`(() => { const c = S.storage.settings.grid.cells; return { glass: c.backgroundOpacity, effect: c.hoverEffect, font: c.titleFont, accent: S.storage.settings.accentColor }; })()`);
	check('P style keys added in 0.4.0 start at their Classic values', st.glass === 1 && st.effect === 0 && st.font === 'Arial, Verdana, Sans-serif' && st.accent === null, st);
	await J(`${BG}.app.Themes.save([{ name: 'Mine', description: 'test', style: { backgroundColor: '#112233', grid: { cells: { borderRadius: 9 } } } },
	    { name: 'Classic', style: {} }, { name: 'mine', style: {} }, { nameless: true }])`);
	st = await J("S.storage.themes");
	check('P custom themes saved; built-in names, duplicates and broken entries dropped', st.length === 1 && st[0].name === 'Mine' && st[0].style.grid.cells.borderRadius === 9 && st[0].style.grid.cells.margin === 4, st.map(t => t.name));
	await J("loadFrame('bg', 'ext/bg.html')"); await wait(1500);
	st = await J(`${BG}.app.Themes.list.map(t => t.name)`);
	check('P custom themes loaded after restart', same(st, ['Mine']), st);
	const T = `${BG}.QDThemes`;
	st = await J(`(() => { const T = ${T}; const a = T.BUILTIN.find(t => t.id === 'anori'); const back = T.fromFile(JSON.parse(JSON.stringify(T.toFile(a))));
	    const bad = T.normalize({ backgroundGradient: 'linear-gradient(red, blue), url(https://evil.example/x.png)', grid: { cells: { titleFont: 'x;} body{display:none', blur: 999, titleColor: 'red' } } });
	    let err = ''; try { T.fromFile({ format: 'quickdial-ng', settings: {} }); } catch(e) { err = e.message; }
	    return { round: T.equal(back.style, a.style) && back.name === 'Anori' && /anori\\.app/.test(back.description), grad: bad.backgroundGradient, font: bad.grid.cells.titleFont, blur: bad.grid.cells.blur, color: bad.grid.cells.titleColor, err }; })()`);
	check('P theme file round trip keeps Anori', st.round, st);
	check('P unsafe or invalid theme values replaced', st.grad === null && st.font === 'Arial, Verdana, Sans-serif' && st.blur === 40 && st.color === '#ffffff' && /backup/.test(st.err), st);
	const bk = await J(`${BG}.app.Backup.export()`);
	check('P backup carries custom themes', bk.themes && bk.themes.length === 1 && bk.themes[0].name === 'Mine');
	bk.themes.push({ name: 'From backup', style: { accentColor: '#aa0000' } });
	bk.settings.backgroundGradient = 'url(https://evil.example/)';
	await J(`${BG}.app.Backup.import(${JSON.stringify(bk)})`); await wait(1000);
	st = await J(`({ names: ${BG}.app.Themes.list.map(t => t.name), grad: ${BG}.app.settings.backgroundGradient })`);
	check('P backup import adds its themes and cleans style values', same(st.names.sort(), ['From backup', 'Mine']) && st.grad === null, st);
	// Settings › Themes: use Anori, apply, the dial follows; rows, columns and the background picture are kept
	const before0 = await J(`(() => { const s = ${BG}.app.settings; return { rows: s.grid.rows, cols: s.grid.columns, ratio: s.grid.ratioX + ':' + s.grid.ratioY, pic: s.backgroundImage }; })()`);
	await J("loadFrame('dial', 'ext/html/settingstest.html?tab=themes')"); await wait(1000);
	st = await dial().locator('body').evaluate(() => ({ tab: !document.getElementById('TabThemes').hidden, cards: [...document.querySelectorAll('.qd-theme .qd-theme-name')].map(h => h.firstChild.textContent),
	    current: [...document.querySelectorAll('.qd-theme.is-current .qd-theme-name')].map(h => h.firstChild.textContent) }));
	check('P Themes tab lists built-in and custom themes', st.tab && same(st.cards, ['Classic', 'Anori', 'Mine', 'From backup']), st);
	await dial().locator('.qd-theme').nth(1).locator('button', { hasText: 'Use' }).click(); await wait(300);
	st = await dial().locator('body').evaluate(() => ({ accent: document.getElementById('AccentColor').value, pos: document.getElementById('GridCellsTitlePosition').value, glass: document.getElementById('GridCellsBackgroundOpacity').value,
	    current: [...document.querySelectorAll('.qd-theme.is-current .qd-theme-name')].map(h => h.firstChild.textContent), dirty: !document.getElementById('BtnApply').disabled,
	    gradientRow: !document.getElementById('BackgroundGradientRow').hidden, rootAccent: document.documentElement.classList.contains('qd-accented') }));
	check('P "Use" fills the form with Anori, nothing applied yet', st.accent === '#00794a' && st.pos === '1' && st.glass === '6' && same(st.current, ['Anori']) && st.dirty && st.gradientRow && st.rootAccent, st);
	check('P dial not changed before Apply', (await J(`${BG}.app.settings.accentColor`)) === null);
	await dial().locator('#BtnApply').click(); await wait(600);
	st = await J(`(() => { const s = ${BG}.app.settings; return { accent: s.accentColor, grad: !!s.backgroundGradient, rows: s.grid.rows, cols: s.grid.columns, ratio: s.grid.ratioX + ':' + s.grid.ratioY, pic: s.backgroundImage,
	    anori: ${T}.equal(${T}.extract(s), ${T}.BUILTIN[1].style) }; })()`);
	check('P Apply puts Anori on, layout and picture kept', st.accent === '#00794a' && st.grad && st.anori && st.rows === before0.rows && st.cols === before0.cols && st.ratio === before0.ratio && st.pic === before0.pic, st);
	await J("loadFrame('dial', 'ext/dialtest.html')"); await wait(1200);
	st = await dial().locator('body').evaluate(() => { const a = document.querySelector('table.Grid a:not(.Empty)'); const cs = getComputedStyle(a), t = getComputedStyle(a.lastChild);
	    return { bg: getComputedStyle(document.body).backgroundImage.slice(0, 15), radius: cs.borderTopLeftRadius, blur: cs.backdropFilter, shadow: cs.boxShadow !== 'none', titlePos: t.position, panelH: a.firstChild.offsetHeight, linkH: a.clientHeight }; });
	check('P dial draws Anori: gradient, glass, shadow, title over the picture', st.bg.startsWith('radial-gradient') && st.radius === '14px' && st.blur === 'blur(14px)' && st.shadow && st.titlePos === 'absolute' && st.panelH === st.linkH, st);
	st = await J(`(() => { const s = JSON.parse(JSON.stringify(${BG}.app.settings)); ${T}.apply(s, ${T}.BUILTIN[0].style); return new Promise(r => ${BG}.app.Settings.update(s, () => r(${T}.equal(${T}.extract(${BG}.app.settings), ${T}.CLASSIC)))); })()`);
	check('P Classic brings the original look back', st);

	// Phase Q: refreshing a tile draws the downloaded page in a sandboxed frame; the page's own scripts never run.
	// Chromium has no drawWindow (Firefox only), so a stand-in records what it was asked to draw.
	fs.mkdirSync(path.join(H, 'site'), { recursive: true });
	fs.writeFileSync(path.join(H, 'site', 'page.html'), '<!doctype html><html><head><title>Sandboxed page</title>' +
		'<script>top.qdRan = "script";</script></head><body onload="top.qdRan = \'onload\'"><h1>Hello</h1></body></html>');
	st = await J(`new Promise(r => { const w = ${BG}; w.CanvasRenderingContext2D.prototype.drawWindow = function(win){
	    w.qdDrawn = { title: win.document.title, sandbox: win.frameElement.getAttribute('sandbox'), base: win.document.querySelector('base').href }; };
	  w.app.SiteInfos.fromFrame('http://127.0.0.1:${port}/site/page.html?a=1&b="2"', infos => r({ infos: infos && { title: infos.title, pic: !!infos.screenshot },
	    drawn: w.qdDrawn, ran: window.qdRan || w.qdRan || null, frames: w.document.querySelectorAll('iframe').length })); })`);
	check('Q page drawn in a sandbox without scripts, title read, frame removed', st.infos && st.infos.title === 'Sandboxed page' && st.infos.pic && st.drawn.sandbox === 'allow-same-origin' &&
		st.drawn.base.endsWith('/site/page.html?a=1&b=%222%22') && st.ran === null && st.frames === 0, st);
	st = await J(`Promise.all(['javascript:alert(1)', 'place:sort=8', 'file:///C:/x.html'].map(u => new Promise(r => ${BG}.app.SiteInfos.fromFrame(u, i => r(i === undefined)))))`);
	check('Q non-web addresses are not fetched', st.every(Boolean), st);

	// 404s (icons, favicons), blocked external requests and the sandbox blocking page scripts (phase Q)
	// are expected; real script errors are not.
	console.log('console errors:', JSON.stringify(errs.filter(e => !e.includes('no receiver') && !e.startsWith('Failed to load resource') &&
		!e.includes("'allow-scripts' permission is not set")).slice(0, 10)));
	await b.close();
}

main().catch(e => { ok = false; console.error(e); }).finally(() => {
	server.close();
	fs.rmSync(H, { recursive: true, force: true });
	console.log(ok ? 'ALL PASS' : 'SOME FAILED');
	process.exit(ok ? 0 : 1);
});
