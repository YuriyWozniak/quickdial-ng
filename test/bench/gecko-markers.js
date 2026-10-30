// List Firefox Profiler markers that match a pattern, on one timeline (ms since the parent process started).
// Usage: node gecko-markers.js <profile.json> <regex> [--threads]
'use strict';
const fs = require('fs');
const [file, pattern, ...flags] = process.argv.slice(2);
const re = new RegExp(pattern || '.', 'i');
const prof = JSON.parse(fs.readFileSync(file, 'utf8'));
const base = prof.meta.startTime; // epoch ms of the parent process profile start
let procStart = null;
const rows = [];

function walk(p, procName) {
	const off = p.meta.startTime - base;
	for (const t of p.threads || []) {
		const label = `${t.processName || procName || t.processType}/${t.name}#${t.pid}`;
		if (flags.includes('--threads')) console.log('thread', label, 'registered', (t.registerTime + off).toFixed(1));
		const m = t.markers, s = m.schema, st = t.stringTable;
		for (const d of m.data) {
			const name = st[d[s.name]] || '';
			const data = d[s.data];
			const txt = name + ' ' + (data ? JSON.stringify(data) : '');
			if (!re.test(txt)) continue;
			const start = d[s.startTime], end = d[s.endTime];
			rows.push({ t: (start != null ? start : end) + off, dur: start != null && end != null ? end - start : null, thread: label, name, data: data ? JSON.stringify(data).slice(0, 220) : '' });
		}
	}
	for (const sp of p.processes || []) walk(sp, null);
}
walk(prof, 'parent');
rows.sort((a, b) => a.t - b.t);
for (const r of rows) console.log(r.t.toFixed(1).padStart(9), (r.dur != null ? r.dur.toFixed(1) : '').padStart(8), r.thread.padEnd(34).slice(0, 34), r.name, r.data);
