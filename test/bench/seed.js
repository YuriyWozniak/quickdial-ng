// Quick Dial NG benchmark: background side. Seeds a realistic profile on the first run, then loads the extension's
// own background scripts and times their startup, and the stages run.js asked for: bookmark sync, saving, the original
// inline storage format, new tabs. Each result line is logged to the console and saved as a file in qdbench/ under
// Firefox's download folder, which run.js reads. BENCH_* come from bench/config.js, which build.js writes.
// It waits for events (the startup sync, the browser being idle, each new tab's report), not for fixed times.
/* global app -- the extension's background page, once its scripts are loaded */
(function(){
	'use strict';
	const STAGES = ['sync', 'save', 'inline', 'newtab'];
	const OPTIONS = Object.assign({ stages: STAGES, tabs: 12, tabPause: 300, label: null, watchdogMs: 140000 }, BENCH_OPTIONS);

	// The seeded profile: a Quick Dial folder with 13 bookmarks on an 8 x 12 grid, shaped like a real imported one
	const GRID_COLUMNS = 12, GRID_ROWS = 8;
	const TILE_CELLS = [0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 35, 48, 60]; // cells that hold a bookmark; the others stay empty
	const IMAGE_WIDTH = 600, IMAGE_HEIGHT = 450, IMAGE_QUALITY = 0.85; // WebP of 10-60 KB, like real screenshots
	const SEED_TRIES = 120, SEED_RETRY_MS = 250; // Places may still be starting up in a brand new profile

	// Rounds per measurement; the medians are reported
	const SYNC_ROUNDS = 20, SAVE_ROUNDS = 10, SERIALIZE_ROUNDS = 50, INLINE_ROUNDS = 10;
	const STARTUP_SYNC_MAX_MS = 5000; // the background page's first bookmark sync starts on its own, about 500 ms after ready
	const IDLE_MAX_MS = 1000; // longest wait for the browser to be idle between steps
	const IDLE_FREE_MS = 40; // an idle period counts when this much of its 50 ms budget is free
	const PROGRESS_MS = 5000; // a progress line in the console
	const POLL_MS = 5;

	const round = v => +v.toFixed(1);
	const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
	const until = test => new Promise(resolve => { (function poll(){ if(test()) resolve(); else setTimeout(poll, POLL_MS); })(); });
	// Idle: an idle period with most of its budget free, so a lone gap between tasks doesn't count (at most IDLE_MAX_MS)
	const idle = () => new Promise(resolve => {
		const end = performance.now() + IDLE_MAX_MS;
		(function wait(){
			requestIdleCallback(deadline => {
				if(deadline.timeRemaining() >= IDLE_FREE_MS || performance.now() >= end) resolve(); else wait();
			}, { timeout: Math.max(1, end - performance.now()) });
		})();
	});
	function median(list){ // the mean of the middle two for an even count, as lib.js does
		const v = list.filter(x => typeof x == 'number' && isFinite(x)).sort((a, b) => a - b);
		if(!v.length) return null;
		const m = v.length >> 1;
		return round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
	}
	async function timeRounds(rounds, fn, before){ // median ms of fn(i); before(i) runs untimed
		const t = [];
		for(let i = 0; i < rounds; i++){
			if(before) await before(i);
			const start = performance.now();
			await fn(i);
			t.push(performance.now() - start);
		}
		return median(t);
	}

	let logCount = 0;
	function log(o){ // each result line becomes a file in qdbench/ under the download folder (run.js reads and removes them)
		const line = 'QDBENCH ' + JSON.stringify(o);
		console.log(line);
		const url = URL.createObjectURL(new Blob([line + '\n'], { type: 'text/plain' }));
		browser.downloads.download({ url, filename: 'qdbench/qdbench-' + Date.now() + '-' + (logCount++) + '.txt', saveAs: false, conflictAction: 'uniquify' })
			.catch(e => console.error(e));
	}

	// Storage calls, timed (the startup reads are reported)
	const io = { get: [], set: [] };
	const storage = browser.storage.local;
	const rawGet = storage.get.bind(storage), rawSet = storage.set.bind(storage);
	storage.get = function(keys){
		const start = performance.now();
		return rawGet(keys).then(r => { io.get.push({ ms: +(performance.now() - start).toFixed(2), chars: JSON.stringify(r).length }); return r; });
	};
	storage.set = function(items){
		const start = performance.now(), chars = JSON.stringify(items).length;
		return rawSet(items).then(r => { io.set.push({ ms: +(performance.now() - start).toFixed(2), chars, keys: Object.keys(items).length }); return r; });
	};

	// ---------- the seeded profile ----------
	function makeImage(seed){ // page-like detail, so the WebP sizes vary like real screenshots
		const c = document.createElement('canvas');
		c.width = IMAGE_WIDTH; c.height = IMAGE_HEIGHT;
		const x = c.getContext('2d');
		x.fillStyle = '#fff'; x.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
		const blocks = 20 + (seed * 37) % 200;
		for(let i = 0; i < blocks; i++){
			x.fillStyle = 'hsl(' + ((i * 47 + seed * 91) % 360) + ',60%,' + (30 + i % 50) + '%)';
			x.fillRect((i * 53 + seed * 7) % IMAGE_WIDTH, (i * 29 + seed * 13) % IMAGE_HEIGHT, 20 + i % 90, 10 + i % 40);
		}
		x.fillStyle = '#222'; x.font = '13px sans-serif';
		for(let r = 0; r < (seed * 5) % 28; r++) x.fillText('Lorem ipsum dolor sit amet ' + seed + ' consectetur ' + r + ' adipiscing elit sed do', 12, 18 + r * 15);
		return c.toDataURL('image/webp', IMAGE_QUALITY);
	}
	function benchSettings(){ // the extension's defaults, laid out like the profile the numbers were first taken from
		const settings = JSON.parse(JSON.stringify(BENCH_DEFAULTS));
		const g = settings.grid, c = g.cells;
		g.rows = GRID_ROWS; g.columns = GRID_COLUMNS; g.margin = 4;
		c.margin = 6; c.marginHover = 4; c.borderRadius = 0; c.borderRadiusHover = 0;
		c.backgroundColor = '#000000'; c.backgroundColorHover = '#000000';
		c.titleHeight = '12'; c.titleHeightHover = '12'; c.titleFontSize = '8'; c.titleFontSizeHover = '8';
		c.titleBorderSize = '2'; c.titleBorderSizeHover = '2';
		settings.menuShowAdd = false;
		return settings;
	}
	async function seed(){
		const menu = (await browser.bookmarks.getSubTree('menu________'))[0];
		const old = (menu.children || []).find(c => c.title == 'Quick Dial' && !c.url);
		if(old) await browser.bookmarks.removeTree(old.id); // leftover of a failed attempt
		const folder = await browser.bookmarks.create({ parentId: 'menu________', title: 'Quick Dial' });
		const children = [], images = {};
		let imageChars = 0;
		for(let i = 0; i < TILE_CELLS.length; i++){
			const b = await browser.bookmarks.create({ parentId: folder.id, title: 'Site ' + i, url: 'https://site' + i + '.example/' });
			while(children.length < TILE_CELLS[i]) children.push({ type: 0 });
			const img = makeImage(i + 1);
			imageChars += img.length;
			images[b.id] = img;
			children.push({ id: b.id, title: b.title, type: 2, url: b.url, image: BENCH_FORMAT == 'orig' ? img : '1', titleLocked: true, imageLocked: false });
		}
		while(children.length < GRID_COLUMNS * GRID_ROWS) children.push({ type: 0 }); // the imported profile keeps the full grid of empty cells
		const node = { id: folder.id, title: 'Quick Dial', type: 1, children };
		const data = { bench_seeded: true, version: BENCH_FORMAT == 'orig' ? 4 : 5, settings: benchSettings(), node };
		if(BENCH_FORMAT != 'orig') for(const id in images) data['img_' + id] = images[id];
		await rawSet(data);
		return { seeded: BENCH_FORMAT, tiles: TILE_CELLS.length, cells: children.length, imageKB: Math.round(imageChars / 1024) };
	}

	// ---------- the extension's background page ----------
	let startupSync = null; // the first GridNodes.sync, which the background page starts by itself
	function loadBackgroundScripts(){ // in manifest order, as Firefox would
		(function load(i){
			if(i >= BENCH_SCRIPTS.length) return;
			const s = document.createElement('script');
			s.src = '/' + BENCH_SCRIPTS[i];
			s.onload = s.onerror = () => { watchStartupSync(); load(i + 1); };
			document.head.appendChild(s);
		})(0);
	}
	function watchStartupSync(){
		const nodes = window.app && app.GridNodes;
		if(!nodes || typeof nodes.sync != 'function' || nodes.sync.__benchWrapped) return;
		const sync = nodes.sync;
		nodes.sync = function(){ const r = sync.apply(this, arguments); if(!startupSync) startupSync = Promise.resolve(r); return r; };
		nodes.sync.__benchWrapped = true;
	}

	// ---------- new tabs ----------
	let dialReport = null; // resolves with the marks probe.js sends from the new tab
	browser.runtime.onMessage.addListener(m => {
		if(m && m.benchDial && dialReport){ const resolve = dialReport; dialReport = null; resolve(m.benchDial); }
	});
	async function openNewTab(n){
		const reported = new Promise(resolve => { dialReport = resolve; });
		const openedAt = performance.timeOrigin + performance.now();
		const tab = await browser.tabs.create({ url: '/dial.html?bench=' + n + '&tiles=' + TILE_CELLS.length, active: true });
		const marks = await reported;
		marks.openToOrigin = round(marks.timeOrigin - openedAt); // Firefox creating the tab, before the page starts loading
		delete marks.timeOrigin;
		await browser.tabs.remove(tab.id);
		if(OPTIONS.tabPause) await delay(OPTIONS.tabPause);
		await idle(); // the closed tab is torn down before the next one opens
		return marks;
	}

	// ---------- the stages ----------
	const results = { format: BENCH_FORMAT, stages: OPTIONS.stages, ua: navigator.userAgent };
	if(OPTIONS.label) results.label = OPTIONS.label;
	const newTabs = [];
	const STAGE_RUNNERS = {
		async sync(){ // bookmark sync from a settled tree
			results.syncMs = await timeRounds(SYNC_ROUNDS, () => app.GridNodes.sync(app.node, app.settings.grid.root), () => until(() => !app.GridNodes._syncing));
		},
		async save(){ // save after a change (a title rename): time to write storage
			io.set = [];
			results.saveMs = await timeRounds(SAVE_ROUNDS, () => app.Settings.save(), i => { app.node.children[0].title = 'Site 0 r' + i; });
			results.saveWrites = io.set[io.set.length - 1];
			if(app.Settings._serialize) results.serializeMs = await timeRounds(SERIALIZE_ROUNDS, () => { app.Settings._serialize(); });
		},
		async inline(){ // the same tree with the pictures inline, as the original Quick Dial stores it: its startup read and every save
			const inline = JSON.parse(app.Settings._serialize ? app.Settings._serialize() : JSON.stringify({ node: app.node }));
			const ids = [];
			(function walk(n){ if(n.image == '1') ids.push(n.id); (n.children || []).forEach(walk); })(app.node);
			const pics = app.Images ? await app.Images.get(ids) : {};
			(function walk(n){ if(n.image == '1' && pics[n.id]) n.image = pics[n.id]; (n.children || []).forEach(walk); })(inline.node);
			const saveMs = await timeRounds(INLINE_ROUNDS, () => rawSet({ bench_inline: inline }));
			const readMs = await timeRounds(INLINE_ROUNDS, () => rawGet('bench_inline'));
			results.inlineFormat = { chars: JSON.stringify(inline).length, saveMs, readMs };
			await storage.remove('bench_inline');
		},
		async newtab(){ // the first new tab apart, the others as medians
			for(let n = 1; n <= OPTIONS.tabs; n++) newTabs.push(await openNewTab(n));
			results.newTabs = newTabs.length;
			results.dialFirst = newTabs[0];
			const warm = newTabs.slice(1);
			if(!warm.length) return;
			const keys = new Set();
			for(const r of warm) for(const k in r) if(typeof r[k] == 'number') keys.add(k);
			results.dialMedianWarm = {};
			for(const k of keys) results.dialMedianWarm[k] = median(warm.map(r => r[k]));
		}
	};

	let finished = false;
	function finish(){
		if(finished) return;
		finished = true;
		log(results);
		log({ done: true });
	}
	async function measure(){
		const start = performance.now();
		const progress = setInterval(() => console.log('QDBENCH-progress ' + performance.now().toFixed(0) + ' stage=' + (results.stage || 'startup')
			+ ' ready=' + !!(window.app && app.settings && app.node) + ' newTabs=' + newTabs.length), PROGRESS_MS);
		const watchdog = setTimeout(() => { results.timedOutAt = results.stage || 'startup'; results.newTabs = newTabs.length; finish(); }, OPTIONS.watchdogMs);
		loadBackgroundScripts();
		await until(() => window.app && app.settings && app.node);
		results.bgScriptToReadyMs = round(performance.now() - start);
		// Measure from a settled background page: after its first bookmark sync
		await Promise.race([until(() => startupSync).then(() => startupSync), delay(STARTUP_SYNC_MAX_MS)]);
		await until(() => !(app.GridNodes && app.GridNodes._syncing));
		await idle();
		results.startupIO = JSON.parse(JSON.stringify(io));
		for(const stage of STAGES){
			if(!OPTIONS.stages.includes(stage)) continue;
			results.stage = stage;
			await STAGE_RUNNERS[stage]();
			await idle();
		}
		delete results.stage;
		clearTimeout(watchdog);
		clearInterval(progress);
		finish();
	}

	rawGet('bench_seeded').then(async d => {
		if(!d.bench_seeded){
			for(let tries = 1; ; tries++){
				try {
					const seeded = await seed();
					seeded.tries = tries;
					log(seeded);
					break;
				} catch(e){
					if(tries >= SEED_TRIES){ log({ seedError: String(e), tries }); log({ done: true }); return; }
					await delay(SEED_RETRY_MS); // Places isn't ready yet: try again
				}
			}
		}
		measure();
	});
})();
