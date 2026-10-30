// Quick Dial NG benchmark: background side. Seeds a realistic profile on first run,
// then times startup, storage, save, sync and new-tab rendering, and prints results
// to stdout (run Firefox with devtools.console.stdout.chrome / browser.dom.window.dump.enabled).
/* global BENCH_FORMAT */
(function(){
	var T0 = performance.now();
	var logN = 0;
	var log = function(o){ // Each result line is saved as a file in the download folder (run.ps1 points it at the work folder)
		var s = 'QDBENCH ' + JSON.stringify(o);
		console.log(s);
		var url = URL.createObjectURL(new Blob([s + '\n'], { type: 'text/plain' }));
		browser.downloads.download({ url: url, filename: 'qdbench-' + (Date.now()) + '-' + (logN++) + '.txt', saveAs: false, conflictAction: 'uniquify' }).catch(function(e){ console.error(e); });
	};
	var io = { get: [], set: [] };
	var st = browser.storage.local;
	var rawGet = st.get.bind(st), rawSet = st.set.bind(st);
	st.get = function(k){ var t = performance.now(); return rawGet(k).then(function(r){ io.get.push({ ms: +(performance.now()-t).toFixed(2), chars: JSON.stringify(r).length }); return r; }); };
	st.set = function(o){ var t = performance.now(); var n = JSON.stringify(o).length; return rawSet(o).then(function(r){ io.set.push({ ms: +(performance.now()-t).toFixed(2), chars: n, keys: Object.keys(o).length }); return r; }); };

	var COLS = 12, ROWS = 8, TILE_CELLS = [0,1,2,3,4,5,7,9,10,11,35,48,60];
	function makeImage(seed){ // 600x450 WebP with page-like detail, sizes vary like real screenshots (10-60 KB)
		var c = document.createElement('canvas'); c.width = 600; c.height = 450; var x = c.getContext('2d');
		x.fillStyle = '#fff'; x.fillRect(0, 0, 600, 450);
		var blocks = 20 + (seed * 37) % 200;
		for(var i=0; i<blocks; i++){ x.fillStyle = 'hsl(' + ((i*47+seed*91)%360) + ',60%,' + (30+i%50) + '%)'; x.fillRect((i*53+seed*7)%600, (i*29+seed*13)%450, 20+i%90, 10+i%40); }
		x.fillStyle = '#222'; x.font = '13px sans-serif';
		for(var r=0; r<(seed*5)%28; r++) x.fillText('Lorem ipsum dolor sit amet ' + seed + ' consectetur ' + r + ' adipiscing elit sed do', 12, 18 + r*15);
		return c.toDataURL('image/webp', 0.85);
	}
	async function seed(){
		var menu = (await browser.bookmarks.getSubTree('menu________'))[0];
		var old = (menu.children || []).find(function(c){ return c.title == 'Quick Dial' && !c.url; });
		if(old) await browser.bookmarks.removeTree(old.id); // Leftover of a failed attempt
		var folder = await browser.bookmarks.create({ parentId: 'menu________', title: 'Quick Dial' });
		var children = [];
		var images = {};
		var imageChars = 0;
		for(var i=0; i<TILE_CELLS.length; i++){
			var b = await browser.bookmarks.create({ parentId: folder.id, title: 'Site ' + i, url: 'https://site' + i + '.example/' });
			while(children.length < TILE_CELLS[i]) children.push({ type: 0 });
			var img = makeImage(i + 1); imageChars += img.length;
			images[b.id] = img;
			children.push({ id: b.id, title: b.title, type: 2, url: b.url, image: BENCH_FORMAT == 'orig' ? img : '1', titleLocked: true, imageLocked: false });
		}
		while(children.length < COLS * ROWS) children.push({ type: 0 }); // The imported profile keeps the full grid of empty cells
		var settings = null;
		var defaultsWin = { app: {} }; // Reuse the extension's own defaults
		settings = JSON.parse(JSON.stringify(BENCH_DEFAULTS));
		settings.grid.rows = ROWS; settings.grid.columns = COLS; settings.grid.margin = 4;
		settings.grid.cells.margin = 6; settings.grid.cells.marginHover = 4; settings.grid.cells.borderRadius = 0; settings.grid.cells.borderRadiusHover = 0;
		settings.grid.cells.backgroundColor = '#000000'; settings.grid.cells.backgroundColorHover = '#000000';
		settings.grid.cells.titleHeight = '12'; settings.grid.cells.titleHeightHover = '12'; settings.grid.cells.titleFontSize = '8'; settings.grid.cells.titleFontSizeHover = '8';
		settings.grid.cells.titleBorderSize = '2'; settings.grid.cells.titleBorderSizeHover = '2';
		settings.menuShowAdd = false; settings.startpageTimeout = 500;
		var node = { id: folder.id, title: 'Quick Dial', type: 1, children: children };
		var data = { bench_seeded: true };
		if(BENCH_FORMAT == 'orig'){ data.version = 4; data.settings = settings; data.node = node; }
		else { data.version = 5; data.settings = settings; data.node = node; for(var id in images) data['img_' + id] = images[id]; }
		await rawSet(data);
		log({ seeded: BENCH_FORMAT, tiles: TILE_CELLS.length, cells: children.length, imageKB: Math.round(imageChars/1024) });
		browser.runtime.reload();
	}
	function waitFor(test, cb){ (function poll(){ if(test()) cb(); else setTimeout(poll, 1); })(); }
	function median(a){ var s = a.slice().sort(function(x,y){ return x-y; }); return +s[Math.floor(s.length/2)].toFixed(1); }
	var results = { format: BENCH_FORMAT, ua: navigator.userAgent };
	var dialRuns = [];
	browser.runtime.onMessage.addListener(function(m){ if(m && m.benchDial) dialRuns.push(m.benchDial); });
	async function openDial(n){
		var before = dialRuns.length;
		var tab = await browser.tabs.create({ url: '/dial.html?bench=' + n, active: true });
		await new Promise(function(res){ waitFor(function(){ return dialRuns.length > before; }, res); });
		await browser.tabs.remove(tab.id);
		await new Promise(function(r){ setTimeout(r, 300); });
	}
	rawGet('bench_seeded').then(function(d){
		if(!d.bench_seeded){ // Places may still be starting up in a brand new profile: retry
			var tries = 0;
			(function attempt(){ seed().catch(function(e){ log({ seedError: String(e), attempt: tries }); if(++tries < 30) setTimeout(attempt, 1000); }); })();
			return;
		}
		var s = document.createElement('script'); s.src = '/js/background.js';
		document.head.appendChild(s);
		waitFor(function(){ return window.app && app.settings && app.node; }, function(){
			results.bgReadyMs = +(performance.now()).toFixed(1); // since background page navigation start
			results.bgScriptToReadyMs = +(performance.now() - T0).toFixed(1);
			setTimeout(async function(){ // after the startup sync (500 ms)
				results.startupIO = JSON.parse(JSON.stringify(io));
				// Bookmark sync
				var t = [];
				for(var i=0; i<20; i++){ var a = performance.now(); await new Promise(function(r){ app.GridNodes.sync(app.node, app.settings.grid.root, r); }); t.push(performance.now()-a); }
				results.syncMs = median(t);
				// Save after a change (title rename): time to write storage
				io.set = []; t = [];
				for(var i=0; i<10; i++){
					var first = app.node.children[0]; first.title = 'Site 0 r' + i;
					var a = performance.now();
					await new Promise(function(r){ app.Settings.save(r); });
					t.push(performance.now()-a);
				}
				results.saveMs = median(t);
				results.saveWrites = io.set.slice(-1)[0];
				if(app.Settings._serialize){ t = []; for(var i=0; i<50; i++){ var a = performance.now(); app.Settings._serialize(); t.push(performance.now()-a); } results.serializeMs = median(t); }
				// New tab page
				for(var n=1; n<=12; n++) await openDial(n);
				results.dial = dialRuns;
				var keys = Object.keys(dialRuns[0]).filter(function(k){ return typeof dialRuns[0][k] == 'number'; });
				results.dialFirst = dialRuns[0];
				results.dialMedianWarm = {}; for(var k of keys) results.dialMedianWarm[k] = median(dialRuns.slice(1).map(function(r){ return r[k]; }));
				delete results.dial;
				log(results);
				log({ done: true });
			}, 2000);
		});
	});
})();
