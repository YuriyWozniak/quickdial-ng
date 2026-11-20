// Lists the Firefox Profiler markers that match a pattern, on one timeline (ms since the parent process started).
'use strict';
const { fail, parseArgs, ARG } = require('./lib');
const { PHASE, readGeckoProfile, forEachMarker } = require('./gecko-profile');

const USAGE = `Usage: node gecko-markers.js <profile.json> [regex] [options]
  regex              markers whose name or data match it, case-insensitive (default: all)
  --exclude <regex>  leave out the markers that match this
  --names            count marker names per thread instead of listing them
  --threads          list the threads first, with when each was registered`;
const MATCH_ALL = '.', REGEX_FLAGS = 'i';
const PHASE_LABELS = { [PHASE.intervalStart]: 'start', [PHASE.intervalEnd]: 'end' };
const DATA_WIDTH = 220, THREAD_WIDTH = 34, TIME_WIDTH = 9, DURATION_WIDTH = 8, COUNT_WIDTH = 6, TIME_DIGITS = 1;

const parsedArgs = parseArgs(process.argv.slice(2), { exclude: ARG.string, names: ARG.bool, threads: ARG.bool }, USAGE);
const [profilePath, pattern] = parsedArgs.positional;
if (!profilePath) fail(USAGE);
const includePattern = new RegExp(pattern || MATCH_ALL, REGEX_FLAGS);
const excludePattern = parsedArgs.exclude ? new RegExp(parsedArgs.exclude, REGEX_FLAGS) : null;

const rows = [], nameCounts = {};
let threadLabel = '';
forEachMarker(readGeckoProfile(profilePath), marker => {
	const text = marker.name + ' ' + (marker.data ? JSON.stringify(marker.data) : '');
	if (!includePattern.test(text) || (excludePattern && excludePattern.test(text))) return;
	if (parsedArgs.names) {
		const key = threadLabel.replace(/#\d+$/, '') + ' | ' + marker.name;
		nameCounts[key] = (nameCounts[key] || 0) + 1;
		return;
	}
	rows.push({
		time: marker.time, duration: marker.phase === PHASE.interval ? marker.end - marker.start : null, phase: marker.phase,
		thread: threadLabel, name: marker.name, data: marker.data ? JSON.stringify(marker.data).slice(0, DATA_WIDTH) : ''
	});
}, (thread, processName, offset) => {
	threadLabel = `${processName}/${thread.name}#${thread.pid}`;
	if (parsedArgs.threads) console.log('thread', threadLabel, 'registered', (thread.registerTime + offset).toFixed(TIME_DIGITS));
});

if (parsedArgs.names) {
	for (const [key, count] of Object.entries(nameCounts).sort((a, b) => b[1] - a[1])) console.log(String(count).padStart(COUNT_WIDTH), key);
	process.exit(0);
}
rows.sort((a, b) => a.time - b.time);
for (const row of rows) {
	const duration = row.duration != null ? row.duration.toFixed(TIME_DIGITS) : PHASE_LABELS[row.phase] || '';
	console.log(row.time.toFixed(TIME_DIGITS).padStart(TIME_WIDTH), duration.padStart(DURATION_WIDTH), row.thread.padEnd(THREAD_WIDTH).slice(0, THREAD_WIDTH), row.name, row.data);
}
