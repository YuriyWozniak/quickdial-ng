// Quick Dial NG: Firefox startup profiling on a copy of a real profile.
// Drives Firefox through Marionette (no extra packages needed). Never point this at a profile you use: it writes
// user.js and may disable add-ons. See README.md in this folder.
'use strict';
const net = require('net'), fs = require('fs'), path = require('path'), { spawn, spawnSync } = require('child_process');
const { WIN, fail, sleep, parseArgs } = require('./lib');

const NG = 'quickdial-ng@yuriywozniak';
const PORT = 2829; // Marionette
const DEFAULTS = { idle: 8000, newtabs: 1, settle: 500 };
const CONNECT_TIMEOUT_MS = 90000; // Firefox starts and Marionette answers
const SCRIPT_TIMEOUT_MS = 180000; // longest script run through Marionette
const EXIT_TIMEOUT_MS = 60000; // Firefox quits after a launch
const EXIT_POLL_MS = 250, CONNECT_RETRY_MS = 50;
const NEWTAB_MAX_MS = 6000; // longest wait for a new tab's pictures
const PROFILER_ENV = { // --gecko-profile: what the Firefox Profiler records from the start
	MOZ_PROFILER_STARTUP: '1', MOZ_PROFILER_STARTUP_ENTRIES: '33554432', MOZ_PROFILER_STARTUP_INTERVAL: '1',
	MOZ_PROFILER_STARTUP_FEATURES: 'js,stackwalk,markers,cpu,processcpu,ipcmessages',
	MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain,Compositor,Renderer,IndexedDB,DOM Worker,StyleThread,BgIOThreadPool,StreamTrans,Timer'
};

const USAGE = `Usage: node startup.js <firefox.exe> <profileCopyDir> <runs> <label> <results.jsonl> [options]
  runs                    measured launches; one extra warm-up launch runs first
  --newtabs <n>           new tabs to open in each launch, one after another (default ${DEFAULTS.newtabs})
  --idle <ms>             after the session is restored, wait until no extension is still starting and Firefox is idle,
                          at most this long (default ${DEFAULTS.idle})
  --settle <ms>           a new tab counts as drawn when its pictures haven't changed for this long (default ${DEFAULTS.settle})
  --homepage <url>        set Firefox's home page for these launches
  --gecko-profile <file>  record the last measured launch with the Firefox Profiler (open the file at profiler.firefox.com)
  --disable-ng            disable Quick Dial NG in the profile before the warm-up launch
  --headful               show the Firefox window
  --discover              dump everything Firefox exposes about startup and extensions (for development)`;

const args = parseArgs(process.argv.slice(2), {
	newtabs: 'int', idle: 'int', settle: 'int', homepage: 'string', 'gecko-profile': 'string', 'disable-ng': 'bool', headful: 'bool', discover: 'bool'
}, USAGE);
const [ffPath, profile, runsArg, label, outFile] = args.positional;
if (!outFile) fail('missing arguments\n\n' + USAGE);
const opt = Object.assign({}, DEFAULTS, args);
const GECKO_PROFILE = opt.geckoProfile ? path.resolve(opt.geckoProfile) : null;

const log = (...a) => { const s = new Date().toISOString().slice(11, 19) + ' ' + a.join(' '); console.log(s); fs.appendFileSync(outFile + '.log', s + '\n'); };
const out = obj => fs.appendFileSync(outFile, JSON.stringify(obj) + '\n');

function writeUserJs() {
	fs.writeFileSync(path.join(profile, 'user.js'), [
		`user_pref("marionette.port", ${PORT});`,
		'user_pref("browser.shell.checkDefaultBrowser", false);',
		'user_pref("app.update.auto", false);',
		'user_pref("app.update.checkInstallTime", false);',
		'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
		'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
		opt.homepage ? `user_pref("browser.startup.homepage", ${JSON.stringify(opt.homepage)});` : '',
		''].join('\n'));
}

