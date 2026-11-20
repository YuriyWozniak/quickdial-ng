#!/usr/bin/env node
// Runs the Quick Dial NG extension benchmark in a throwaway Firefox profile and prints the results, one JSON line each.
// build.js makes the benchmark copy of the extension, seed.js (its background page) measures, and early.js and
// probe.js time each new tab. See README.md in this folder.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn, spawnSync } = require('child_process');
const { IS_WINDOWS, ROOT, FIREFOX_PROCESS, FIREFOX_ENV, SHARED, ARG, fail, sleep, parseArgs, findDefaultFirefox } = require('./lib');

const { FORMATS, STAGE, STAGES } = SHARED;
const UPSTREAM_COMMIT = 'b1f76da'; // the original Quick Dial code, for "orig"
const DEFAULTS = { format: FORMATS.ng, stages: STAGES.join(','), tabs: SHARED.DEFAULT_TABS, tabPause: SHARED.DEFAULT_TAB_PAUSE_MS, timeout: 150 };
const RESULT_POLL_MS = 250; // how often to look for the result files
const REPORT_BEFORE_TIMEOUT_S = 10, MIN_WATCHDOG_S = 10; // seed.js reports what it has this long before run.js gives up
const STAGE_SEPARATOR = ',';

// The work folder (in the system's temporary folder) and what it holds
const WORK_DIR_PREFIX = 'qdbench-';
const WORK = { extension: 'ext', downloads: 'downloads', upstream: 'upstream', upstreamArchive: 'src.tar', log: 'run.log' };
const SOURCE_DIR = 'src'; // the extension's folder in the repository and in the upstream archive

// web-ext: where to look for it, and how to run it
const ENV_WEB_EXT_DIR = 'QDNG_WEB_EXT_DIR';
const RELEASE_DIR = 'release', TEST_DIR = 'test', RELEASE_CONFIG = 'config.local.json'; // the release script's config names webExtDir
const WEB_EXT_PACKAGE = path.join('node_modules', 'web-ext'), WEB_EXT_BIN = 'web-ext', PACKAGE_JSON = 'package.json';
const WEB_EXT_RUN = ['run', '--no-reload', '--no-input', '--verbose'];
const HEADLESS_ARG = '--arg=-headless';

// Firefox preferences for the throwaway profile: nothing asks, the console goes to the log, results are downloaded
const FIREFOX_PREFS = ['browser.dom.window.dump.enabled=true', 'devtools.console.stdout.chrome=true', 'devtools.console.stdout.content=true',
	'browser.download.folderList=2', 'browser.download.useDownloadDir=true',
	'browser.download.always_ask_before_handling_new_types=false', 'browser.download.alwaysOpenPanel=false',
	'browser.shell.checkDefaultBrowser=false', 'browser.startup.homepage_override.mstone=ignore'];
const DOWNLOAD_DIR_PREF = 'browser.download.dir';

const USAGE = `Usage: node test/bench/run.js [${FORMATS.ng}|${FORMATS.orig}] [options]
  ${FORMATS.ng} | ${FORMATS.orig}           benchmark this repo's src/ (default), or the original Quick Dial (git ${UPSTREAM_COMMIT})
  --src <dir>         benchmark this extension folder instead
  --stages <list>     what to measure, comma-separated: ${STAGES.join(', ')} (default: all).
                      Startup (background page load and its storage reads) is always reported.
  --newtab            only new tabs: the same as --stages ${STAGE.newtab}
  --tabs <n>          new tabs to open (default ${DEFAULTS.tabs}); the first is reported apart, the others as medians
  --tab-pause <ms>    pause after closing each new tab, then until the extension is idle (default ${DEFAULTS.tabPause}).
                      Firefox finishes closing a tab in its main process, which the extension can't see: without
                      the pause, opening the next tab (openToOrigin) measures slower.
  --label <text>      added to the results, to tell runs apart
  --firefox <exe>     Firefox to use (default: ${FIREFOX_ENV}, then the usual Windows install, then web-ext's choice)
  --web-ext-dir <dir> a folder whose node_modules has web-ext (default: ${ENV_WEB_EXT_DIR}, ${RELEASE_DIR}/${RELEASE_CONFIG}, ${RELEASE_DIR}/, ${TEST_DIR}/)
  --timeout <s>       give up after this long (default ${DEFAULTS.timeout})
  --headful           show the Firefox window`;

