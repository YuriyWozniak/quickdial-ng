// Lists the Firefox Profiler markers that match a pattern, on one timeline (ms since the parent process started).
'use strict';
const fs = require('fs');
const { fail, parseArgs } = require('./lib');

const USAGE = `Usage: node gecko-markers.js <profile.json> [regex] [options]
  regex              markers whose name or data match it, case-insensitive (default: all)
  --exclude <regex>  leave out the markers that match this
  --names            count marker names per thread instead of listing them
  --threads          list the threads first, with when each was registered`;
const DATA_WIDTH = 220, THREAD_WIDTH = 34;

const args = parseArgs(process.argv.slice(2), { exclude: 'string', names: 'bool', threads: 'bool' }, USAGE);
const [file, pattern] = args.positional;
if (!file) fail(USAGE);
const re = new RegExp(pattern || '.', 'i');
const ex = args.exclude ? new RegExp(args.exclude, 'i') : null;
const names = {};
const prof = JSON.parse(fs.readFileSync(file, 'utf8'));
const base = prof.meta.startTime; // epoch ms of the parent process profile start
// marker payload fields stored as string-table indexes
const uniq = {};
for (const sc of prof.meta.markerSchema || []) for (const f of (sc.fields || sc.data || [])) if (f.format === 'unique-string') (uniq[sc.name] = uniq[sc.name] || []).push(f.key);
function resolve(data, st) {
	if (!data || !data.type) return data;
	const keys = (uniq[data.type] || []).concat(data.type === 'Text' ? ['name'] : []);
	let out = data;
	for (const k of keys) if (typeof data[k] === 'number' && st[data[k]] != null) { if (out === data) out = Object.assign({}, data); out[k] = st[data[k]]; }
	return out;
}
const rows = [];

function walk(p, procName) {
	const off = p.meta.startTime - base;
	for (const t of p.threads || []) {
		const label = `${t.processName || procName || t.processType}/${t.name}#${t.pid}`;
		if (args.threads) console.log('thread', label, 'registered', (t.registerTime + off).toFixed(1));
		const m = t.markers, s = m.schema, st = t.stringTable;
		for (const d of m.data) {
			const name = st[d[s.name]] || '';
			const data = resolve(d[s.data], st);
			const txt = name + ' ' + (data ? JSON.stringify(data) : '');
			if (!re.test(txt) || (ex && ex.test(txt))) continue;
			if (args.names) { const k = label.replace(/#\d+$/, '') + ' | ' + name; names[k] = (names[k] || 0) + 1; continue; }
			const start = d[s.startTime], end = d[s.endTime];
			const ph = d[s.phase];
			rows.push({ t: (ph === 3 ? end : start) + off, dur: ph === 1 ? end - start : null, ph, thread: label, name, data: data ? JSON.stringify(data).slice(0, DATA_WIDTH) : '' });
		}
	}
	for (const sp of p.processes || []) walk(sp, null);
}
walk(prof, 'parent');
if (args.names) { for (const [k, v] of Object.entries(names).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(6), k); process.exit(0); }
rows.sort((a, b) => a.t - b.t);
for (const r of rows) console.log(r.t.toFixed(1).padStart(9), (r.dur != null ? r.dur.toFixed(1) : ['', '', 'start', 'end'][r.ph] || '').padStart(8), r.thread.padEnd(THREAD_WIDTH).slice(0, THREAD_WIDTH), r.name, r.data);
