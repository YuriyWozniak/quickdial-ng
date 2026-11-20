// Builds the benchmark copy of the extension: node test/bench/build.js <srcDir> <outDir> <ng|orig> [optionsJson]
// The copy's background page is seed.js (it loads the extension's own background scripts once its data is in place);
// dial.html gets early.js as its first script and probe.js right after js/dial.js. bench/config.js holds the format,
// the extension's default settings, its background scripts and the options run.js passes on (optionsJson).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { fail } = require('./lib');

const BENCH_DIR = 'bench'; // inside the copy
const PAGE_SCRIPTS = ['seed.js', 'early.js', 'probe.js']; // copied from this folder
const ID_PREFIX = 'quickdial-bench-'; // the copy's add-on id never clashes with an installed Quick Dial NG

const [src, out, format, optionsJson] = process.argv.slice(2);
if (!src || !out || !['ng', 'orig'].includes(format)) fail('usage: build.js <srcDir> <outDir> <ng|orig> [optionsJson]');
let options = {};
try { options = optionsJson ? JSON.parse(optionsJson) : {}; } catch (e) { fail('optionsJson is not valid JSON: ' + e.message); }

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.mkdirSync(path.join(out, BENCH_DIR), { recursive: true });
for (const f of PAGE_SCRIPTS) fs.copyFileSync(path.join(__dirname, f), path.join(out, BENCH_DIR, f));

// The extension's default settings
const manPath = path.join(out, 'manifest.json');
const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
const bgScripts = man.background.scripts;
function defaultSettings() {
	const bg = bgScripts.map(s => fs.readFileSync(path.join(src, s), 'utf8')).join('\n');
	// The original keeps them inline in its loader: data = { version: 3, settings: { ... }, node: ... }
	const inline = bg.match(/data = \{\s*version: [34],\s*settings: (\{[^]*?\r?\n\t\t\t\t\}),\s*node/);
	if (inline) return inline[1];
	// Quick Dial NG: run its background scripts (without main.js, which starts it) and ask.
	// Up to 0.5.0 a single background.js started itself as it loaded: give it a browser API whose calls never answer.
	const idle = new Proxy(function () {}, { get: () => idle, apply: () => new Promise(() => {}) });
	const ctx = vm.createContext({ console, browser: idle });
	for (const s of bgScripts) if (!/(^|\/)main\.js$/.test(s)) vm.runInContext(fs.readFileSync(path.join(src, s), 'utf8'), ctx, { filename: s });
	return JSON.stringify(vm.runInContext('app.Settings.defaults()', ctx), null, '\t');
}
fs.writeFileSync(path.join(out, BENCH_DIR, 'config.js'), [
	`var BENCH_FORMAT = ${JSON.stringify(format)};`,
	`var BENCH_DEFAULTS = ${defaultSettings()};`,
	`var BENCH_SCRIPTS = ${JSON.stringify(bgScripts)};`,
	`var BENCH_OPTIONS = ${JSON.stringify(options)};`,
	''].join('\n'));

man.permissions.push('downloads');
man.background.scripts = [BENCH_DIR + '/config.js', BENCH_DIR + '/seed.js'];
man.browser_specific_settings.gecko.id = ID_PREFIX + format + '@local';
fs.writeFileSync(manPath, JSON.stringify(man, null, 2));

// dial.html: early.js first in <head>, probe.js right after js/dial.js (deferred too when dial.js is)
const dialPath = path.join(out, 'dial.html');
let html = fs.readFileSync(dialPath, 'utf8');
const earlyTag = `<script src="${BENCH_DIR}/early.js"></script>`;
if (!/<head[^>]*>/i.test(html)) fail('dial.html has no <head>');
html = html.replace(/<head[^>]*>/i, m => m + earlyTag);
const dialScript = /<script\b[^>]*\bsrc="(?:\.\/)?js\/dial\.js"[^>]*><\/script>/i;
const dialTag = html.match(dialScript);
if (!dialTag) fail('dial.html does not load js/dial.js');
html = html.replace(dialScript, m => m + `<script src="${BENCH_DIR}/probe.js"${/\bdefer\b/i.test(dialTag[0]) ? ' defer' : ''}></script>`);
fs.writeFileSync(dialPath, html);
console.log('built', format, 'bench in', out);