const parsedArgs = parseArgs(process.argv.slice(2), {
	src: ARG.string, stages: ARG.string, newtab: ARG.bool, tabs: ARG.int, 'tab-pause': ARG.int, label: ARG.string,
	firefox: ARG.string, 'web-ext-dir': ARG.string, timeout: ARG.int, headful: ARG.bool
}, USAGE);
const options = Object.assign({}, DEFAULTS, parsedArgs);
options.format = parsedArgs.positional[0] || DEFAULTS.format;
if (!Object.values(FORMATS).includes(options.format) || parsedArgs.positional.length > 1) fail(`Unknown argument ${parsedArgs.positional.join(' ')}\n\n${USAGE}`);
if (options.newtab) options.stages = STAGE.newtab;
options.stages = options.stages.split(STAGE_SEPARATOR).map(stage => stage.trim()).filter(Boolean);
for (const stage of options.stages) if (!STAGES.includes(stage)) fail(`Unknown stage "${stage}"; use ${STAGES.join(', ')}`);
if (options.stages.includes(STAGE.newtab) && options.tabs < 1) fail(`--tabs needs at least 1 for the ${STAGE.newtab} stage`);

// What seed.js needs to know (bench/config.js)
const benchOptions = {
	stages: options.stages, tabs: options.tabs, tabPause: options.tabPause, label: options.label || null,
	watchdogMs: Math.max(MIN_WATCHDOG_S, options.timeout - REPORT_BEFORE_TIMEOUT_S) * 1000
};

// web-ext: the same install the release script uses, unless told otherwise
function findWebExt() {
	const searchDirs = [options.webExtDir, process.env[ENV_WEB_EXT_DIR]];
	const releaseConfigPath = path.join(ROOT, RELEASE_DIR, RELEASE_CONFIG);
	if (fs.existsSync(releaseConfigPath)) {
		const releaseConfig = JSON.parse(fs.readFileSync(releaseConfigPath, 'utf8'));
		if (releaseConfig.webExtDir) searchDirs.push(path.resolve(path.dirname(releaseConfigPath), releaseConfig.webExtDir));
	}
	searchDirs.push(path.join(ROOT, RELEASE_DIR), path.join(ROOT, TEST_DIR));
	// Look for node_modules/web-ext the way Node does (require.resolve can't: web-ext doesn't export package.json)
	for (const searchDir of searchDirs.filter(Boolean)) {
		for (let dir = path.resolve(searchDir); ; dir = path.dirname(dir)) {
			const packageJsonPath = path.join(dir, WEB_EXT_PACKAGE, PACKAGE_JSON);
			if (fs.existsSync(packageJsonPath)) {
				const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
				const binPath = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin[WEB_EXT_BIN];
				return path.join(path.dirname(packageJsonPath), binPath);
			}
			if (path.dirname(dir) === dir) break;
		}
	}
	fail(`web-ext not found. Run "npm install" in the ${RELEASE_DIR} folder, or use --web-ext-dir / ${ENV_WEB_EXT_DIR}.`);
}

function runCommand(command, commandArgs, spawnOptions = {}) {
	const result = spawnSync(command, commandArgs, { encoding: 'utf8', ...spawnOptions });
	if (result.error) fail(`${command}: ${result.error.message}`);
	if (result.status !== 0) fail(`${command} ${commandArgs.join(' ')} failed:\n${result.stderr || result.stdout}`);
	return result.stdout;
}

// Stops web-ext and the Firefox it started, and nothing else
function stopProcessTree(child, profileHint) {
	if (IS_WINDOWS) {
		spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' });
		// Firefox can outlive its parent; catch a leftover one by its temporary profile
		spawnSync('powershell', ['-NoProfile', '-Command',
			`Get-CimInstance Win32_Process -Filter "Name='${FIREFOX_PROCESS}'" | Where-Object { $_.CommandLine -match '-profile' -and $_.CommandLine -match [regex]::Escape('${profileHint.replace(/'/g, "''")}') } | ForEach-Object { taskkill /T /F /PID $_.ProcessId | Out-Null }`],
			{ stdio: 'ignore' });
	} else {
		try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
	}
}

