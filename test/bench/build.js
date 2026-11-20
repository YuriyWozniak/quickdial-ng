// Builds the benchmark copy of the extension: node test/bench/build.js <srcDir> <outDir> <ng|orig> [optionsJson]
// The copy's background page is seed.js (it loads the extension's own background scripts once its data is in place);
// dial.html gets early.js as its first script, and shared.js and probe.js right after js/dial.js. bench/config.js holds
// the format, the extension's default settings, its background scripts and the options run.js passes on (optionsJson);
// bench/shared.js holds what the Node tools and these scripts agree on (lib.js SHARED).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { SHARED, fail } = require('./lib');

const { BENCH_DIR, FORMATS } = SHARED;
const PAGE_SCRIPTS = ['seed.js', 'early.js', 'probe.js']; // copied from this folder
const CONFIG_SCRIPT = 'config.js', SHARED_SCRIPT = 'shared.js'; // written into the copy
const MANIFEST = 'manifest.json', DIAL_PAGE = 'dial.html';
const START_SCRIPT = /(^|\/)main\.js$/; // the background script that starts the extension (Quick Dial NG 0.6 on)
const ID_PREFIX = 'quickdial-bench-', ID_SUFFIX = '@local'; // the copy's add-on id never clashes with an installed Quick Dial NG
const DOWNLOADS_PERMISSION = 'downloads'; // seed.js saves its results as downloads
// The original Quick Dial keeps its default settings inline in its loader: data = { version: 3, settings: { ... }, node: ... }
const INLINE_DEFAULTS = /data = \{\s*version: [34],\s*settings: (\{[^]*?\r?\n\t\t\t\t\}),\s*node/;
const HEAD_TAG = /<head[^>]*>/i;
const DIAL_SCRIPT_TAG = /<script\b[^>]*\bsrc="(?:\.\/)?js\/dial\.js"[^>]*><\/script>/i;
const DEFER = /\bdefer\b/i;
const JSON_INDENT = '\t';

const [sourceDir, outDir, format, optionsJson] = process.argv.slice(2);
if (!sourceDir || !outDir || !Object.values(FORMATS).includes(format)) fail('usage: build.js <srcDir> <outDir> <ng|orig> [optionsJson]');
let benchOptions = {};
try {
	benchOptions = optionsJson ? JSON.parse(optionsJson) : {};
} catch (e) {
	fail('optionsJson is not valid JSON: ' + e.message);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(sourceDir, outDir, { recursive: true });
const benchDir = path.join(outDir, BENCH_DIR);
fs.mkdirSync(benchDir, { recursive: true });
for (const script of PAGE_SCRIPTS) fs.copyFileSync(path.join(__dirname, script), path.join(benchDir, script));

// The extension's default settings
const manifestPath = path.join(outDir, MANIFEST);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const backgroundScripts = manifest.background.scripts;
function readDefaultSettings() {
	const backgroundCode = backgroundScripts.map(script => fs.readFileSync(path.join(sourceDir, script), 'utf8')).join('\n');
	const inlineDefaults = backgroundCode.match(INLINE_DEFAULTS);
	if (inlineDefaults) return inlineDefaults[1];
	// Quick Dial NG: run its background scripts (without main.js, which starts it) and ask.
	// Up to 0.5.0 a single background.js started itself as it loaded: give it a browser API whose calls never answer.
	const silentApi = new Proxy(function () {}, { get: () => silentApi, apply: () => new Promise(() => {}) });
	const context = vm.createContext({ console, browser: silentApi });
	for (const script of backgroundScripts) {
		if (!START_SCRIPT.test(script)) vm.runInContext(fs.readFileSync(path.join(sourceDir, script), 'utf8'), context, { filename: script });
	}
	return JSON.stringify(vm.runInContext('app.Settings.defaults()', context), null, JSON_INDENT);
}
fs.writeFileSync(path.join(benchDir, CONFIG_SCRIPT), [
	`var BENCH_FORMAT = ${JSON.stringify(format)};`,
	`var BENCH_DEFAULTS = ${readDefaultSettings()};`,
	`var BENCH_SCRIPTS = ${JSON.stringify(backgroundScripts)};`,
	`var BENCH_OPTIONS = ${JSON.stringify(benchOptions)};`,
	''].join('\n'));
fs.writeFileSync(path.join(benchDir, SHARED_SCRIPT), `var BENCH_SHARED = ${JSON.stringify(SHARED, null, JSON_INDENT)};\n`);

manifest.permissions.push(DOWNLOADS_PERMISSION);
manifest.background.scripts = [SHARED_SCRIPT, CONFIG_SCRIPT, 'seed.js'].map(script => BENCH_DIR + '/' + script);
manifest.browser_specific_settings.gecko.id = ID_PREFIX + format + ID_SUFFIX;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// dial.html: early.js first in <head>; shared.js and probe.js right after js/dial.js (deferred too when dial.js is)
const dialPath = path.join(outDir, DIAL_PAGE);
let html = fs.readFileSync(dialPath, 'utf8');
if (!HEAD_TAG.test(html)) fail(`${DIAL_PAGE} has no <head>`);
html = html.replace(HEAD_TAG, tag => tag + `<script src="${BENCH_DIR}/early.js"></script>`);
const dialScriptTag = html.match(DIAL_SCRIPT_TAG);
if (!dialScriptTag) fail(`${DIAL_PAGE} does not load js/dial.js`);
const deferAttribute = DEFER.test(dialScriptTag[0]) ? ' defer' : '';
const benchTags = [SHARED_SCRIPT, 'probe.js'].map(script => `<script src="${BENCH_DIR}/${script}"${deferAttribute}></script>`).join('');
html = html.replace(DIAL_SCRIPT_TAG, tag => tag + benchTags);
fs.writeFileSync(dialPath, html);
console.log('built', format, 'bench in', outDir);
