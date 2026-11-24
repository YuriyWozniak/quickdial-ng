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

const SUITES_DIR = path.join(__dirname, 'integration');
const MAX_JOBS = 4;
const allSuites = fs.readdirSync(SUITES_DIR).filter(fileName => fileName.endsWith('.js')).sort().map(fileName => fileName.slice(0, -'.js'.length));
const args = process.argv.slice(2);
// Takes a flag (--list) out of the arguments; whether it was there
const takeFlag = name => { const index = args.indexOf(name); if (index < 0) return false; args.splice(index, 1); return true; };
// Takes an option with its value (--jobs 2) out of the arguments; its value, or defaultValue
const takeOption = (name, defaultValue) => { const index = args.indexOf(name); if (index < 0) return defaultValue; const value = args[index + 1]; args.splice(index, 2); return value; };
const listOnly = takeFlag('--list'), withCoverage = takeFlag('--coverage');
const jobs = Math.max(1, +takeOption('--jobs', Math.min(MAX_JOBS, os.cpus().length)) || 1);
const unknown = args.filter(arg => !allSuites.includes(arg));
if (unknown.length) { console.error(`Unknown suite: ${unknown.join(', ')}. Suites: ${allSuites.join(', ')}`); process.exit(2); }
const chosen = args.length ? allSuites.filter(suiteName => args.includes(suiteName)) : allSuites;

if (listOnly) {
	for (const suiteName of allSuites) console.log(suiteName.padEnd(16) + require(path.join(SUITES_DIR, suiteName)).title);
	process.exit(0);
}

const seconds = ms => (ms / 1000).toFixed(1);

async function main() {
	const startedAt = Date.now();
	const extensionCopy = prepare();
	const server = await serve(extensionCopy);
	const browser = await launch(server.port);
	const coverage = withCoverage ? new (require('./lib/coverage').Coverage)() : null;
	const results = [];
	const queue = chosen.slice();
	const worker = async () => {
		for (let suiteName; (suiteName = queue.shift());) {
			const suite = require(path.join(SUITES_DIR, suiteName)), suiteStartedAt = Date.now();
			const testPage = await TestPage.open(browser, server.port, { dir: extensionCopy, coverage });
			try { await suite.run(testPage); }
			catch (e) { testPage.check('suite stopped: ' + String(e && e.message || e).split('\n')[0], false); }
			await testPage.close();
			const result = { name: suiteName, title: suite.title, passed: testPage.passed, failed: testPage.failed, ms: Date.now() - suiteStartedAt };
			results.push(result);
			console.log(`\n== ${suiteName}: ${suite.title} (${seconds(result.ms)} s)\n` + testPage.lines.join('\n'));
		}
	};
	try { await Promise.all(Array.from({ length: Math.min(jobs, chosen.length) }, worker)); }
	finally {
		await browser.close();
		await server.close();
		fs.rmSync(extensionCopy, { recursive: true, force: true });
	}

	if (coverage) {
		const coverageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qdng-cov-'));
		spawnSync(process.execPath, ['--test', '--test-reporter=dot', 'unit/*.test.js'], { cwd: __dirname, env: { ...process.env, NODE_V8_COVERAGE: coverageDir }, stdio: 'ignore' });
		coverage.addNodeDir(coverageDir);
		fs.rmSync(coverageDir, { recursive: true, force: true });
		console.log('\n== Coverage of src/js (page suites run: ' + chosen.join(', ') + '; unit tests)\n' + coverage.report());
	}

	const failedSuites = results.filter(result => result.failed);
	const passedChecks = results.reduce((sum, result) => sum + result.passed, 0);
	const allChecks = passedChecks + results.reduce((sum, result) => sum + result.failed, 0);
	console.log(`\n${passedChecks}/${allChecks} checks passed in ${results.length} suite(s), ${seconds(Date.now() - startedAt)} s`);
	if (failedSuites.length) console.log('Failed: ' + failedSuites.map(result => `${result.name} (${result.failed})`).join(', '));
	console.log(failedSuites.length ? 'SOME FAILED' : 'ALL PASS');
	return failedSuites.length ? 1 : 0;
}

main().then(exitCode => process.exit(exitCode), e => { console.error(e); console.log('SOME FAILED'); process.exit(1); });
