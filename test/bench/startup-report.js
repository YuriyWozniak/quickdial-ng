// Summarizes startup.js results: medians per results file (one label each), warm-up launches excluded.
// Usage: node startup-report.js <results.jsonl> [more.jsonl ...]
'use strict';
const fs = require('fs');
const { fail, median, parseArgs } = require('./lib');

const USAGE = 'Usage: node startup-report.js <results.jsonl> [more.jsonl ...]';
const LABEL_WIDTH = 32, ID_WIDTH = 38, NUMBER_WIDTH = 5;
// Firefox's per-extension timings, cumulative across launches of a profile: [total ms, count]
const EXT_TIMINGS = { startup: 'startup', bgLoad: 'background page load', idbGet: 'storage.local reads (total)' };

const files = parseArgs(process.argv.slice(2), {}, USAGE).positional;
if (!files.length) fail(USAGE);
const fmt = x => x == null ? '-' : String(Math.round(x));
const line = (label, value, note) => console.log(label.padEnd(LABEL_WIDTH), fmt(value), note || '');

// Per-launch extension timings from the cumulative pairs of consecutive launches
function extensionTimings(rows) {
	const perRun = {};
	for (let i = 1; i < rows.length; i++) {
		if (rows[i].warmup) continue;
		const cur = rows[i].extTimings || {}, prev = rows[i - 1].extTimings || {};
		for (const id in cur) for (const k in cur[id]) {
			const [s1, c1] = cur[id][k], [s0, c0] = (prev[id] && prev[id][k]) || [0, 0];
			if (c1 > c0) ((perRun[id] = perRun[id] || {})[k] = perRun[id][k] || []).push(k === 'idbGet' ? s1 - s0 : (s1 - s0) / (c1 - c0));
		}
	}
	return perRun;
}

for (const file of files) {
	const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)).filter(r => !r.done);
	if (!rows.length) continue;
	const label = rows[0].label, runs = rows.filter(r => !r.warmup && !r.error);
	const pick = f => median(runs.map(r => { try { return f(r); } catch (e) { return null; } }));
	const later = f => median(runs.flatMap(r => (r.newTabsLater || []).map(t => { try { return f(t); } catch (e) { return null; } })));
	console.log(`\n== ${label}: ${runs.length} launches (warm-up excluded)`);
	line('Firefox window first paint', pick(r => r.startup.firstPaint2 || r.startup.firstPaint), 'ms after process start');
	line('Session restored', pick(r => r.startup.sessionRestored));
	line('Start tab: page load began', pick(r => r.startTab.timeOriginSinceProcess), (runs[0].startTab || {}).url || '');
	line('Start tab: page painted', pick(r => r.startTab.paintedSinceProcess));
	line('New tab: open to page load', pick(r => r.newTab.openToTimeOriginMs), 'ms; the rest is since the page started loading');
	line('New tab: first contentful paint', pick(r => r.newTab.paint['first-contentful-paint']), (runs[0].newTab || {}).url || '');
	line('New tab: pictures set', pick(r => r.newTab.imagesSet));
	if (runs.some(r => r.newTabsLater)) {
		line('Later new tabs: open to load', later(t => t.openToTimeOriginMs), 'ms (median of every new tab after the first)');
		line('Later new tabs: first paint', later(t => t.paint['first-contentful-paint']));
		line('Later new tabs: pictures set', later(t => t.imagesSet));
	}
	const perRun = extensionTimings(rows);
	console.log('Per extension (median per launch, ms): ' + Object.values(EXT_TIMINGS).join(' | '));
	const ids = Object.keys(perRun).sort((a, b) => (median(perRun[b].bgLoad || []) || 0) - (median(perRun[a].bgLoad || []) || 0));
	for (const id of ids) {
		const e = perRun[id];
		console.log('  ' + id.padEnd(ID_WIDTH), Object.keys(EXT_TIMINGS).map(k => fmt(median(e[k] || [])).padStart(NUMBER_WIDTH)).join(' | '));
	}
}