// ---- minimal Marionette client ----
class Marionette {
	constructor(sock) {
		this.sock = sock; this.buf = Buffer.alloc(0); this.id = 0; this.pending = new Map(); this.closed = false;
		this.greeting = new Promise(r => { this._greet = r; });
		sock.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this._parse(); });
		sock.on('close', () => { this.closed = true; for (const p of this.pending.values()) p.rej(new Error('connection closed')); this.pending.clear(); });
		sock.on('error', () => {});
	}
	_parse() {
		for (;;) {
			const i = this.buf.indexOf(0x3a); if (i < 0) return;
			const n = parseInt(this.buf.slice(0, i).toString(), 10);
			if (this.buf.length < i + 1 + n) return;
			const msg = JSON.parse(this.buf.slice(i + 1, i + 1 + n).toString('utf8'));
			this.buf = this.buf.slice(i + 1 + n);
			if (!Array.isArray(msg)) { this._greet(msg); continue; }
			const [, id, err, res] = msg, p = this.pending.get(id);
			if (p) { this.pending.delete(id); err ? p.rej(new Error(JSON.stringify(err).slice(0, 2000))) : p.res(res); }
		}
	}
	send(name, params) {
		const id = ++this.id, s = Buffer.from(JSON.stringify([0, id, name, params || {}]), 'utf8');
		this.sock.write(s.length + ':'); this.sock.write(s);
		return new Promise((res, rej) => this.pending.set(id, { res, rej }));
	}
	async exec(script, args, async) {
		const r = await this.send(async ? 'WebDriver:ExecuteAsyncScript' : 'WebDriver:ExecuteScript', { script, args: args || [] });
		return r && 'value' in r ? r.value : r;
	}
}
async function connect(timeoutMs) {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		try {
			const sock = await new Promise((res, rej) => { const s = net.connect(PORT, '127.0.0.1'); s.once('connect', () => res(s)); s.once('error', rej); });
			const m = new Marionette(sock); await m.greeting; return m;
		} catch (e) { await sleep(CONNECT_RETRY_MS); }
	}
	throw new Error('Marionette did not answer');
}
// Waits until no Firefox process uses the profile any more (its lock can be removed, and on Windows no firefox.exe
// names it), so the next launch starts clean. Firefox's launcher exits at once, so the spawned process says little.
async function waitExit(timeoutMs) {
	const lock = path.join(profile, 'parent.lock'), end = Date.now() + timeoutMs;
	const running = () => {
		if (!WIN) return false;
		const r = spawnSync('powershell', ['-NoProfile', '-Command',
			`@(Get-CimInstance Win32_Process -Filter "Name='firefox.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(profile).replace(/'/g, "''")}*' }).Count`], { encoding: 'utf8' });
		return parseInt(r.stdout, 10) > 0;
	};
	while (Date.now() < end) {
		try {
			if (fs.existsSync(lock)) fs.unlinkSync(lock);
			if (!running()) return true;
		} catch (e) { /* still locked */ }
		await sleep(EXIT_POLL_MS);
	}
	return false;
}

