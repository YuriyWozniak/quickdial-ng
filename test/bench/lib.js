// Shared helpers of the benchmark tools that run in Node (run.js, startup.js, startup-report.js, gecko-markers.js):
// command-line arguments, timing, statistics and where Firefox is.
'use strict';
const fs = require('fs');

const WIN = process.platform === 'win32';
const WIN_FIREFOX = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';

function fail(msg) {
	console.error('Error: ' + msg);
	process.exit(1);
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Median of the finite numbers in a list (the mean of the middle two for an even count); null when there are none
function median(list) {
	const v = list.filter(x => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
	if (!v.length) return null;
	const m = v.length >> 1;
	return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Reads command-line arguments. spec lists the --options: { 'tab-pause': 'int', label: 'string', headful: 'bool' }.
 * Returns { positional: [...] } plus each option given, named in camelCase (--tab-pause -> tabPause).
 * -h / --help prints usage and exits; an unknown option or a missing or invalid value stops with an error.
 */
function parseArgs(argv, spec, usage) {
	const out = { positional: [] };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '-h' || arg === '--help') {
			console.log(usage);
			process.exit(0);
		}
		if (!arg.startsWith('--')) {
			out.positional.push(arg);
			continue;
		}
		const name = arg.slice(2), type = spec[name];
		if (!type) fail(`Unknown option ${arg}\n\n${usage}`);
		const key = name.replace(/-(\w)/g, (m, c) => c.toUpperCase());
		if (type === 'bool') {
			out[key] = true;
			continue;
		}
		if (i + 1 >= argv.length) fail(`${arg} needs a value`);
		const value = argv[++i];
		if (type === 'int') {
			const n = Number(value);
			if (!Number.isInteger(n) || n < 0) fail(`${arg} needs a whole number, not "${value}"`);
			out[key] = n;
		} else out[key] = value;
	}
	return out;
}

// Firefox to use when none is named: QDNG_FIREFOX, then the usual Windows install; null lets web-ext find one
function defaultFirefox() {
	return process.env.QDNG_FIREFOX || (WIN && fs.existsSync(WIN_FIREFOX) ? WIN_FIREFOX : null);
}

module.exports = { WIN, fail, sleep, median, parseArgs, defaultFirefox };
