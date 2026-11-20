// Reads a Firefox Profiler recording (the raw format Firefox saves, as startup.js --gecko-profile writes it) for
// gecko-markers.js and newtab-phases.js: the markers of every thread in every process, on one timeline.
'use strict';
const fs = require('fs');

const PHASE = Object.freeze({ instant: 0, interval: 1, intervalStart: 2, intervalEnd: 3 }); // a marker's phase in the profile format
const STRING_FIELD_FORMAT = 'unique-string'; // a payload field stored as a string-table index
const TEXT_MARKER = 'Text'; // its name field is a string-table index too
const PARENT_PROCESS = 'Parent Process'; // the parent's threads carry no process name; child processes name theirs

function readGeckoProfile(profilePath) {
	return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
}

// The payload fields each marker type stores as string-table indexes
function findStringFields(profile) {
	const stringFields = {};
	for (const schema of profile.meta.markerSchema || []) {
		for (const field of (schema.fields || schema.data || [])) {
			if (field.format === STRING_FIELD_FORMAT) (stringFields[schema.name] = stringFields[schema.name] || []).push(field.key);
		}
	}
	return stringFields;
}

function resolveStrings(data, stringTable, stringFields) {
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

/**
 * Calls onThread(thread, processName, offset) for each thread, then onMarker(marker) for each of its markers.
 * offset moves a thread's times onto the parent process's timeline (ms since its profile started). A marker is
 * { name, data, phase, start, end, time }: data has its strings resolved, and time is when it happened (the end
 * for an interval's end marker, otherwise the start).
 */
function forEachMarker(profile, onMarker, onThread) {
	const baseTime = profile.meta.startTime, stringFields = findStringFields(profile);
	(function visitProcess(processProfile) {
		const offset = processProfile.meta.startTime - baseTime;
		for (const thread of processProfile.threads || []) {
			const processName = processProfile === profile ? PARENT_PROCESS : thread.processName || thread.processType;
			if (onThread && onThread(thread, processName, offset) === false) continue;
			const schema = thread.markers.schema, stringTable = thread.stringTable;
			for (const row of thread.markers.data) {
				const phase = row[schema.phase], start = row[schema.startTime] + offset, end = row[schema.endTime] + offset;
				onMarker({
					name: stringTable[row[schema.name]] || '', data: resolveStrings(row[schema.data], stringTable, stringFields),
					phase, start, end, time: phase === PHASE.intervalEnd ? end : start
				});
			}
		}
		for (const subprocess of processProfile.processes || []) visitProcess(subprocess);
	})(profile);
}

module.exports = { PHASE, PARENT_PROCESS, readGeckoProfile, forEachMarker };