// ---- chrome-context scripts ----
const CHROME_STARTUP = `
const [ngId, idleMaxMs, discover, done] = arguments;
(async () => {
	const wait = ms => new Promise(r => setTimeout(r, ms));
	const ok = d => d && d.getTime && d.getTime() > 0;
	for (let i = 0; i < 600 && !ok(Services.startup.getStartupInfo().sessionRestored); i++) await wait(100);
	// Settled: no extension's background page is still starting, and the main thread has gone idle (at most idleMaxMs)
	const idleStart = Date.now();
	const starting = () => WebExtensionPolicy.getActiveExtensions().filter(p => p.extension && p.extension.backgroundState === 'starting').length;
	while (Date.now() - idleStart < idleMaxMs) {
		await new Promise(r => ChromeUtils.idleDispatch(r, { timeout: 1000 }));
		if (!starting()) break;
		await wait(100);
	}
	const settledMs = Date.now() - idleStart;
	const s = Services.startup.getStartupInfo(), p = s.process.getTime(), startup = {};
	for (const k in s) if (ok(s[k])) startup[k] = s[k].getTime() - p;
	const r = { startup, processStartEpoch: p, nowSinceProcess: Date.now() - p, settledMs, extensions: {} };
	for (const pol of WebExtensionPolicy.getActiveExtensions()) r.extensions[pol.id] = { name: pol.name, bg: pol.extension && pol.extension.backgroundState };
	try {
		const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
		const a = await AddonManager.getAddonByID(ngId); r.ng = a ? { version: a.version, isActive: a.isActive } : null;
	} catch (e) { r.ngErr = String(e); }
	// per-extension timings Firefox keeps: [total ms, count], cumulative across launches of this profile
	const ext = {}, g = Glean.extensionsTiming;
	for (const [metric, key] of [['extensionStartupByAddonid', 'startup'], ['backgroundPageLoadByAddonid', 'bgLoad'], ['storageLocalGetIdbByAddonid', 'idbGet']])
		for (const id of Object.keys(r.extensions)) {
			try { const v = g[metric][id].testGetValue(); if (v && v.count) (ext[id] = ext[id] || {})[key] = [+(v.sum / 1e6).toFixed(1), v.count]; } catch (e) {}
		}
	r.extTimings = ext;
	// the start tab: what it loaded before, and when its page painted
	r.tabs = [...gBrowser.tabs].map(t => {
		const b = t.linkedBrowser, sh = b.browsingContext && b.browsingContext.sessionHistory, hist = [];
		if (sh) for (let i = 0; i < sh.count; i++) hist.push(sh.getEntryAtIndex(i).URI.spec);
		return { url: b.currentURI.spec, history: hist };
	});
	if (discover) {
		const d = r.discover = {};
		try { const h = Services.telemetry.getSnapshotForHistograms('main', false); for (const proc in h) for (const k in h[proc]) if (/WEBEXT|EXTENSION|STARTUP|STORAGE/.test(k)) (d.hist = d.hist || {})[proc + ':' + k] = h[proc][k].sum + '/' + Object.values(h[proc][k].values || {}).reduce((x, y) => x + y, 0); } catch (e) { d.histErr = String(e); }
		try { const h = Services.telemetry.getSnapshotForKeyedHistograms('main', false); for (const proc in h) for (const k in h[proc]) if (/WEBEXT|EXTENSION/.test(k)) for (const key in h[proc][k]) (d.khist = d.khist || {})[proc + ':' + k + ':' + key] = h[proc][k][key].sum; } catch (e) { d.khistErr = String(e); }
		try { const sc = Services.telemetry.getSnapshotForScalars('main', false); d.scalars = {}; for (const proc in sc) for (const k in sc[proc]) if (/exten|startup|webext/i.test(k)) d.scalars[proc + ':' + k] = sc[proc][k]; } catch (e) { d.scErr = String(e); }
		try {
			d.glean = {};
			const g = Glean.extensionsTiming; for (const k of ['backgroundPageLoad', 'extensionStartup', 'storageLocalGetIdb', 'storageLocalSetIdb', 'browserActionPopupOpen', 'pageActionPopupOpen', 'contentScriptInjection', 'eventPageRunningTime'])
				try { const v = g[k].testGetValue(); d.glean[k] = v && (v.values ? { sum: v.sum, count: v.count } : v); } catch (e) { d.glean[k] = 'ERR ' + e; }
			try { const v = Glean.extensionsTiming.backgroundPageLoad; d.gleanLabels = Object.keys(v); } catch (e) {}
		} catch (e) { d.gleanErr = String(e); }
		try {
			const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
			const ext = ExtensionParent.GlobalManager.getExtension(ngId);
			d.extKeys = ext ? Object.keys(ext).filter(k => { const v = ext[k]; return v === null || ['number', 'string', 'boolean'].includes(typeof v); }).map(k => k + '=' + String(ext[k]).slice(0, 60)) : 'none';
		} catch (e) { d.extErr = String(e); }
		try { const { AddonManagerPrivate } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs'); d.amTelemetry = AddonManagerPrivate.getTelemetryDetails ? AddonManagerPrivate.getTelemetryDetails() : 'n/a'; } catch (e) { d.amErr = String(e); }
	}
	done(r);
})().catch(e => done({ error: String(e) + ' ' + e.stack }));
`;

const CHROME_OPEN_TAB = `
const done = arguments[arguments.length - 1];
const t = Date.now();
if (window.BrowserCommands && BrowserCommands.openTab) BrowserCommands.openTab(); else BrowserOpenTab();
const b = gBrowser.selectedBrowser;
done({ openEpoch: t, uri: b.currentURI && b.currentURI.spec });
`;

