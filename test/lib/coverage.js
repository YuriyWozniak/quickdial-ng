// Which lines of src/js the tests ran: V8 precise coverage from the browser (through a CDP session per
// page) and from the Node unit tests (NODE_V8_COVERAGE), merged per file. Used by run.js --coverage.
// Line figures are approximate: a line counts once any code on it ran, so a one-line function counts
// as soon as it is defined; the "never ran" function lists are the better guide.
'use strict';
const fs = require('fs'), path = require('path');
const { SRC } = require('./harness');

// Lines that are no code of their own: comments, closing brackets, blank lines
const NOT_CODE_LINE = /^\s*(\/\/|\/\*|\*|[})\];,]+\s*$|$)/;

class Coverage {
	constructor() { this.files = {}; } // js/x.js -> { source, hit: Uint8Array (per character), calls: Map(name@offset -> calls) }

	// scripts: V8 ScriptCoverage entries; fileOf(url) maps a script URL to js/x.js, or null to skip it
	add(scripts, fileOf) {
		for (const script of scripts) {
			const name = fileOf(script.url);
			if (!name || !fs.existsSync(path.join(SRC, name))) continue;
			const file = this.files[name] = this.files[name] || (() => {
				const source = fs.readFileSync(path.join(SRC, name), 'utf8');
				return { source, hit: new Uint8Array(source.length), calls: new Map() };
			})();
			const counts = new Int32Array(file.source.length).fill(-1);
			const ranges = script.functions.flatMap(functionCoverage => functionCoverage.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
			for (const range of ranges) counts.fill(range.count, range.startOffset, range.endOffset); // outer first, inner blocks override
			for (let i = 0; i < counts.length; i++) if (counts[i] > 0) file.hit[i] = 1;
			for (const functionCoverage of script.functions) if (functionCoverage.functionName) {
				const key = functionCoverage.functionName + '@' + functionCoverage.ranges[0].startOffset;
				file.calls.set(key, (file.calls.get(key) || 0) + functionCoverage.ranges[0].count);
			}
		}
	}

	// Starts collecting in a page. The host page calls qdBeforeFrameLoad before it replaces a frame,
	// so code of frames that are thrown away is counted too. Returns { snapshot }.
	async attach(page) {
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
		const fileOf = url => { const match = /^http:\/\/127\.0\.0\.1:\d+\/(js\/[^?#]*\.js)/.exec(url); return match && match[1]; };
		const snapshot = async () => { try { this.add((await cdp.send('Profiler.takePreciseCoverage')).result, fileOf); } catch { /* page closed */ } };
		await page.exposeFunction('qdBeforeFrameLoad', snapshot);
		return { snapshot };
	}

	// Adds the files NODE_V8_COVERAGE wrote (unit tests load src/js files by their path)
	addNodeDir(coverageDir) {
		const fileOf = url => { const match = /[\\/]src[\\/](js[\\/].*\.js)$/.exec(url.replace(/^file:\/\/\/?/, '')); return match && match[1].replace(/\\/g, '/'); };
		for (const fileName of fs.readdirSync(coverageDir)) {
			if (fileName.endsWith('.json')) this.add(JSON.parse(fs.readFileSync(path.join(coverageDir, fileName), 'utf8')).result, fileOf);
		}
	}

	report() {
		const rows = [];
		for (const [name, file] of Object.entries(this.files).sort()) {
			let total = 0, covered = 0, lineStart = 0;
			for (const line of file.source.split('\n')) {
				if (!NOT_CODE_LINE.test(line.replace(/\r$/, ''))) {
					total++;
					for (let i = 0; i < line.length; i++) if (line[i].trim() && file.hit[lineStart + i]) { covered++; break; }
				}
				lineStart += line.length + 1;
			}
			const neverRan = [...new Set([...file.calls].filter(([, calls]) => !calls).map(([key]) => key.split('@')[0]))];
			rows.push(`${name.padEnd(28)} ${(100 * covered / total).toFixed(0).padStart(3)}% of ${String(total).padStart(4)} lines` + (neverRan.length ? `\n    never ran: ${neverRan.join(', ')}` : ''));
		}
		const neverLoaded = [];
		const walk = dir => {
			for (const entry of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
				const entryPath = dir + '/' + entry.name;
				if (entry.isDirectory()) walk(entryPath); else if (entryPath.endsWith('.js') && !this.files[entryPath]) neverLoaded.push(entryPath);
			}
		};
		walk('js');
		if (neverLoaded.length) rows.push('never loaded: ' + neverLoaded.join(', '));
		return rows.join('\n');
	}
}

module.exports = { Coverage };
