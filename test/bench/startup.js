// Quick Dial NG: Firefox startup profiling on a copy of a real profile.
// Drives Firefox through Marionette (no extra packages needed). Never point this at a profile you use: it writes
// user.js and may disable add-ons. See README.md in this folder.
'use strict';
const net = require('net'), fs = require('fs'), path = require('path'), { spawn, spawnSync } = require('child_process');
const { IS_WINDOWS, FIREFOX_PROCESS, ARG, fail, sleep, parseArgs, readExtensionId } = require('./lib');

const EXTENSION_ID = readExtensionId();
const DEFAULTS = { idle: 8000, newtabs: 1, settle: 500 };

// Marionette: Firefox's remote control, over a local socket
const MARIONETTE_HOST = '127.0.0.1', MARIONETTE_PORT = 2829;
const MESSAGE_LENGTH_SEPARATOR = ':'; // each message is "<length>:<json>"
const COMMAND_TYPE = 0; // [0, id, name, parameters]
const CONNECT_TIMEOUT_MS = 90000, CONNECT_RETRY_MS = 50; // Firefox starts and Marionette answers
const SCRIPT_TIMEOUT_MS = 180000; // longest script run through Marionette
const ERROR_TEXT_MAX = { marionette: 2000, launch: 1000, newTab: 500, startTab: 300 }; // characters kept of an error