// The source folder to benchmark: --src, this repo's src/, or the original code taken from git
function resolveSourceDir(workDir) {
	if (options.src) return path.resolve(options.src);
	if (options.format !== FORMATS.orig) return path.join(ROOT, SOURCE_DIR);
	const upstreamDir = path.join(workDir, WORK.upstream);
	fs.mkdirSync(upstreamDir);
	runCommand('git', ['-C', ROOT, 'archive', '-o', path.join(upstreamDir, WORK.upstreamArchive), UPSTREAM_COMMIT, SOURCE_DIR]);
	runCommand('tar', ['-xf', WORK.upstreamArchive], { cwd: upstreamDir }); // relative path: Git for Windows' tar misreads "C:\..."
	return path.join(upstreamDir, SOURCE_DIR);
}

async function main() {
	const webExtPath = findWebExt();
	const workDir = path.join(os.tmpdir(), WORK_DIR_PREFIX + options.format);
	fs.rmSync(workDir, { recursive: true, force: true });
	fs.mkdirSync(workDir, { recursive: true });
	const extensionDir = path.join(workDir, WORK.extension);
	runCommand(process.execPath, [path.join(__dirname, 'build.js'), resolveSourceDir(workDir), extensionDir, options.format, JSON.stringify(benchOptions)], { stdio: 'inherit' });

	// seed.js saves each result line as a download under qdbench/ in Firefox's download folder
	const downloadsDir = path.join(workDir, WORK.downloads), resultsDir = path.join(downloadsDir, SHARED.RESULTS_DIR);
	fs.mkdirSync(downloadsDir);
	const logPath = path.join(workDir, WORK.log);
	const firefoxPath = options.firefox || findDefaultFirefox();
	const webExtArgs = [webExtPath, ...WEB_EXT_RUN, '--source-dir', extensionDir,
		...(options.headful ? [] : [HEADLESS_ARG]), ...(firefoxPath ? ['--firefox', firefoxPath] : [])];
	// web-ext writes string prefs into user.js without escaping, so escape the path here
	const downloadDirPref = `${DOWNLOAD_DIR_PREF}=${JSON.stringify(downloadsDir).slice(1, -1)}`;
	for (const pref of [...FIREFOX_PREFS, downloadDirPref]) webExtArgs.push('--pref', pref);
	const logFile = fs.openSync(logPath, 'w');
	const webExt = spawn(process.execPath, webExtArgs, { stdio: ['ignore', logFile, logFile], detached: !IS_WINDOWS, windowsHide: true });
	let webExtExited = false;
	webExt.on('exit', () => { webExtExited = true; });

	const isResultFile = name => name.startsWith(SHARED.RESULT_FILE_PREFIX) && name.endsWith(SHARED.RESULT_FILE_EXTENSION);
	const listResultFiles = () => fs.existsSync(resultsDir) ? fs.readdirSync(resultsDir).filter(isResultFile).sort() : [];
	const readResultFile = name => fs.readFileSync(path.join(resultsDir, name), 'utf8');
	const doneLine = SHARED.RESULT_PREFIX + JSON.stringify(SHARED.DONE);
	const deadline = Date.now() + options.timeout * 1000;
	while (Date.now() < deadline && !webExtExited) {
		await sleep(RESULT_POLL_MS);
		if (listResultFiles().some(name => readResultFile(name).includes(doneLine))) break;
	}
	stopProcessTree(webExt, os.tmpdir());
	fs.closeSync(logFile);

	const findResultLine = name => readResultFile(name).split(/\r?\n/).find(line => line.startsWith(SHARED.RESULT_PREFIX));
	const results = [...new Set(listResultFiles().map(findResultLine).filter(Boolean).map(line => line.slice(SHARED.RESULT_PREFIX.length)))];
	if (!results.length) fail(`No results${webExtExited ? ' (web-ext exited early)' : ''}; see ${logPath}`);
	fs.rmSync(downloadsDir, { recursive: true, force: true });
	console.log(results.join('\n'));
}

main().catch(e => fail(e.stack || e.message));
