// Quick Dial NG: Firefox startup profiling on a copy of a real profile.
// Drives Firefox through Marionette (no extra packages needed).
//
// Usage: node startup.js <firefox.exe> <profileDir> <runs> <label> <outFile> [--discover] [--disable-ng] [--headful]
//   runs        number of measured launches; one extra warm-up launch runs first
//   --discover  dump everything the browser exposes about startup and extensions (for development)
//   --disable-ng  disable Quick Dial NG in the profile before the warm-up launch
//   --gecko-profile <file>  record the last measured launch with the Firefox Profiler and save it (open at profiler.firefox.com)
// Never point this at a profile you use: it writes user.js and may disable add-ons.
'use strict';
const net = require('net'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');

const [ffPath, profile, runsArg, label, outFile, ...flags] = process.argv.slice(2);
const gpIdx = flags.indexOf('--gecko-profile'), GECKO_PROFILE = gpIdx >= 0 ? path.resolve(flags[gpIdx + 1]) : null;
const DISCOVER = flags.includes('--discover'), DISABLE_NG = flags.includes('--disable-ng'), HEADFUL = flags.includes('--headful');
const PORT = 2829, NG = 'quickdial-ng@yuriywozniak', IDLE_MS = 8000;

const log = (...a) => { const s = new Date().toISOString().slice(11, 19) + ' ' + a.join(' '); console.log(s); fs.appendFileSync(outFile + '.log', s + '\n'); };
const out = obj => fs.appendFileSync(outFile, JSON.stringify(obj) + '\n');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function writeUserJs() {
	fs.writeFileSync(path.join(profile, 'user.js'), [
		`user_pref("marionette.port", ${PORT});`,
		'user_pref("browser.shell.checkDefaultBrowser", false);',
		'user_pref("app.update.auto", false);',
		'user_pref("app.update.checkInstallTime", false);',
		'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
		'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
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
		} catch (e) { await sleep(50); }
	}
	throw new Error('Marionette did not answer');
}
async function waitExit(timeoutMs) {
	const lock = path.join(profile, 'parent.lock'), end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		try { if (fs.existsSync(lock)) fs.unlinkSync(lock); return true; } catch (e) { await sleep(250); }
	}
	return false;
}

// ---- chrome-context scripts ----
const CHROME_STARTUP = `
const [ngId, idleMs, discover, done] = arguments;
(async () => {
	const wait = ms => new Promise(r => setTimeout(r, ms));
	const ok = d => d && d.getTime && d.getTime() > 0;
	for (let i = 0; i < 600 && !ok(Services.startup.getStartupInfo().sessionRestored); i++) await wait(100);
	await wait(idleMs);
	const s = Services.startup.getStartupInfo(), p = s.process.getTime(), startup = {};
	for (const k in s) if (ok(s[k])) startup[k] = s[k].getTime() - p;
	const r = { startup, processStartEpoch: p, nowSinceProcess: Date.now() - p, extensions: {} };
	for (const pol of WebExtensionPolicy.getActiveExtensions()) r.extensions[pol.id] = { name: pol.name, bg: pol.extension && pol.extension.backgroundState };
	try {
		const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
		const a = await AddonManager.getAddonByID(ngId); r.ng = a ? { version: a.version, isActive: a.isActive } : null;
	} catch (e) { r.ngErr = String(e); }
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

// content context, in the new tab: times are ms since the tab's time origin
const CONTENT_NEWTAB = `
const done = arguments[arguments.length - 1];
const start = performance.now();
function count() { let n = 0; for (const a of document.querySelectorAll('a')) { const c = a.firstElementChild || a; if (((c.style && c.style.backgroundImage) || '').indexOf('data:image') >= 0) n++; } return n; }
let last = -1, lastChange = performance.now(), tiles = 0;
(function poll() {
	const n = count(); tiles = document.querySelectorAll('a').length;
	if (n !== last) { last = n; lastChange = performance.now(); }
	if ((n > 0 && performance.now() - lastChange > 500) || performance.now() - start > 6000) {
		const imagesSet = n > 0 ? lastChange : null;
		requestAnimationFrame(() => requestAnimationFrame(() => {
			const nav = performance.getEntriesByType('navigation')[0] || {};
			const paint = {}; for (const p of performance.getEntriesByType('paint')) paint[p.name] = +p.startTime.toFixed(1);
			done({ url: location.href, timeOrigin: performance.timeOrigin, images: n, links: tiles,
				domContentLoaded: +(nav.domContentLoadedEventEnd || 0).toFixed(1), load: +(nav.loadEventEnd || 0).toFixed(1),
				imagesSet: imagesSet && +imagesSet.toFixed(1), paint });
		}));
	} else setTimeout(poll, 2);
})();
`;

const CHROME_DISABLE_NG = `
const [ngId, done] = arguments;
ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager.getAddonByID(ngId)
	.then(a => a.disable()).then(() => done('disabled'), e => done('ERR ' + e));
