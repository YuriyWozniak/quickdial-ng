#!/usr/bin/env node
// Runs the Quick Dial NG extension benchmark in a throwaway Firefox profile and prints the results, one JSON line each.
// build.js makes the benchmark copy of the extension, seed.js (its background page) measures, and early.js and
// probe.js time each new tab. See README.md in this folder.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn, spawnSync } = require('child_process');
const { WIN, fail, sleep, parseArgs, defaultFirefox } = require('./lib');

const ROOT = path.resolve(__dirname, '..', '..');
const UPSTREAM = 'b1f76da'; // the original Quick Dial code, for "orig"
const STAGES = ['sync', 'save', 'inline', 'newtab']; // in the order seed.js runs them
const DEFAULTS = { stages: STAGES.join(','), tabs: 12, tabPause: 300, timeout: 150 };
const POLL_MS = 250; // how often to look for the result files

const USAGE = `Usage: node test/bench/run.js [ng|orig] [options]
  ng | orig           benchmark this repo's src/ (default), or the original Quick Dial (git ${UPSTREAM})
  --src <dir>         benchmark this extension folder instead
  --stages <list>     what to measure, comma-separated: ${STAGES.join(', ')} (default: all).
                      Startup (background page load and its storage reads) is always reported.
  --newtab            only new tabs: the same as --stages newtab
  --tabs <n>          new tabs to open (default ${DEFAULTS.tabs}); the first is reported apart, the others as medians
  --tab-pause <ms>    pause after closing each new tab, then until the extension is idle (default ${DEFAULTS.tabPause}).
                      Firefox finishes closing a tab in its main process, which the extension can't see: without
                      the pause, opening the next tab (openToOrigin) measures slower.
  --label <text>      added to the results, to tell runs apart
  --firefox <exe>     Firefox to use (default: QDNG_FIREFOX, then the usual Windows install, then web-ext's choice)
  --web-ext-dir <dir> a folder whose node_modules has web-ext (default: QDNG_WEB_EXT_DIR, release/config.local.json, release/, test/)
  --timeout <s>       give up after this long (default ${DEFAULTS.timeout})
  --headful           show the Firefox window`;

const args = parseArgs(process.argv.slice(2), {
	src: 'string', stages: 'string', newtab: 'bool', tabs: 'int', 'tab-pause': 'int', label: 'string',
	firefox: 'string', 'web-ext-dir': 'string', timeout: 'int', headful: 'bool'
}, USAGE);
const opt = Object.assign({}, DEFAULTS, args);
opt.format = args.positional[0] || 'ng';
if (!['ng', 'orig'].includes(opt.format) || args.positional.length > 1) fail(`Unknown argument ${args.positional.join(' ')}\n\n${USAGE}`);
if (opt.newtab) opt.stages = 'newtab';
opt.stages = opt.stages.split(',').map(s => s.trim()).filter(Boolean);
for (const s of opt.stages) if (!STAGES.includes(s)) fail(`Unknown stage "${s}"; use ${STAGES.join(', ')}`);
if (opt.stages.includes('newtab') && opt.tabs < 1) fail('--tabs needs at least 1 for the newtab stage');

// What seed.js needs to know (bench/config.js)
const benchOptions = {
	stages: opt.stages, tabs: opt.tabs, tabPause: opt.tabPause, label: opt.label || null,
	watchdogMs: Math.max(10, opt.timeout - 10) * 1000 // seed.js reports what it has before run.js gives up
};

// web-ext: the same install the release script uses, unless told otherwise
function webExtBin() {
	const dirs = [opt.webExtDir, process.env.QDNG_WEB_EXT_DIR];
	const cfgPath = path.join(ROOT, 'release', 'config.local.json');
	if (fs.existsSync(cfgPath)) {
		const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
		if (cfg.webExtDir) dirs.push(path.resolve(path.dirname(cfgPath), cfg.webExtDir));
	}
	dirs.push(path.join(ROOT, 'release'), path.join(ROOT, 'test'));
	// Look for node_modules/web-ext the way Node does (require.resolve can't: web-ext doesn't export package.json)
	for (const dir of dirs.filter(Boolean)) {
		for (let d = path.resolve(dir); ; d = path.dirname(d)) {
			const pkgJson = path.join(d, 'node_modules', 'web-ext', 'package.json');
			if (fs.existsSync(pkgJson)) {
				const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
				return path.join(path.dirname(pkgJson), typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['web-ext']);
			}
			if (path.dirname(d) === d) break;
		}
	}
	fail('web-ext not found. Run "npm install" in the release folder, or use --web-ext-dir / QDNG_WEB_EXT_DIR.');
}

