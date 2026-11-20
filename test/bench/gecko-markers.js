// Lists the Firefox Profiler markers that match a pattern, on one timeline (ms since the parent process started).
'use strict';
const fs = require('fs');
const { fail, parseArgs, ARG } = require('./lib');

const USAGE = `Usage: node gecko-markers.js <profile.json> [regex] [options]
  regex              markers whose name or data match it, case-insensitive (default: all)
  --exclude <regex>  leave out the markers that match this
  --names            count marker names per thread instead of listing them
  --threads          list the threads first, with when each was registered`;
const MATCH_ALL = '.', REGEX_FLAGS = 'i';
const PHASE = { instant: 0, interval: 1, intervalStart: 2, intervalEnd: 3 }; // a marker's phase in the profile format
const PHASE_LABELS = { [PHASE.intervalStart]: 'start', [PHASE.intervalEnd]: 'end' };
const STRING_FIELD_FORMAT = 'unique-string'; // a payload field stored as a string-table index
const TEXT_MARKER = 'Text'; // its name field is a string-table index too
const PARENT_PROCESS = 'parent';
const DATA_WIDTH = 220, THREAD_WIDTH = 34, TIME_WIDTH = 9, DURATION_WIDTH = 8, COUNT_WIDTH = 6, TIME_DIGITS = 1;

const parsedArgs = parseArgs(process.argv.slice(2), { exclude: ARG.string, names: ARG.bool, threads: ARG.bool }, USAGE);
const [profilePath, pattern] = parsedArgs.positional;
if (!profilePath) fail(USAGE);
const includePattern = new RegExp(pattern || MATCH_ALL, REGEX_FLAGS);
const excludePattern = parsedArgs.exclude ? new RegExp(parsedArgs.exclude, REGEX_FLAGS) : null;
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const baseTime = profile.meta.startTime; // epoch ms of the parent process profile start

// The payload fields each marker type stores as string-table indexes
const stringFields = {};
for (const schema of profile.meta.markerSchema || []) {
	for (const field of (schema.fields || schema.data || [])) {
		if (field.format === STRING_FIELD_FORMAT) (stringFields[schema.name] = stringFields[schema.name] || []).push(field.key);
	}
}
function resolveStrings(data, stringTable) {
	if (!data || !data.type) return data;
	const keys = (stringFields[data.type] || []).concat(data.type === TEXT_MARKER ? ['name'] : []);
	let resolved = data;
	for (const key of keys) {
		if (typeof data[key] !== 'number' || stringTable[data[key]] == null) continue;
		if (resolved === data) resolved = Object.assign({}, data);
		resolved[key] = stringTable[data[key]];
	}
	return resolved;
}

const rows = [], nameCounts = {};
function collectMarkers(processProfile, processName) {
	const offset = processProfile.meta.startTime - baseTime;
	for (const thread of processProfile.threads || []) {
		const threadLabel = `${thread.processName || processName || thread.processType}/${thread.name}#${thread.pid}`;
		if (parsedArgs.threads) console.log('thread', threadLabel, 'registered', (thread.registerTime + offset).toFixed(TIME_DIGITS));
		const markers = thread.markers, schema = markers.schema, stringTable = thread.stringTable;
		for (const marker of markers.data) {
			const name = stringTable[marker[schema.name]] || '';
			const data = resolveStrings(marker[schema.data], stringTable);
			const text = name + ' ' + (data ? JSON.stringify(data) : '');
			if (!includePattern.test(text) || (excludePattern && excludePattern.test(text))) continue;
			if (parsedArgs.names) {
				const key = threadLabel.replace(/#\d+$/, '') + ' | ' + name;
				nameCounts[key] = (nameCounts[key] || 0) + 1;
				continue;
			}
			const start = marker[schema.startTime], end = marker[schema.endTime], phase = marker[schema.phase];
			rows.push({
				time: (phase === PHASE.intervalEnd ? end : start) + offset, duration: phase === PHASE.interval ? end - start : null, phase,
				thread: threadLabel, name, data: data ? JSON.stringify(data).slice(0, DATA_WIDTH) : ''
			});
		}
	}
	for (const subprocess of processProfile.processes || []) collectMarkers(subprocess, null);
}
collectMarkers(profile, PARENT_PROCESS);

if (parsedArgs.names) {
	for (const [key, count] of Object.entries(nameCounts).sort((a, b) => b[1] - a[1])) console.log(String(count).padStart(COUNT_WIDTH), key);
	process.exit(0);
}
rows.sort((a, b) => a.time - b.time);
for (const row of rows) {
	const duration = row.duration != null ? row.duration.toFixed(TIME_DIGITS) : PHASE_LABELS[row.phase] || '';
	console.log(row.time.toFixed(TIME_DIGITS).padStart(TIME_WIDTH), duration.padStart(DURATION_WIDTH), row.thread.padEnd(THREAD_WIDTH).slice(0, THREAD_WIDTH), row.name, row.data);
}
