// Shared parts of the benchmark tools that run in Node (run.js, build.js, startup.js, startup-report.js,
// gecko-markers.js): the names and defaults they agree on, command-line arguments, timing, statistics and Firefox.
'use strict';
const fs = require('fs'), path = require('path');

const IS_WINDOWS = process.platform === 'win32';
const WINDOWS_FIREFOX = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
const FIREFOX_PROCESS = 'firefox.exe'; // the process name on Windows
const FIREFOX_ENV = 'QDNG_FIREFOX'; // environment variable naming the Firefox to use
const ROOT = path.resolve(__dirname, '..', '..'); // the repository
const MANIFEST_PATH = path.join(ROOT, 'src', 'manifest.json');

// What the Node tools and the scripts inside the benchmark copy of the extension (seed.js, probe.js) agree on.
// build.js writes it into the copy as bench/shared.js (BENCH_SHARED), because those scripts can't require() this file.
const STAGE = Object.freeze({ sync: 'sync', save: 'save', inline: 'inline', newtab: 'newtab' }); // what seed.js can measure, in the order it runs them
const SHARED = Object.freeze({
	BENCH_DIR: 'bench', // the benchmark's own files inside the copy
	FORMATS: Object.freeze({ ng: 'ng', orig: 'orig' }), // this repo's code, or the original Quick Dial
	STAGE,
	STAGES: Object.freeze(Object.values(STAGE)),
	DEFAULT_TABS: 12, // new tabs to open
	DEFAULT_TAB_PAUSE_MS: 300, // pause after closing a new tab (see README.md)
	RESULTS_DIR: 'qdbench', // seed.js saves its result lines as downloads into this folder
	RESULT_FILE_PREFIX: 'qdbench-',
	RESULT_FILE_EXTENSION: '.txt',
	RESULT_PREFIX: 'QDBENCH ', // each result line, in the console and in the files
	PROGRESS_PREFIX: 'QDBENCH-progress ', // console progress lines (not results)
	DONE: Object.freeze({ done: true }), // the last result line
	DIAL_MESSAGE: 'benchDial', // probe.js sends a new tab's times to seed.js in a message with this key
	RUN_PARAM: 'bench', // dial.html?bench=<n>: the new tab's number
	TILES_PARAM: 'tiles', // dial.html?tiles=<n>: the tile pictures probe.js waits for
	TIME_DIGITS: 1 // decimals of the times reported (ms)
});

// Argument types for parseArgs
const ARG = Object.freeze({ string: 'string', int: 'int', bool: 'bool' });
const OPTION_PREFIX = '--', HELP_ARGS = ['-h', '--help'];

function fail(message) {
	console.error('Error: ' + message);
	process.exit(1);
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Median of the finite numbers in a list (the mean of the middle two for an even count); null when there are none
function computeMedian(list) {
	const values = list.filter(x => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
	if (!values.length) return null;
	const middle = values.length >> 1;
	return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

/**
 * Reads command-line arguments. spec lists the --options and their ARG type: { 'tab-pause': ARG.int, label: ARG.string }.
 * Returns { positional: [...] } plus each option given, named in camelCase (--tab-pause -> tabPause).
 * -h / --help prints usage and exits; an unknown option or a missing or invalid value stops with an error.
 */
function parseArgs(argv, spec, usage) {
	const parsed = { positional: [] };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (HELP_ARGS.includes(arg)) {
			console.log(usage);
			process.exit(0);
		}
		if (!arg.startsWith(OPTION_PREFIX)) {
			parsed.positional.push(arg);
			continue;
		}
		const name = arg.slice(OPTION_PREFIX.length), type = spec[name];
		if (!type) fail(`Unknown option ${arg}\n\n${usage}`);
		const key = name.replace(/-(\w)/g, (match, letter) => letter.toUpperCase());
		if (type === ARG.bool) {
			parsed[key] = true;
			continue;
		}
		if (i + 1 >= argv.length) fail(`${arg} needs a value`);
		const value = argv[++i];
		if (type === ARG.int) {
			const number = Number(value);
			if (!Number.isInteger(number) || number < 0) fail(`${arg} needs a whole number, not "${value}"`);
			parsed[key] = number;
		} else parsed[key] = value;
	}
	return parsed;
}

// Firefox to use when none is named: QDNG_FIREFOX, then the usual Windows install; null lets web-ext find one
function findDefaultFirefox() {
	return process.env[FIREFOX_ENV] || (IS_WINDOWS && fs.existsSync(WINDOWS_FIREFOX) ? WINDOWS_FIREFOX : null);
}

// Quick Dial NG's add-on id, from its manifest
function readExtensionId() {
	return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).browser_specific_settings.gecko.id;
}

// A time in ms, rounded as reported
const roundTime = ms => +ms.toFixed(SHARED.TIME_DIGITS);

module.exports = {
	IS_WINDOWS, ROOT, FIREFOX_PROCESS, FIREFOX_ENV, SHARED, ARG,
	fail, sleep, computeMedian, parseArgs, findDefaultFirefox, readExtensionId, roundTime
};
