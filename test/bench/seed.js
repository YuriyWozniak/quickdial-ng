// Quick Dial NG benchmark: background side. Seeds a realistic profile on the first run, then loads the extension's
// own background scripts and times their startup, and the stages run.js asked for: bookmark sync, saving, the original
// inline storage format, new tabs. Each result line is logged to the console and saved as a file in qdbench/ under
// Firefox's download folder, which run.js reads. BENCH_SHARED comes from bench/shared.js and the other BENCH_* from
// bench/config.js, which build.js writes. It waits for events (the startup sync, the browser being idle, each new tab's
// report), not for fixed times.
/* global app -- the extension's background page, once its scripts are loaded */
(function () {
	'use strict';
	const SHARED = BENCH_SHARED;
	const { STAGE, STAGES, FORMATS } = SHARED;
	const DEFAULT_WATCHDOG_MS = 140000; // run.js passes its own, 10 s before it gives up
	const OPTIONS = Object.assign({ stages: STAGES, tabs: SHARED.DEFAULT_TABS, tabPause: SHARED.DEFAULT_TAB_PAUSE_MS, label: null, watchdogMs: DEFAULT_WATCHDOG_MS }, BENCH_OPTIONS);
	const IS_ORIGINAL = BENCH_FORMAT === FORMATS.orig;

	// The seeded profile: a Quick Dial folder with 13 bookmarks on an 8 x 12 grid, shaped like a real imported one
	const GRID_COLUMNS = 12, GRID_ROWS = 8;
	const TILE_CELLS = [0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 35, 48, 60]; // cells that hold a bookmark; the others stay empty
	const BOOKMARKS_MENU_ID = 'menu________', FOLDER_TITLE = 'Quick Dial';
	const siteTitle = index => 'Site ' + index, siteUrl = index => 'https://site' + index + '.example/';
	const NODE_TYPE = { empty: 0, folder: 1, bookmark: 2 }; // as the extension stores them
	const STORED_IMAGE = '1'; // node.image when the picture is stored under its own key (Quick Dial NG)
	const IMAGE_KEY_PREFIX = 'img_'; // that key: app.Images.storageKey
	const DATA_VERSION = { [FORMATS.orig]: 4, [FORMATS.ng]: 5 }; // the stored data's format version
	const SEEDED_KEY = 'bench_seeded', INLINE_KEY = 'bench_inline'; // the benchmark's own storage keys
	// The layout the numbers were first taken with, over the extension's defaults
	const BENCH_LAYOUT = {
		grid: { rows: GRID_ROWS, columns: GRID_COLUMNS, margin: 4 },
		cells: {
			margin: 6, marginHover: 4, borderRadius: 0, borderRadiusHover: 0, backgroundColor: '#000000', backgroundColorHover: '#000000',
			titleHeight: '12', titleHeightHover: '12', titleFontSize: '8', titleFontSizeHover: '8', titleBorderSize: '2', titleBorderSizeHover: '2'
		},
		page: { menuShowAdd: false }
	};
	// The tile pictures: page-like detail, so the WebP sizes vary like real screenshots (10-60 KB)
	const IMAGE = {
		width: 600, height: 450, type: 'image/webp', quality: 0.85, background: '#fff',
		blockCount: { min: 20, spread: 200, step: 37 }, // per picture: min + (picture * step) % spread
		blockSize: { minWidth: 20, widthSpread: 90, minHeight: 10, heightSpread: 40 },
		blockColor: { hueStep: 47, hueSeed: 91, saturation: '60%', minLightness: 30, lightnessSpread: 50 },
		blockPosition: { xStep: 53, xSeed: 7, yStep: 29, ySeed: 13 }, // spreads the blocks differently on each picture
		text: { color: '#222', font: '13px sans-serif', x: 12, y: 18, lineHeight: 15, lineStep: 5, maxLines: 28 }
	};
	const HUE_DEGREES = 360, BYTES_PER_KB = 1024;
	const textLine = (picture, line) => 'Lorem ipsum dolor sit amet ' + picture + ' consectetur ' + line + ' adipiscing elit sed do';
	const SEED_TRIES = 120, SEED_RETRY_MS = 250; // Places may still be starting up in a brand new profile

	// Rounds per measurement; the medians are reported
	const SYNC_ROUNDS = 20, SAVE_ROUNDS = 10, SERIALIZE_ROUNDS = 50, INLINE_ROUNDS = 10;
	const STARTUP_SYNC_MAX_MS = 5000; // the background page's first bookmark sync starts on its own, about 500 ms after ready
	const IDLE_MAX_MS = 1000; // longest wait for the browser to be idle between steps
	const IDLE_FREE_MS = 40; // an idle period counts when this much of its 50 ms budget is free
	const PROGRESS_MS = 5000; // a progress line in the console
	const POLL_MS = 5;
	const IO_DIGITS = 2; // decimals of the storage call times
	const STARTUP_STAGE = 'startup'; // in progress lines and timedOutAt, before the first stage
	const RESULT_FILE_TYPE = 'text/plain';

	const roundTime = ms => +ms.toFixed(SHARED.TIME_DIGITS);
	const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
	const waitUntil = test => new Promise(resolve => {
		(function poll() { if (test()) resolve(); else setTimeout(poll, POLL_MS); })();
	});
	// Idle: an idle period with most of its budget free, so a lone gap between tasks doesn't count (at most IDLE_MAX_MS)
	const waitForIdle = () => new Promise(resolve => {
		const end = performance.now() + IDLE_MAX_MS;
		(function wait() {
			requestIdleCallback(deadline => {
				if (deadline.timeRemaining() >= IDLE_FREE_MS || performance.now() >= end) resolve();
				else wait();
			}, { timeout: Math.max(1, end - performance.now()) });
		})();
	});
	function computeMedian(list) { // the mean of the middle two for an even count, as lib.js does
		const values = list.filter(x => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
		if (!values.length) return null;
		const middle = values.length >> 1;
		return roundTime(values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2);
	}
	async function timeRounds(rounds, measured, prepare) { // median ms of measured(i); prepare(i) runs untimed before it
		const times = [];
		for (let i = 0; i < rounds; i++) {
			if (prepare) await prepare(i);
			const start = performance.now();
			await measured(i);
			times.push(performance.now() - start);
		}
		return computeMedian(times);
	}

	let resultFileCount = 0;
	function log(result) { // each result line becomes a file in qdbench/ under the download folder (run.js reads and removes them)
		const line = SHARED.RESULT_PREFIX + JSON.stringify(result);
		console.log(line);
		const url = URL.createObjectURL(new Blob([line + '\n'], { type: RESULT_FILE_TYPE }));
		const filename = SHARED.RESULTS_DIR + '/' + SHARED.RESULT_FILE_PREFIX + Date.now() + '-' + (resultFileCount++) + SHARED.RESULT_FILE_EXTENSION;
		browser.downloads.download({ url, filename, saveAs: false, conflictAction: 'uniquify' }).catch(e => console.error(e));
	}

	// Storage calls, timed (the startup reads are reported)
	const storageCalls = { get: [], set: [] };
	const storage = browser.storage.local;
	const rawGet = storage.get.bind(storage), rawSet = storage.set.bind(storage);
	storage.get = function (keys) {
		const start = performance.now();
		return rawGet(keys).then(found => {
			storageCalls.get.push({ ms: +(performance.now() - start).toFixed(IO_DIGITS), chars: JSON.stringify(found).length });
			return found;
		});
	};
	storage.set = function (items) {
		const start = performance.now(), chars = JSON.stringify(items).length;
		return rawSet(items).then(result => {
			storageCalls.set.push({ ms: +(performance.now() - start).toFixed(IO_DIGITS), chars, keys: Object.keys(items).length });
			return result;
		});
	};

	// ---------- the seeded profile ----------
	function makeImage(picture) {
		const canvas = document.createElement('canvas');
		canvas.width = IMAGE.width;
		canvas.height = IMAGE.height;
		const context = canvas.getContext('2d');
		context.fillStyle = IMAGE.background;
		context.fillRect(0, 0, IMAGE.width, IMAGE.height);
		const { blockCount, blockSize, blockColor, blockPosition, text } = IMAGE;
		const blocks = blockCount.min + (picture * blockCount.step) % blockCount.spread;
		for (let i = 0; i < blocks; i++) {
			const hue = (i * blockColor.hueStep + picture * blockColor.hueSeed) % HUE_DEGREES;
			context.fillStyle = 'hsl(' + hue + ',' + blockColor.saturation + ',' + (blockColor.minLightness + i % blockColor.lightnessSpread) + '%)';
			context.fillRect((i * blockPosition.xStep + picture * blockPosition.xSeed) % IMAGE.width, (i * blockPosition.yStep + picture * blockPosition.ySeed) % IMAGE.height,
				blockSize.minWidth + i % blockSize.widthSpread, blockSize.minHeight + i % blockSize.heightSpread);
		}
		context.fillStyle = text.color;
		context.font = text.font;
		const lines = (picture * text.lineStep) % text.maxLines;
		for (let line = 0; line < lines; line++) context.fillText(textLine(picture, line), text.x, text.y + line * text.lineHeight);
		return canvas.toDataURL(IMAGE.type, IMAGE.quality);
	}
	function makeBenchSettings() { // the extension's defaults with the benchmark's layout
		const settings = JSON.parse(JSON.stringify(BENCH_DEFAULTS));
		Object.assign(settings.grid, BENCH_LAYOUT.grid);
		Object.assign(settings.grid.cells, BENCH_LAYOUT.cells);
		Object.assign(settings, BENCH_LAYOUT.page);
		return settings;
	}
	async function seedProfile() {
		const menu = (await browser.bookmarks.getSubTree(BOOKMARKS_MENU_ID))[0];
		const leftover = (menu.children || []).find(child => child.title === FOLDER_TITLE && !child.url);
		if (leftover) await browser.bookmarks.removeTree(leftover.id); // of a failed attempt
		const folder = await browser.bookmarks.create({ parentId: BOOKMARKS_MENU_ID, title: FOLDER_TITLE });
		const children = [], images = {};
		let imageChars = 0;
		for (let i = 0; i < TILE_CELLS.length; i++) {
			const bookmark = await browser.bookmarks.create({ parentId: folder.id, title: siteTitle(i), url: siteUrl(i) });
			while (children.length < TILE_CELLS[i]) children.push({ type: NODE_TYPE.empty });
			const image = makeImage(i + 1);
			imageChars += image.length;
			images[bookmark.id] = image;
			children.push({
				id: bookmark.id, title: bookmark.title, type: NODE_TYPE.bookmark, url: bookmark.url,
				image: IS_ORIGINAL ? image : STORED_IMAGE, titleLocked: true, imageLocked: false
			});
		}
		while (children.length < GRID_COLUMNS * GRID_ROWS) children.push({ type: NODE_TYPE.empty }); // the imported profile keeps the full grid of empty cells
		const node = { id: folder.id, title: FOLDER_TITLE, type: NODE_TYPE.folder, children };
		const data = { [SEEDED_KEY]: true, version: DATA_VERSION[BENCH_FORMAT], settings: makeBenchSettings(), node };
		if (!IS_ORIGINAL) for (const id in images) data[IMAGE_KEY_PREFIX + id] = images[id];
		await rawSet(data);
		return { seeded: BENCH_FORMAT, tiles: TILE_CELLS.length, cells: children.length, imageKb: Math.round(imageChars / BYTES_PER_KB) };
	}

	// ---------- the extension's background page ----------
	let startupSync = null; // the first GridNodes.sync, which the background page starts by itself
	function loadBackgroundScripts() { // in manifest order, as Firefox would
		(function load(index) {
			if (index >= BENCH_SCRIPTS.length) return;
			const script = document.createElement('script');
			script.src = '/' + BENCH_SCRIPTS[index];
			script.onload = script.onerror = () => {
				watchStartupSync();
				load(index + 1);
			};
			document.head.appendChild(script);
		})(0);
	}
	function watchStartupSync() {
		const gridNodes = window.app && app.GridNodes;
		if (!gridNodes || typeof gridNodes.sync !== 'function' || gridNodes.sync.__isBenchWrapped) return;
		const sync = gridNodes.sync;
		gridNodes.sync = function () {
			const result = sync.apply(this, arguments);
			if (!startupSync) startupSync = Promise.resolve(result);
			return result;
		};
		gridNodes.sync.__isBenchWrapped = true;
	}
	const isReady = () => !!(window.app && app.settings && app.node);
	const isSyncing = () => !!(app.GridNodes && app.GridNodes._syncing);

	// ---------- new tabs ----------
	let resolveDialReport = null; // resolves with the marks probe.js sends from the new tab
	browser.runtime.onMessage.addListener(message => {
		if (!message || !message[SHARED.DIAL_MESSAGE] || !resolveDialReport) return;
		const resolve = resolveDialReport;
		resolveDialReport = null;
		resolve(message[SHARED.DIAL_MESSAGE]);
	});
	async function openNewTab(number) {
		const reported = new Promise(resolve => { resolveDialReport = resolve; });
		const openedAt = performance.timeOrigin + performance.now();
		const params = new URLSearchParams({ [SHARED.RUN_PARAM]: number, [SHARED.TILES_PARAM]: TILE_CELLS.length });
		const tab = await browser.tabs.create({ url: '/dial.html?' + params, active: true });
		const marks = await reported;
		marks.openToOrigin = roundTime(marks.timeOrigin - openedAt); // Firefox creating the tab, before the page starts loading
		delete marks.timeOrigin;
		await browser.tabs.remove(tab.id);
		if (OPTIONS.tabPause) await delay(OPTIONS.tabPause);
		await waitForIdle(); // the closed tab is torn down before the next one opens
		return marks;
	}

	// ---------- the stages ----------
	const results = { format: BENCH_FORMAT, stages: OPTIONS.stages, ua: navigator.userAgent };
	if (OPTIONS.label) results.label = OPTIONS.label;
	const newTabs = [];
	const STAGE_RUNNERS = {
		async [STAGE.sync]() { // bookmark sync from a settled tree
			results.syncMs = await timeRounds(SYNC_ROUNDS, () => app.GridNodes.sync(app.node, app.settings.grid.root), () => waitUntil(() => !isSyncing()));
		},
		async [STAGE.save]() { // save after a change (a title rename): time to write storage
			storageCalls.set = [];
			results.saveMs = await timeRounds(SAVE_ROUNDS, () => app.Settings.save(), round => { app.node.children[0].title = siteTitle(0) + ' r' + round; });
			results.saveWrites = storageCalls.set[storageCalls.set.length - 1];
			if (app.Settings._serialize) results.serializeMs = await timeRounds(SERIALIZE_ROUNDS, () => { app.Settings._serialize(); });
		},
		async [STAGE.inline]() { // the same tree with the pictures inline, as the original Quick Dial stores it: its startup read and every save
			const inline = JSON.parse(app.Settings._serialize ? app.Settings._serialize() : JSON.stringify({ node: app.node }));
			const ids = [];
			(function collect(node) {
				if (node.image === STORED_IMAGE) ids.push(node.id);
				(node.children || []).forEach(collect);
			})(app.node);
			const pictures = app.Images ? await app.Images.get(ids) : {};
			(function putInline(node) {
				if (node.image === STORED_IMAGE && pictures[node.id]) node.image = pictures[node.id];
				(node.children || []).forEach(putInline);
			})(inline.node);
			const saveMs = await timeRounds(INLINE_ROUNDS, () => rawSet({ [INLINE_KEY]: inline }));
			const readMs = await timeRounds(INLINE_ROUNDS, () => rawGet(INLINE_KEY));
			results.inlineFormat = { chars: JSON.stringify(inline).length, saveMs, readMs };
			await storage.remove(INLINE_KEY);
		},
		async [STAGE.newtab]() { // the first new tab apart, the others as medians
			for (let number = 1; number <= OPTIONS.tabs; number++) newTabs.push(await openNewTab(number));
			results.newTabs = newTabs.length;
			results.dialFirst = newTabs[0];
			const warmTabs = newTabs.slice(1);
			if (!warmTabs.length) return;
			const keys = new Set();
			for (const marks of warmTabs) for (const key in marks) if (typeof marks[key] === 'number') keys.add(key);
			results.dialMedianWarm = {};
			for (const key of keys) results.dialMedianWarm[key] = computeMedian(warmTabs.map(marks => marks[key]));
		}
	};

	let hasFinished = false;
	function finish() {
		if (hasFinished) return;
		hasFinished = true;
		log(results);
		log(SHARED.DONE);
	}
	async function measure() {
		const start = performance.now();
		const progressTimer = setInterval(() => console.log(SHARED.PROGRESS_PREFIX + performance.now().toFixed(0) + ' stage=' + (results.stage || STARTUP_STAGE)
			+ ' ready=' + isReady() + ' newTabs=' + newTabs.length), PROGRESS_MS);
		const watchdog = setTimeout(() => {
			results.timedOutAt = results.stage || STARTUP_STAGE;
			results.newTabs = newTabs.length;
			finish();
		}, OPTIONS.watchdogMs);
		loadBackgroundScripts();
		await waitUntil(isReady);
		results.backgroundReadyMs = roundTime(performance.now() - start);
		// Measure from a settled background page: after its first bookmark sync
		await Promise.race([waitUntil(() => startupSync).then(() => startupSync), delay(STARTUP_SYNC_MAX_MS)]);
		await waitUntil(() => !isSyncing());
		await waitForIdle();
		results.startupIo = JSON.parse(JSON.stringify(storageCalls));
		for (const stage of STAGES) {
			if (!OPTIONS.stages.includes(stage)) continue;
			results.stage = stage;
			await STAGE_RUNNERS[stage]();
			await waitForIdle();
		}
		delete results.stage;
		clearTimeout(watchdog);
		clearInterval(progressTimer);
		finish();
	}

	rawGet(SEEDED_KEY).then(async stored => {
		if (!stored[SEEDED_KEY]) {
			for (let tries = 1; ; tries++) {
				try {
					const seeded = await seedProfile();
					seeded.tries = tries;
					log(seeded);
					break;
				} catch (e) {
					if (tries >= SEED_TRIES) {
						log({ seedError: String(e), tries });
						log(SHARED.DONE);
						return;
					}
					await delay(SEED_RETRY_MS); // Places isn't ready yet: try again
				}
			}
		}
		measure();
	});
})();
