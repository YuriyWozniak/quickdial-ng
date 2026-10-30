// Summarize startup.js results: medians per label, warm-up launches excluded.
// Usage: node startup-report.js <results.jsonl> [more.jsonl ...]
'use strict';
const fs = require('fs');
const med = a => { const v = a.filter(x => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const fmt = x => x == null ? '-' : Math.round(x) + '';

for (const file of process.argv.slice(2)) {
	const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)).filter(r => !r.done);
	if (!rows.length) continue;
	const label = rows[0].label, runs = rows.filter(r => !r.warmup && !r.error);
	// per-launch extension timings from cumulative [total, count] pairs
	const extPerRun = {};
	for (let i = 1; i < rows.length; i++) {
		if (rows[i].warmup) continue;
		const cur = rows[i].extTimings || {}, prev = rows[i - 1].extTimings || {};
		for (const id in cur) for (const k in cur[id]) {
			const [s1, c1] = cur[id][k], [s0, c0] = (prev[id] && prev[id][k]) || [0, 0];
			if (c1 > c0) (((extPerRun[id] = extPerRun[id] || {})[k] = extPerRun[id][k] || [])).push(k === 'idbGet' ? s1 - s0 : (s1 - s0) / (c1 - c0));
		}
	}
	const pick = f => med(runs.map(r => { try { return f(r); } catch (e) { return null; } }));
	console.log(`\n== ${label}: ${runs.length} launches (warm-up excluded)`);
	console.log('Firefox window first paint     ', fmt(pick(r => r.startup.firstPaint2 || r.startup.firstPaint)), 'ms after process start');
	console.log('Session restored               ', fmt(pick(r => r.startup.sessionRestored)));
	console.log('Start tab: page load began     ', fmt(pick(r => r.startTab.timeOriginSinceProcess)), ' ', (runs[0].startTab || {}).url || '');
	console.log('Start tab: page painted        ', fmt(pick(r => r.startTab.paintedSinceProcess)));
	console.log('New tab: pictures set          ', fmt(pick(r => r.newTab.imagesSet)), 'ms after the tab started loading');
	console.log('New tab: first contentful paint', fmt(pick(r => r.newTab.paint['first-contentful-paint'])), ' ', (runs[0].newTab || {}).url || '');
	console.log('Per extension (median per launch, ms): startup | background page load | storage.local reads (total)');
	const ids = Object.keys(extPerRun).sort((a, b) => (med((extPerRun[b].bgLoad) || []) || 0) - (med((extPerRun[a].bgLoad) || []) || 0));
	for (const id of ids) {
		const e = extPerRun[id];
		console.log('  ' + id.padEnd(38), fmt(med(e.startup || [])).padStart(5), '|', fmt(med(e.bgLoad || [])).padStart(5), '|', fmt(med(e.idbGet || [])).padStart(5));
	}
}
