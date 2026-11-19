// Which lines of src/js the tests ran: V8 precise coverage from the browser (through a CDP session per
// page) and from the Node unit tests (NODE_V8_COVERAGE), merged per file. Used by run.js --coverage.
// Line figures are approximate: a line counts once any code on it ran, so a one-line function counts
// as soon as it is defined; the "never ran" function lists are the better guide.
'use strict';
const fs = require('fs'), path = require('path');
const { SRC } = require('./harness');

class Coverage {
	constructor() { this.files = {}; } // js/x.js -> { src, hit: Uint8Array, fns: Map(name@offset -> calls) }

	// result: V8 ScriptCoverage entries; file(url) maps a script URL to js/x.js, or null to skip it
	add(result, file) {
		for (const e of result) {
			const name = file(e.url);
			if (!name || !fs.existsSync(path.join(SRC, name))) continue;
			const f = this.files[name] = this.files[name] || (() => { const src = fs.readFileSync(path.join(SRC, name), 'utf8'); return { src, hit: new Uint8Array(src.length), fns: new Map() }; })();
			const counts = new Int32Array(f.src.length).fill(-1);
			const ranges = e.functions.flatMap(fn => fn.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
			for (const r of ranges) counts.fill(r.count, r.startOffset, r.endOffset); // outer first, inner blocks override
			for (let i = 0; i < counts.length; i++) if (counts[i] > 0) f.hit[i] = 1;
			for (const fn of e.functions) if (fn.functionName) {
				const key = fn.functionName + '@' + fn.ranges[0].startOffset;
				f.fns.set(key, (f.fns.get(key) || 0) + fn.ranges[0].count);
			}
		}
	}

	// Starts collecting in a page. The host page calls qdBeforeFrameLoad before it replaces a frame,
	// so code of frames that are thrown away is counted too. Returns { snapshot }.
	async attach(page) {
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
		const file = url => { const m = /^http:\/\/127\.0\.0\.1:\d+\/(js\/[^?#]*\.js)/.exec(url); return m && m[1]; };
		const snapshot = async () => { try { this.add((await cdp.send('Profiler.takePreciseCoverage')).result, file); } catch { /* page closed */ } };
		await page.exposeFunction('qdBeforeFrameLoad', snapshot);
		return { snapshot };
	}

	// Adds the files NODE_V8_COVERAGE wrote (unit tests load src/js files by their path)
	addNodeDir(dir) {
		const file = url => { const m = /[\\/]src[\\/](js[\\/].*\.js)$/.exec(url.replace(/^file:\/\/\/?/, '')); return m && m[1].replace(/\\/g, '/'); };
		for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) this.add(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).result, file);
	}

	report() {
		const rows = [];
		for (const [name, f] of Object.entries(this.files).sort()) {
			let total = 0, covered = 0, off = 0;
			for (const line of f.src.split('\n')) {
				if (!/^\s*(\/\/|\/\*|\*|[})\];,]+\s*$|$)/.test(line.replace(/\r$/, ''))) {
					total++;
					for (let i = 0; i < line.length; i++) if (line[i].trim() && f.hit[off + i]) { covered++; break; }
				}
				off += line.length + 1;
			}
			const never = [...new Set([...f.fns].filter(([, c]) => !c).map(([k]) => k.split('@')[0]))];
			rows.push(`${name.padEnd(28)} ${(100 * covered / total).toFixed(0).padStart(3)}% of ${String(total).padStart(4)} lines` + (never.length ? `\n    never ran: ${never.join(', ')}` : ''));
		}
		const unseen = [];
		const walk = dir => {
			for (const e of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
				const p = dir + '/' + e.name;
				if (e.isDirectory()) walk(p); else if (p.endsWith('.js') && !this.files[p]) unseen.push(p);
			}
		};
		walk('js');
		if (unseen.length) rows.push('never loaded: ' + unseen.join(', '));
		return rows.join('\n');
	}
}

module.exports = { Coverage };
