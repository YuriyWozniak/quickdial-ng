#!/usr/bin/env node
// Runs the integration suites in integration/: the extension's pages in Chromium against a simulated Firefox API.
// Each suite starts from a fresh profile, so any of them can run alone. See README.md.
//
//   node run.js                  all suites
//   node run.js dial sync        only these suites
//   node run.js --list           the suites and what they cover
//   node run.js --jobs 1         one suite at a time (default: up to 4 at once)
//   node run.js --coverage       also report which lines of src/js ran (unit tests included)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const { prepare, serve, launch, TestPage } = require('./lib/harness');

const SUITES = path.join(__dirname, 'integration');
const all = fs.readdirSync(SUITES).filter(f => f.endsWith('.js')).sort().map(f => f.slice(0, -3));
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const option = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const list = flag('--list'), withCoverage = flag('--coverage');
const jobs = Math.max(1, +option('--jobs', Math.min(4, os.cpus().length)) || 1);
const unknown = args.filter(a => !all.includes(a));
if (unknown.length) { console.error(`Unknown suite: ${unknown.join(', ')}. Suites: ${all.join(', ')}`); process.exit(2); }
const chosen = args.length ? all.filter(s => args.includes(s)) : all;

if (list) {
	for (const s of all) console.log(s.padEnd(16) + require(path.join(SUITES, s)).title);
	process.exit(0);
}

async function main() {
	const started = Date.now();
	const dir = prepare();
	const server = await serve(dir);
	const browser = await launch(server.port);
	const coverage = withCoverage ? new (require('./lib/coverage').Coverage)() : null;
	const results = [];
	const queue = chosen.slice();
	const worker = async () => {
		for (let name; (name = queue.shift());) {
			const suite = require(path.join(SUITES, name)), t0 = Date.now();
			const t = await TestPage.open(browser, server.port, { dir, coverage });
			try { await suite.run(t); }
			catch (e) { t.check('suite stopped: ' + String(e && e.message || e).split('\n')[0], false); }
			await t.close();
			const r = { name, title: suite.title, passed: t.passed, failed: t.failed, ms: Date.now() - t0 };
			results.push(r);
			console.log(`\n== ${name}: ${suite.title} (${(r.ms / 1000).toFixed(1)} s)\n` + t.lines.join('\n'));
		}
	};
	try { await Promise.all(Array.from({ length: Math.min(jobs, chosen.length) }, worker)); }
	finally {
		await browser.close();
		await server.close();
		fs.rmSync(dir, { recursive: true, force: true });
	}

	if (coverage) {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qdng-cov-'));
		spawnSync(process.execPath, ['--test', '--test-reporter=dot', 'unit/*.test.js'], { cwd: __dirname, env: { ...process.env, NODE_V8_COVERAGE: tmp }, stdio: 'ignore' });
		coverage.addNodeDir(tmp);
		fs.rmSync(tmp, { recursive: true, force: true });
		console.log('\n== Coverage of src/js (page suites run: ' + chosen.join(', ') + '; unit tests)\n' + coverage.report());
	}

	const failed = results.filter(r => r.failed);
	const passed = results.reduce((n, r) => n + r.passed, 0), checks = passed + results.reduce((n, r) => n + r.failed, 0);
	console.log(`\n${passed}/${checks} checks passed in ${results.length} suite(s), ${((Date.now() - started) / 1000).toFixed(1)} s`);
	if (failed.length) console.log('Failed: ' + failed.map(r => `${r.name} (${r.failed})`).join(', '));
	console.log(failed.length ? 'SOME FAILED' : 'ALL PASS');
	return failed.length ? 1 : 0;
}

main().then(code => process.exit(code), e => { console.error(e); console.log('SOME FAILED'); process.exit(1); });