`;

async function launch(n, opts) {
	const args = ['-profile', profile, '-no-remote', '-marionette'];
	if (!HEADFUL) args.push('-headless');
	const t0 = Date.now();
	const env = Object.assign({}, process.env, { MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' });
	if (opts.profileTo) Object.assign(env, { MOZ_PROFILER_STARTUP: '1', MOZ_PROFILER_STARTUP_ENTRIES: '33554432', MOZ_PROFILER_STARTUP_INTERVAL: '1',
		MOZ_PROFILER_STARTUP_FEATURES: 'js,stackwalk,markers,cpu,processcpu,ipcmessages',
		MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain,Compositor,Renderer,IndexedDB,DOM Worker,StyleThread,BgIOThreadPool,StreamTrans,Timer' });
	const ff = spawn(ffPath, args, { stdio: 'ignore', detached: false, env });
	ff.on('error', e => log('spawn error', e));
	const m = await connect(90000);
	const tConnected = Date.now() - t0;
	await m.send('WebDriver:NewSession', { capabilities: { alwaysMatch: { 'moz:webdriverClick': false } } });
	const tSession = Date.now() - t0;
	await m.send('WebDriver:SetTimeouts', { script: 180000 });
	await m.send('Marionette:SetContext', { value: 'chrome' });
	const res = { run: n, label, spawnToMarionetteMs: tConnected, spawnToSessionMs: tSession };
	try {
		Object.assign(res, await m.exec(CHROME_STARTUP, [NG, IDLE_MS, DISCOVER], true));
		res.spawnLagMs = res.processStartEpoch - t0;
		if (opts.newTab) {
			await m.send('Marionette:SetContext', { value: 'chrome' });
			const o = await m.exec(CHROME_OPEN_TAB, [], true);
			await m.send('Marionette:SetContext', { value: 'content' });
			const handles = await m.send('WebDriver:GetWindowHandles');
			const list = handles.value || handles;
			await m.send('WebDriver:SwitchToWindow', { handle: list[list.length - 1], focus: true });
			try {
				const t = await m.exec(CONTENT_NEWTAB, [], true);
				t.openToTimeOriginMs = +(t.timeOrigin - o.openEpoch).toFixed(1);
				res.newTab = t;
			} catch (e) { res.newTabErr = String(e).slice(0, 500); }
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
	try { await m.send('Marionette:Quit', { flags: ['eAttemptQuit'] }); } catch (e) {}
	res.exited = await waitExit(60000);
	await sleep(3000);
	return res;
}

(async () => {
	writeUserJs();
	const runs = parseInt(runsArg, 10) || 1;
	log(`start label=${label} runs=${runs} discover=${DISCOVER} disableNg=${DISABLE_NG}`);
	if (DISABLE_NG) { const r = await launch(0, { disableNg: true }); log('disable launch:', r.disableNg || r.error); }
	for (let n = 0; n <= runs; n++) {
		const r = await launch(n, { newTab: true, profileTo: GECKO_PROFILE && n === runs ? GECKO_PROFILE : null });
		r.warmup = n === 0;
		out(r);
		log(`run ${n}${n === 0 ? ' (warm-up)' : ''}: sessionRestored=${r.startup && r.startup.sessionRestored} firstPaint=${r.startup && (r.startup.firstPaint2 || r.startup.firstPaint)} newTab=${r.newTab ? JSON.stringify(r.newTab) : r.newTabErr || r.error}`);
	}
	out({ done: true, label });
	log('done');
})().catch(e => {
	log('FATAL', e.stack); out({ done: true, fatal: String(e) });
	// close the Firefox this harness started (only the one using the profile copy)
	try { require('child_process').execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='firefox.exe'\\" | Where-Object { $_.CommandLine -like '*${path.basename(profile)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`); } catch (x) {}
	process.exit(1);
});