// Firefox processes and files
const EXIT_TIMEOUT_MS = 60000, EXIT_POLL_MS = 250; // Firefox quits after a launch
const PROFILE_LOCK = 'parent.lock', USER_JS = 'user.js', RESULTS_LOG_SUFFIX = '.log';
const FIREFOX_ARGS = ['-no-remote', '-marionette'], HEADLESS_ARG = '-headless';
const USER_PREFS = { // written to the profile copy's user.js
	'marionette.port': MARIONETTE_PORT, 'browser.shell.checkDefaultBrowser': false, 'app.update.auto': false, 'app.update.checkInstallTime': false,
	'datareporting.policy.dataSubmissionEnabled': false, 'toolkit.telemetry.reportingpolicy.firstRun': false
};
const HOMEPAGE_PREF = 'browser.startup.homepage';
const ENV = { MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' }; // lets Marionette run scripts in Firefox's own (chrome) context
const PROFILER_ENV = { // --gecko-profile: what the Firefox Profiler records from the start
	MOZ_PROFILER_STARTUP: '1', MOZ_PROFILER_STARTUP_ENTRIES: '33554432', MOZ_PROFILER_STARTUP_INTERVAL: '1',
	MOZ_PROFILER_STARTUP_FEATURES: 'js,stackwalk,markers,cpu,processcpu,ipcmessages',
	MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain,Compositor,Renderer,IndexedDB,DOM Worker,StyleThread,BgIOThreadPool,StreamTrans,Timer'
};

// Waits inside Firefox
const SESSION_RESTORE_TRIES = 600, SESSION_RESTORE_POLL_MS = 100; // up to a minute for the session to be restored
const IDLE_DISPATCH_TIMEOUT_MS = 1000, SETTLE_POLL_MS = 100;
const NEWTAB_MAX_MS = 6000; // longest wait for a new tab's pictures
const NEWTAB_NO_PICTURES_MS = 1500; // a new tab with no pictures yet this long after its load event has none to show
// The script that times a new tab can start in the tab's first, blank page; when the dial replaces that page, the
// script ends without a result and runs again in the dial. Its times are the page's own, so only imagesSet can come
// out late, when the pictures were already there; such a result has attempts set.
const NEWTAB_SCRIPT_TRIES = 2;
const TIME_OF_DAY = [11, 19]; // hh:mm:ss in an ISO date, for the log
const NO_PICTURES_WARNING = 'warning: no new tab showed a tile picture. Is the profile copy complete? Without places.sqlite'
	+ ' the dial loses its pictures on the first start (see README.md).';

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

const parsedArgs = parseArgs(process.argv.slice(2), {
	newtabs: ARG.int, idle: ARG.int, settle: ARG.int, homepage: ARG.string, 'gecko-profile': ARG.string,
	'disable-ng': ARG.bool, headful: ARG.bool, discover: ARG.bool
}, USAGE);
const [firefoxPath, profileDirArg, runsArg, label, resultsPath] = parsedArgs.positional;
if (!resultsPath) fail('missing arguments\n\n' + USAGE);
const profileDir = path.resolve(profileDirArg); // in full: it is how this harness tells its own Firefox from any other
const options = Object.assign({}, DEFAULTS, parsedArgs);
const geckoProfilePath = options.geckoProfile ? path.resolve(options.geckoProfile) : null;

// PowerShell that lists the firefox.exe processes started with this profile copy (Windows only)
function findOwnFirefoxCommand() {
	const quotedProfileDir = profileDir.replace(/'/g, "''");
	return `Get-CimInstance Win32_Process -Filter "Name='${FIREFOX_PROCESS}'" | Where-Object { $_.CommandLine -and `
		+ `$_.CommandLine.IndexOf('${quotedProfileDir}', [StringComparison]::OrdinalIgnoreCase) -ge 0 }`;
}

function log(...parts) {
	const line = new Date().toISOString().slice(...TIME_OF_DAY) + ' ' + parts.join(' ');
	console.log(line);
	fs.appendFileSync(resultsPath + RESULTS_LOG_SUFFIX, line + '\n');
}
const writeResult = result => fs.appendFileSync(resultsPath, JSON.stringify(result) + '\n');

function writeUserJs() {
	const prefs = Object.assign({}, USER_PREFS, options.homepage ? { [HOMEPAGE_PREF]: options.homepage } : {});
	const lines = Object.entries(prefs).map(([name, value]) => `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`);
	fs.writeFileSync(path.join(profileDir, USER_JS), lines.join('\n') + '\n');
}

// ---- minimal Marionette client ----
class Marionette {
	constructor(socket) {
		this.socket = socket;
		this.buffer = Buffer.alloc(0);
		this.lastId = 0;
		this.pending = new Map();
		this.isClosed = false;
		this.greeting = new Promise(resolve => { this._resolveGreeting = resolve; });
		socket.on('data', data => {
			this.buffer = Buffer.concat([this.buffer, data]);
			this._readMessages();
		});
		socket.on('close', () => {
			this.isClosed = true;
			for (const call of this.pending.values()) call.reject(new Error('connection closed'));
			this.pending.clear();
		});
		socket.on('error', () => {});
	}
	_readMessages() {
		const separator = MESSAGE_LENGTH_SEPARATOR.charCodeAt(0);
		for (;;) {
			const separatorIndex = this.buffer.indexOf(separator);
			if (separatorIndex < 0) return;
			const length = parseInt(this.buffer.slice(0, separatorIndex).toString(), 10);
			const start = separatorIndex + 1;
			if (this.buffer.length < start + length) return;
			const message = JSON.parse(this.buffer.slice(start, start + length).toString('utf8'));
			this.buffer = this.buffer.slice(start + length);
			if (!Array.isArray(message)) {
				this._resolveGreeting(message);
				continue;
			}
			const [, id, error, result] = message, call = this.pending.get(id);
			if (!call) continue;
			this.pending.delete(id);
			if (error) call.reject(new Error(JSON.stringify(error).slice(0, ERROR_TEXT_MAX.marionette)));
			else call.resolve(result);
		}
	}
	send(name, params) {
		const id = ++this.lastId;
		const body = Buffer.from(JSON.stringify([COMMAND_TYPE, id, name, params || {}]), 'utf8');
		this.socket.write(body.length + MESSAGE_LENGTH_SEPARATOR);
		this.socket.write(body);
		return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
	}
	async runScript(script, scriptArgs, isAsync) {
		const result = await this.send(isAsync ? 'WebDriver:ExecuteAsyncScript' : 'WebDriver:ExecuteScript', { script, args: scriptArgs || [] });
		return result && 'value' in result ? result.value : result;
	}
	setContext(context) {
		return this.send('Marionette:SetContext', { value: context });
	}
}
async function connectMarionette(timeoutMs) {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		try {
			const socket = await new Promise((resolve, reject) => {
				const connection = net.connect(MARIONETTE_PORT, MARIONETTE_HOST);
				connection.once('connect', () => resolve(connection));
				connection.once('error', reject);
			});
			const marionette = new Marionette(socket);
			await marionette.greeting;
			return marionette;
		} catch (e) {
			await sleep(CONNECT_RETRY_MS);
		}
	}
	throw new Error('Marionette did not answer');
}
// Waits until no Firefox process uses the profile any more (its lock can be removed, and on Windows no firefox.exe
// names it), so the next launch starts clean. Firefox's launcher exits at once, so the spawned process says little.
async function waitForExit(timeoutMs) {
	const lockPath = path.join(profileDir, PROFILE_LOCK), end = Date.now() + timeoutMs;
	const isFirefoxRunning = () => {
		if (!IS_WINDOWS) return false;
		const result = spawnSync('powershell', ['-NoProfile', '-Command', `@(${findOwnFirefoxCommand()}).Count`], { encoding: 'utf8' });
		return parseInt(result.stdout, 10) > 0;
	};
	while (Date.now() < end) {
		try {
			if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
			if (!isFirefoxRunning()) return true;
		} catch (e) { /* still locked */ }
		await sleep(EXIT_POLL_MS);
	}
	return false;
}

// ---- scripts run inside Firefox (chrome context: Firefox's own code; content context: the tab's page) ----
const CHROME_STARTUP = `
const [extensionId, idleMaxMs, discover, done] = arguments;
(async () => {
	const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
	const isSet = date => date && date.getTime && date.getTime() > 0;
	for (let i = 0; i < ${SESSION_RESTORE_TRIES} && !isSet(Services.startup.getStartupInfo().sessionRestored); i++) await wait(${SESSION_RESTORE_POLL_MS});
	// Settled: no extension's background page is still starting, and the main thread has gone idle (at most idleMaxMs)
	const settleStart = Date.now();
	const countStarting = () => WebExtensionPolicy.getActiveExtensions().filter(policy => policy.extension && policy.extension.backgroundState === 'starting').length;
	while (Date.now() - settleStart < idleMaxMs) {
		await new Promise(resolve => ChromeUtils.idleDispatch(resolve, { timeout: ${IDLE_DISPATCH_TIMEOUT_MS} }));
		if (!countStarting()) break;
		await wait(${SETTLE_POLL_MS});
	}
	const settledMs = Date.now() - settleStart;
	const startupInfo = Services.startup.getStartupInfo(), processStart = startupInfo.process.getTime(), startup = {};
	for (const key in startupInfo) if (isSet(startupInfo[key])) startup[key] = startupInfo[key].getTime() - processStart;
	const result = { startup, processStartEpoch: processStart, nowSinceProcess: Date.now() - processStart, settledMs, extensions: {} };
	for (const policy of WebExtensionPolicy.getActiveExtensions()) {
		result.extensions[policy.id] = { name: policy.name, backgroundState: policy.extension && policy.extension.backgroundState };
	}
	try {
		const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
		const addon = await AddonManager.getAddonByID(extensionId);
		result.quickDialNg = addon ? { version: addon.version, isActive: addon.isActive } : null;
	} catch (e) { result.quickDialNgError = String(e); }
	// Per-extension timings Firefox keeps: [total ms, count], cumulative across launches of this profile
	const timings = {}, gleanTiming = Glean.extensionsTiming, NS_PER_MS = 1e6;
	const metrics = [['extensionStartupByAddonid', 'startup'], ['backgroundPageLoadByAddonid', 'backgroundLoad'], ['storageLocalGetIdbByAddonid', 'storageRead']];
	for (const [metric, key] of metrics) {
		for (const id of Object.keys(result.extensions)) {
			try {
				const value = gleanTiming[metric][id].testGetValue();
				if (value && value.count) (timings[id] = timings[id] || {})[key] = [+(value.sum / NS_PER_MS).toFixed(1), value.count];
			} catch (e) {}
		}
	}
	result.extensionTimings = timings;
	// The open tabs: what each loaded before (the start tab's history)
	result.tabs = [...gBrowser.tabs].map(tab => {
		const browser = tab.linkedBrowser, history = browser.browsingContext && browser.browsingContext.sessionHistory, urls = [];
		if (history) for (let i = 0; i < history.count; i++) urls.push(history.getEntryAtIndex(i).URI.spec);
		return { url: browser.currentURI.spec, history: urls };
	});
	if (discover) {
		const found = result.discover = {};
		try {
			const histograms = Services.telemetry.getSnapshotForHistograms('main', false);
			for (const processName in histograms) for (const name in histograms[processName]) {
				if (!/WEBEXT|EXTENSION|STARTUP|STORAGE/.test(name)) continue;
				const histogram = histograms[processName][name];
				(found.histograms = found.histograms || {})[processName + ':' + name] = histogram.sum + '/' + Object.values(histogram.values || {}).reduce((x, y) => x + y, 0);
			}
		} catch (e) { found.histogramsError = String(e); }
		try {
			const keyed = Services.telemetry.getSnapshotForKeyedHistograms('main', false);
			for (const processName in keyed) for (const name in keyed[processName]) {
				if (!/WEBEXT|EXTENSION/.test(name)) continue;
				for (const key in keyed[processName][name]) (found.keyedHistograms = found.keyedHistograms || {})[processName + ':' + name + ':' + key] = keyed[processName][name][key].sum;
			}
		} catch (e) { found.keyedHistogramsError = String(e); }
		try {
			const scalars = Services.telemetry.getSnapshotForScalars('main', false);
			found.scalars = {};
			for (const processName in scalars) for (const name in scalars[processName]) if (/exten|startup|webext/i.test(name)) found.scalars[processName + ':' + name] = scalars[processName][name];
		} catch (e) { found.scalarsError = String(e); }
		try {
			found.glean = {};
			for (const name of ['backgroundPageLoad', 'extensionStartup', 'storageLocalGetIdb', 'storageLocalSetIdb', 'browserActionPopupOpen', 'pageActionPopupOpen', 'contentScriptInjection', 'eventPageRunningTime']) {
				try {
					const value = gleanTiming[name].testGetValue();
					found.glean[name] = value && (value.values ? { sum: value.sum, count: value.count } : value);
				} catch (e) { found.glean[name] = 'ERR ' + e; }
			}
			try { found.gleanLabels = Object.keys(gleanTiming.backgroundPageLoad); } catch (e) {}
		} catch (e) { found.gleanError = String(e); }
		try {
			const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
			const extension = ExtensionParent.GlobalManager.getExtension(extensionId);
			const isSimple = value => value === null || ['number', 'string', 'boolean'].includes(typeof value);
			found.extensionKeys = extension ? Object.keys(extension).filter(key => isSimple(extension[key])).map(key => key + '=' + String(extension[key]).slice(0, 60)) : 'none';
		} catch (e) { found.extensionError = String(e); }
		try {
			const { AddonManagerPrivate } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
			found.addonManagerTelemetry = AddonManagerPrivate.getTelemetryDetails ? AddonManagerPrivate.getTelemetryDetails() : 'n/a';
		} catch (e) { found.addonManagerError = String(e); }
	}
	done(result);
})().catch(e => done({ error: String(e) + ' ' + e.stack }));
`;

const CHROME_OPEN_TAB = `
const done = arguments[arguments.length - 1];
const openEpoch = Date.now();
if (window.BrowserCommands && BrowserCommands.openTab) BrowserCommands.openTab(); else BrowserOpenTab();
const browser = gBrowser.selectedBrowser;
done({ openEpoch, uri: browser.currentURI && browser.currentURI.spec });
`;

// Content context, in a new tab: when its pictures are set (times are ms since the tab's time origin). The page is
// followed with a MutationObserver: a busy poll here would hold up the page being measured.
const CONTENT_NEWTAB = `
const [settleMs, maxMs, noPicturesMs, done] = arguments;
const start = performance.now();
const loadEnd = () => (performance.getEntriesByType('navigation')[0] || {}).loadEventEnd || 0;
const countPictures = () => {
	let count = 0;
	for (const link of document.querySelectorAll('a')) {
		const panel = link.firstElementChild || link;
		if (((panel.style && panel.style.backgroundImage) || '').indexOf('data:image') >= 0) count++;
	}
	return count;
};
let pictures = countPictures(), lastChange = performance.now();
const observer = new MutationObserver(() => {
	const count = countPictures();
	if (count !== pictures) { pictures = count; lastChange = performance.now(); }
});
observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
(function check() { // done when the pictures haven't changed for settleMs, when none came noPicturesMs after the load event, or after maxMs
	const now = performance.now(), loadedAt = loadEnd();
	const noPictures = pictures === 0 && loadedAt > 0 && now - loadedAt >= noPicturesMs;
	if ((pictures > 0 && now - lastChange >= settleMs) || noPictures || now - start >= maxMs) finish();
	else setTimeout(check, pictures > 0 ? settleMs - (now - lastChange) : settleMs);
})();
function finish() {
	observer.disconnect();
	requestAnimationFrame(() => requestAnimationFrame(() => {
		const navigation = performance.getEntriesByType('navigation')[0] || {};
		const paint = {};
		for (const entry of performance.getEntriesByType('paint')) paint[entry.name] = +entry.startTime.toFixed(1);
		done({ url: location.href, timeOrigin: performance.timeOrigin, images: pictures, links: document.querySelectorAll('a').length,
			domContentLoaded: +(navigation.domContentLoadedEventEnd || 0).toFixed(1), load: +(navigation.loadEventEnd || 0).toFixed(1),
			imagesSet: pictures > 0 ? +lastChange.toFixed(1) : null, paint });
	}));
}
`;

const CONTENT_STARTTAB = `
const done = arguments[arguments.length - 1];
const navigation = performance.getEntriesByType('navigation')[0] || {};
let fcp = null;
for (const entry of performance.getEntriesByType('paint')) if (entry.name === 'first-contentful-paint') fcp = +entry.startTime.toFixed(1);
let images = 0;
for (const link of document.querySelectorAll('a')) {
	const panel = link.firstElementChild || link;
	if (((panel.style && panel.style.backgroundImage) || '').indexOf('data:image') >= 0) images++;
}
done({ url: location.href, timeOrigin: performance.timeOrigin, fcp, domContentLoaded: +(navigation.domContentLoadedEventEnd || 0).toFixed(1), images });
`;

const CHROME_DISABLE_EXTENSION = `
const [extensionId, done] = arguments;
ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager.getAddonByID(extensionId)
	.then(addon => addon.disable()).then(() => done('disabled'), e => done('ERR ' + e));
`;

// Closes the selected tab, once the browser is idle again
const CHROME_CLOSE_TAB = `
const done = arguments[arguments.length - 1];
gBrowser.removeTab(gBrowser.selectedTab);
ChromeUtils.idleDispatch(() => done(true), { timeout: ${IDLE_DISPATCH_TIMEOUT_MS} });
`;

const CHROME_SAVE_PROFILE = `
const [filePath, done] = arguments;
Services.profiler.dumpProfileToFileAsync(filePath).then(() => done('saved ' + filePath), e => done('ERR ' + e));
`;

// Opens a new tab the way Ctrl+T does and times it until its pictures are set; closes it again
async function measureNewTab(marionette) {
	await marionette.setContext('chrome');
	const opened = await marionette.runScript(CHROME_OPEN_TAB, [], true);
	await marionette.setContext('content');
	const handles = await marionette.send('WebDriver:GetWindowHandles');
	const handleList = handles.value || handles;
	await marionette.send('WebDriver:SwitchToWindow', { handle: handleList[handleList.length - 1], focus: true });
	let timings = null;
	for (let attempt = 1; !timings && attempt <= NEWTAB_SCRIPT_TRIES; attempt++) {
		timings = await marionette.runScript(CONTENT_NEWTAB, [options.settle, NEWTAB_MAX_MS, NEWTAB_NO_PICTURES_MS], true);
		if (timings && attempt > 1) timings.attempts = attempt;
	}
	if (!timings) throw new Error(`no result from the new tab after ${NEWTAB_SCRIPT_TRIES} tries`);
	timings.openToTimeOriginMs = +(timings.timeOrigin - opened.openEpoch).toFixed(1);
	await marionette.setContext('chrome');
	await marionette.runScript(CHROME_CLOSE_TAB, [], true);
	return timings;
}

async function launch(runNumber, launchOptions) {
	const firefoxArgs = ['-profile', profileDir, ...FIREFOX_ARGS];
	if (!options.headful) firefoxArgs.push(HEADLESS_ARG);
	const spawnedAt = Date.now();
	const env = Object.assign({}, process.env, ENV, launchOptions.profilePath ? PROFILER_ENV : {});
	const firefox = spawn(firefoxPath, firefoxArgs, { stdio: 'ignore', detached: false, env });
	firefox.on('error', e => log('spawn error', e));
	const marionette = await connectMarionette(CONNECT_TIMEOUT_MS);
	const connectedMs = Date.now() - spawnedAt;
	await marionette.send('WebDriver:NewSession', { capabilities: { alwaysMatch: { 'moz:webdriverClick': false } } });
	const sessionMs = Date.now() - spawnedAt;
	await marionette.send('WebDriver:SetTimeouts', { script: SCRIPT_TIMEOUT_MS });
	await marionette.setContext('chrome');
	const result = { run: runNumber, label, spawnToMarionetteMs: connectedMs, spawnToSessionMs: sessionMs };
	try {
		Object.assign(result, await marionette.runScript(CHROME_STARTUP, [EXTENSION_ID, options.idle, !!options.discover], true));
		result.spawnLagMs = result.processStartEpoch - spawnedAt;
		await marionette.setContext('content');
		const handle = await marionette.send('WebDriver:GetWindowHandle');
		await marionette.send('WebDriver:SwitchToWindow', { handle: handle.value || handle, focus: true });
		try {
			const startTab = await marionette.runScript(CONTENT_STARTTAB, [], true);
			startTab.timeOriginSinceProcess = +(startTab.timeOrigin - result.processStartEpoch).toFixed(1);
			if (startTab.fcp != null) startTab.paintedSinceProcess = +(startTab.timeOriginSinceProcess + startTab.fcp).toFixed(1);
			result.startTab = startTab;
		} catch (e) { result.startTabError = String(e).slice(0, ERROR_TEXT_MAX.startTab); }
		if (launchOptions.newTabs) {
			const newTabs = [];
			try {
				for (let i = 0; i < launchOptions.newTabs; i++) newTabs.push(await measureNewTab(marionette));
			} catch (e) { result.newTabError = String(e).slice(0, ERROR_TEXT_MAX.newTab); }
			if (newTabs.length) result.newTab = newTabs[0]; // the first new tab of the launch
			if (newTabs.length > 1) result.newTabsLater = newTabs.slice(1);
		}
		if (launchOptions.profilePath) {
			await marionette.setContext('chrome');
			result.geckoProfile = await marionette.runScript(CHROME_SAVE_PROFILE, [launchOptions.profilePath], true);
		}
		if (launchOptions.disableExtension) {
			await marionette.setContext('chrome');
			result.disableExtension = await marionette.runScript(CHROME_DISABLE_EXTENSION, [EXTENSION_ID], true);
		}
	} catch (e) { result.error = String(e).slice(0, ERROR_TEXT_MAX.launch); }
	try { await marionette.send('Marionette:Quit', { flags: ['eAttemptQuit'] }); } catch (e) { /* already closing */ }
	result.exited = await waitForExit(EXIT_TIMEOUT_MS);
	return result;
}

(async () => {
	writeUserJs();
	const runs = parseInt(runsArg, 10) || 1;
	log(`start label=${label} runs=${runs} newtabs=${options.newtabs} discover=${!!options.discover} disableNg=${!!options.disableNg}`);
	if (options.disableNg) {
		const result = await launch(0, { disableExtension: true });
		log('disable launch:', result.disableExtension || result.error);
	}
	for (let runNumber = 0; runNumber <= runs; runNumber++) {
		const result = await launch(runNumber, { newTabs: options.newtabs, profilePath: geckoProfilePath && runNumber === runs ? geckoProfilePath : null });
		result.warmup = runNumber === 0;
		writeResult(result);
		const firstPaint = result.startup && (result.startup.firstPaint2 || result.startup.firstPaint);
		log(`run ${runNumber}${result.warmup ? ' (warm-up)' : ''}: sessionRestored=${result.startup && result.startup.sessionRestored} firstPaint=${firstPaint}`
			+ ` startTab=${JSON.stringify(result.startTab || result.startTabError)} tabs=${JSON.stringify(result.tabs)}`
			+ ` newTab=${result.newTab ? JSON.stringify(result.newTab) : result.newTabError || result.error}`);
		const newTabs = [result.newTab, ...(result.newTabsLater || [])].filter(Boolean);
		if (newTabs.length && newTabs.every(tab => tab.images === 0)) log(NO_PICTURES_WARNING);
	}
	writeResult({ done: true, label });
	log('done');
})().catch(e => {
	log('FATAL', e.stack);
	writeResult({ done: true, fatal: String(e) });
	// Close the Firefox this harness started (only the one using the profile copy)
	try {
		spawnSync('powershell', ['-NoProfile', '-Command',
			`${findOwnFirefoxCommand()} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]);
	} catch (closeError) { /* nothing left to close */ }
	process.exit(1);
});
