#!/usr/bin/env node
// Runs the Quick Dial NG benchmark in a throwaway headless Firefox profile and prints the results.
// See README.md in this folder.
// Usage: node test/bench/run.js [ng|orig] [--src <dir>] [--firefox <exe>] [--web-ext-dir <dir>] [--timeout <seconds>]
//   ng   = this repo's src (per-tile image keys)
//   orig = the original Quick Dial code (git b1f76da, images inline in one record)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const UPSTREAM = 'b1f76da';
const WIN = process.platform === 'win32';

function fail(msg) { console.error('Error: ' + msg); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- arguments ----------
const opt = { format: 'ng', timeout: 150 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
	const v = argv[i];
	if (v === 'ng' || v === 'orig') opt.format = v;
	else if (/^--(src|firefox|web-ext-dir|timeout)$/.test(v)) {
		if (i + 1 >= argv.length) fail(`${v} needs a value`);
		opt[v.slice(2)] = argv[++i];
	} else if (v === '-h' || v === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 6).join('\n').replace(/^\/\/ ?/gm, '')); process.exit(0); }
	else fail(`Unknown argument ${v}`);
}

// Firefox: --firefox, QDNG_FIREFOX, the usual Windows install, or whatever web-ext finds by itself.
const WIN_FIREFOX = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
const firefox = opt.firefox || process.env.QDNG_FIREFOX || (WIN && fs.existsSync(WIN_FIREFOX) ? WIN_FIREFOX : null);

// web-ext: the same install the release script uses, unless told otherwise.
function webExtBin() {
	const dirs = [opt['web-ext-dir'], process.env.QDNG_WEB_EXT_DIR];
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

function run(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
	if (r.error) fail(`${cmd}: ${r.error.message}`);
	if (r.status !== 0) fail(`${cmd} ${args.join(' ')} failed:\n${r.stderr || r.stdout}`);
	return r.stdout;
}

// Stops web-ext and the Firefox it started, and nothing else.
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

async function main() {
	const bin = webExtBin();
	const work = path.join(os.tmpdir(), 'qdbench-' + opt.format);
	fs.rmSync(work, { recursive: true, force: true });
	fs.mkdirSync(work, { recursive: true });

	let src = opt.src && path.resolve(opt.src);
	if (!src && opt.format === 'orig') {
		const up = path.join(work, 'upstream');
		fs.mkdirSync(up);
		run('git', ['-C', ROOT, 'archive', '-o', path.join(up, 'src.tar'), UPSTREAM, 'src']);
		run('tar', ['-xf', 'src.tar'], { cwd: up }); // relative path: Git for Windows' tar misreads "C:\..."
		src = path.join(up, 'src');
	}
	src = src || path.join(ROOT, 'src');
	run(process.execPath, [path.join(__dirname, 'build.js'), src, path.join(work, 'ext'), opt.format], { stdio: 'inherit' });

	// seed.js saves each result line as a download under qdbench/ in Firefox's download folder
	const downloads = path.join(work, 'downloads'), out = path.join(downloads, 'qdbench');
	fs.mkdirSync(downloads);
	const log = path.join(work, 'run.log');
	const args = [bin, 'run', '--source-dir', path.join(work, 'ext'), '--no-reload', '--no-input', '--verbose', '--arg=-headless',
		...(firefox ? ['--firefox', firefox] : [])];
	for (const p of ['browser.dom.window.dump.enabled=true', 'devtools.console.stdout.chrome=true', 'devtools.console.stdout.content=true',
		// web-ext writes string prefs into user.js without escaping, so escape the path here
		'browser.download.folderList=2', `browser.download.dir=${JSON.stringify(downloads).slice(1, -1)}`, 'browser.download.useDownloadDir=true',
		'browser.download.always_ask_before_handling_new_types=false', 'browser.download.alwaysOpenPanel=false',
		'browser.shell.checkDefaultBrowser=false', 'browser.startup.homepage_override.mstone=ignore'])
		args.push('--pref', p);
	const logFd = fs.openSync(log, 'w');
	const child = spawn(process.execPath, args, { stdio: ['ignore', logFd, logFd], detached: !WIN, windowsHide: true });
	let exited = false;
	child.on('exit', () => { exited = true; });

	const files = () => fs.existsSync(out) ? fs.readdirSync(out).filter(f => /^qdbench-.*\.txt$/.test(f)).sort() : [];
	const read = f => fs.readFileSync(path.join(out, f), 'utf8');
	const deadline = Date.now() + opt.timeout * 1000;
	while (Date.now() < deadline && !exited) {
		await sleep(2000);
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