function run(cmd, cmdArgs, opts = {}) {
	const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', ...opts });
	if (r.error) fail(`${cmd}: ${r.error.message}`);
	if (r.status !== 0) fail(`${cmd} ${cmdArgs.join(' ')} failed:\n${r.stderr || r.stdout}`);
	return r.stdout;
}

// Firefox preferences for the throwaway profile: results are saved as downloads into `downloads`, nothing asks
function firefoxPrefs(downloads) {
	return ['browser.dom.window.dump.enabled=true', 'devtools.console.stdout.chrome=true', 'devtools.console.stdout.content=true',
		// web-ext writes string prefs into user.js without escaping, so escape the path here
		'browser.download.folderList=2', `browser.download.dir=${JSON.stringify(downloads).slice(1, -1)}`, 'browser.download.useDownloadDir=true',
		'browser.download.always_ask_before_handling_new_types=false', 'browser.download.alwaysOpenPanel=false',
		'browser.shell.checkDefaultBrowser=false', 'browser.startup.homepage_override.mstone=ignore'];
}

// Stops web-ext and the Firefox it started, and nothing else
function stopTree(child, profileHint) {
	if (WIN) {
		spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' });
		// Firefox can outlive its parent; catch a leftover one by its temporary profile
		spawnSync('powershell', ['-NoProfile', '-Command',
			`Get-CimInstance Win32_Process -Filter "Name='firefox.exe'" | Where-Object { $_.CommandLine -match '-profile' -and $_.CommandLine -match [regex]::Escape('${profileHint.replace(/'/g, "''")}') } | ForEach-Object { taskkill /T /F /PID $_.ProcessId | Out-Null }`],
			{ stdio: 'ignore' });
	} else {
		try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
	}
}

// The source folder to benchmark: --src, this repo's src/, or the original code taken from git
function sourceDir(work) {
	if (opt.src) return path.resolve(opt.src);
	if (opt.format !== 'orig') return path.join(ROOT, 'src');
	const up = path.join(work, 'upstream');
	fs.mkdirSync(up);
	run('git', ['-C', ROOT, 'archive', '-o', path.join(up, 'src.tar'), UPSTREAM, 'src']);
	run('tar', ['-xf', 'src.tar'], { cwd: up }); // relative path: Git for Windows' tar misreads "C:\..."
	return path.join(up, 'src');
}

async function main() {
	const bin = webExtBin();
	const work = path.join(os.tmpdir(), 'qdbench-' + opt.format);
	fs.rmSync(work, { recursive: true, force: true });
	fs.mkdirSync(work, { recursive: true });
	run(process.execPath, [path.join(__dirname, 'build.js'), sourceDir(work), path.join(work, 'ext'), opt.format, JSON.stringify(benchOptions)], { stdio: 'inherit' });

	// seed.js saves each result line as a download under qdbench/ in Firefox's download folder
	const downloads = path.join(work, 'downloads'), out = path.join(downloads, 'qdbench');
	fs.mkdirSync(downloads);
	const log = path.join(work, 'run.log');
	const firefox = opt.firefox || defaultFirefox();
	const webExtArgs = [bin, 'run', '--source-dir', path.join(work, 'ext'), '--no-reload', '--no-input', '--verbose',
		...(opt.headful ? [] : ['--arg=-headless']), ...(firefox ? ['--firefox', firefox] : [])];
	for (const p of firefoxPrefs(downloads)) webExtArgs.push('--pref', p);
	const logFd = fs.openSync(log, 'w');
	const child = spawn(process.execPath, webExtArgs, { stdio: ['ignore', logFd, logFd], detached: !WIN, windowsHide: true });
	let exited = false;
	child.on('exit', () => { exited = true; });

	const files = () => fs.existsSync(out) ? fs.readdirSync(out).filter(f => /^qdbench-.*\.txt$/.test(f)).sort() : [];
	const read = f => fs.readFileSync(path.join(out, f), 'utf8');
	const deadline = Date.now() + opt.timeout * 1000;
	while (Date.now() < deadline && !exited) {
		await sleep(POLL_MS);
		if (files().some(f => read(f).includes('QDBENCH {"done":true}'))) break;
	}
	stopTree(child, os.tmpdir());
	fs.closeSync(logFd);

	const lines = [...new Set(files().map(f => (read(f).match(/QDBENCH (\{.*\})/) || [])[1]).filter(Boolean))];
	if (!lines.length) fail(`No results${exited ? ' (web-ext exited early)' : ''}; see ${log}`);
	fs.rmSync(downloads, { recursive: true, force: true });
	console.log(lines.join('\n'));
}

main().catch(e => fail(e.stack || e.message));