// Content context, in a new tab: when its pictures are set (times are ms since the tab's time origin). The page is
// followed with a MutationObserver: a busy poll here would hold up the page being measured.
const CONTENT_NEWTAB = `
const [settleMs, maxMs, done] = arguments;
const start = performance.now();
const count = () => { let n = 0; for (const a of document.querySelectorAll('a')) { const c = a.firstElementChild || a; if (((c.style && c.style.backgroundImage) || '').indexOf('data:image') >= 0) n++; } return n; };
let last = count(), lastChange = performance.now();
const observer = new MutationObserver(() => { const n = count(); if (n !== last) { last = n; lastChange = performance.now(); } });
observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
(function check() { // done when the pictures haven't changed for settleMs, or after maxMs
	const t = performance.now();
	if ((last > 0 && t - lastChange >= settleMs) || t - start >= maxMs) finish();
	else setTimeout(check, last > 0 ? settleMs - (t - lastChange) : settleMs);
})();
function finish() {
	observer.disconnect();
	requestAnimationFrame(() => requestAnimationFrame(() => {
		const nav = performance.getEntriesByType('navigation')[0] || {};
		const paint = {}; for (const p of performance.getEntriesByType('paint')) paint[p.name] = +p.startTime.toFixed(1);
		done({ url: location.href, timeOrigin: performance.timeOrigin, images: last, links: document.querySelectorAll('a').length,
			domContentLoaded: +(nav.domContentLoadedEventEnd || 0).toFixed(1), load: +(nav.loadEventEnd || 0).toFixed(1),
			imagesSet: last > 0 ? +lastChange.toFixed(1) : null, paint });
	}));
}
`;

const CONTENT_STARTTAB = `
const done = arguments[arguments.length - 1];
const nav = performance.getEntriesByType('navigation')[0] || {};
let fcp = null; for (const p of performance.getEntriesByType('paint')) if (p.name === 'first-contentful-paint') fcp = +p.startTime.toFixed(1);
let images = 0; for (const a of document.querySelectorAll('a')) { const c = a.firstElementChild || a; if (((c.style && c.style.backgroundImage) || '').indexOf('data:image') >= 0) images++; }
done({ url: location.href, timeOrigin: performance.timeOrigin, fcp, domContentLoaded: +(nav.domContentLoadedEventEnd || 0).toFixed(1), images });
`;

const CHROME_DISABLE_NG = `
const [ngId, done] = arguments;
ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager.getAddonByID(ngId)
	.then(a => a.disable()).then(() => done('disabled'), e => done('ERR ' + e));
`;

// Chrome context: closes the selected tab once the browser is idle again
const CHROME_CLOSE_TAB = `
const done = arguments[arguments.length - 1];
gBrowser.removeTab(gBrowser.selectedTab);
ChromeUtils.idleDispatch(() => done(true), { timeout: 1000 });
`;

// Opens a new tab the way Ctrl+T does and times it until its pictures are set; closes it again
async function measureNewTab(m) {
	await m.send('Marionette:SetContext', { value: 'chrome' });
	const o = await m.exec(CHROME_OPEN_TAB, [], true);
	await m.send('Marionette:SetContext', { value: 'content' });
	const handles = await m.send('WebDriver:GetWindowHandles');
	const list = handles.value || handles;
	await m.send('WebDriver:SwitchToWindow', { handle: list[list.length - 1], focus: true });
	const t = await m.exec(CONTENT_NEWTAB, [opt.settle, NEWTAB_MAX_MS], true);
	t.openToTimeOriginMs = +(t.timeOrigin - o.openEpoch).toFixed(1);
	await m.send('Marionette:SetContext', { value: 'chrome' });
	await m.exec(CHROME_CLOSE_TAB, [], true);
	return t;
}

async function launch(n, opts) {
	const ffArgs = ['-profile', profile, '-no-remote', '-marionette'];
	if (!opt.headful) ffArgs.push('-headless');
	const t0 = Date.now();
	const env = Object.assign({}, process.env, { MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' }, opts.profileTo ? PROFILER_ENV : {});
	const ff = spawn(ffPath, ffArgs, { stdio: 'ignore', detached: false, env });
	ff.on('error', e => log('spawn error', e));
	const m = await connect(CONNECT_TIMEOUT_MS);
	const tConnected = Date.now() - t0;
	await m.send('WebDriver:NewSession', { capabilities: { alwaysMatch: { 'moz:webdriverClick': false } } });
	const tSession = Date.now() - t0;
	await m.send('WebDriver:SetTimeouts', { script: SCRIPT_TIMEOUT_MS });
	await m.send('Marionette:SetContext', { value: 'chrome' });
	const res = { run: n, label, spawnToMarionetteMs: tConnected, spawnToSessionMs: tSession };
	try {
		Object.assign(res, await m.exec(CHROME_STARTUP, [NG, opt.idle, !!opt.discover], true));
		res.spawnLagMs = res.processStartEpoch - t0;
		await m.send('Marionette:SetContext', { value: 'content' });
		const h = await m.send('WebDriver:GetWindowHandle');
		await m.send('WebDriver:SwitchToWindow', { handle: h.value || h, focus: true });
		try {
			const st = await m.exec(CONTENT_STARTTAB, [], true);
			st.timeOriginSinceProcess = +(st.timeOrigin - res.processStartEpoch).toFixed(1);
			if (st.fcp != null) st.paintedSinceProcess = +(st.timeOriginSinceProcess + st.fcp).toFixed(1);
			res.startTab = st;
		} catch (e) { res.startTabErr = String(e).slice(0, 300); }
		if (opts.newTabs) {
			const tabs = [];
			try {
				for (let i = 0; i < opts.newTabs; i++) tabs.push(await measureNewTab(m));
			} catch (e) { res.newTabErr = String(e).slice(0, 500); }
			if (tabs.length) res.newTab = tabs[0]; // the first new tab of the launch
			if (tabs.length > 1) res.newTabsLater = tabs.slice(1);
		}
		if (opts.profileTo) {
			await m.send('Marionette:SetContext', { value: 'chrome' });
			res.geckoProfile = await m.exec("const [f, done] = arguments; Services.profiler.dumpProfileToFileAsync(f).then(() => done('saved ' + f), e => done('ERR ' + e));", [opts.profileTo], true);
		}
		if (opts.disableNg) {
			await m.send('Marionette:SetContext', { value: 'chrome' });
			res.disableNg = await m.exec(CHROME_DISABLE_NG, [NG], true);
		}
	} catch (e) { res.error = String(e).slice(0, 1000); }
	try { await m.send('Marionette:Quit', { flags: ['eAttemptQuit'] }); } catch (e) { /* already closing */ }
	res.exited = await waitExit(EXIT_TIMEOUT_MS);
	return res;
}

(async () => {
	writeUserJs();
	const runs = parseInt(runsArg, 10) || 1;
	log(`start label=${label} runs=${runs} newtabs=${opt.newtabs} discover=${!!opt.discover} disableNg=${!!opt.disableNg}`);
	if (opt.disableNg) { const r = await launch(0, { disableNg: true }); log('disable launch:', r.disableNg || r.error); }
	for (let n = 0; n <= runs; n++) {
		const r = await launch(n, { newTabs: opt.newtabs, profileTo: GECKO_PROFILE && n === runs ? GECKO_PROFILE : null });
		r.warmup = n === 0;
		out(r);
		log(`run ${n}${n === 0 ? ' (warm-up)' : ''}: sessionRestored=${r.startup && r.startup.sessionRestored} firstPaint=${r.startup && (r.startup.firstPaint2 || r.startup.firstPaint)} startTab=${JSON.stringify(r.startTab || r.startTabErr)} tabs=${JSON.stringify(r.tabs)} newTab=${r.newTab ? JSON.stringify(r.newTab) : r.newTabErr || r.error}`);
	}
	out({ done: true, label });
	log('done');
})().catch(e => {
	log('FATAL', e.stack); out({ done: true, fatal: String(e) });
	// close the Firefox this harness started (only the one using the profile copy)
	try { require('child_process').execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='firefox.exe'\\" | Where-Object { $_.CommandLine -like '*${path.basename(profile)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`); } catch (x) { /* nothing left to close */ }
	process.exit(1);
});
