#!/usr/bin/env node
// Lints Quick Dial NG with web-ext lint: any error or warning stops it, except the warnings in ALLOWED_WARNINGS.
// release.js lints what it signs with it, and the CI lints src/ with it, so both apply the same rules.
// Usage: node release/lint.js <source folder> [--self-hosted]
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Quick Dial NG is for Firefox on the desktop only, so the manifest has no gecko_android. The linter then takes
// the desktop minimum version (140) for Firefox for Android too, and warns that data_collection_permissions needs
// 142 there. Android isn't offered at all (each version on AMO is desktop only), so the warning doesn't apply.
const ALLOWED_WARNINGS = new Set(['KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION']);
const SELF_HOSTED = '--self-hosted';
const LINT_OUTPUT_LIMIT = 64 << 20; // bytes of web-ext's JSON report

function fail(msg) { console.error('Error: ' + msg); process.exit(1); }

// The web-ext command of node_modules/web-ext, found from dir upwards the way Node does
// (require.resolve can't: web-ext doesn't export package.json)
function webExtBin(dir) {
	let pkgJson = null;
	for (let d = path.resolve(dir); !pkgJson; d = path.dirname(d)) {
		const p = path.join(d, 'node_modules', 'web-ext', 'package.json');
		if (fs.existsSync(p)) pkgJson = p;
		else if (path.dirname(d) === d) fail(`web-ext not found from ${dir}. Run "npm install" in the release folder or set webExtDir.`);
	}
	const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
	const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['web-ext'];
	return path.join(path.dirname(pkgJson), bin);
}

// Lints sourceDir and prints every message. selfHosted: the add-on has its own update_url (the GitHub builds);
// without it, the stricter rules for add-ons listed on addons.mozilla.org. Returns the number of problems
// that count: errors, and warnings that aren't allowed.
function lint(sourceDir, { selfHosted = false, webExtDir = __dirname } = {}) {
	const args = ['lint', '--source-dir', path.resolve(sourceDir), '--output', 'json'];
	if (selfHosted) args.push(SELF_HOSTED);
	const r = spawnSync(process.execPath, [webExtBin(webExtDir), ...args],
		{ cwd: path.dirname(path.resolve(sourceDir)), encoding: 'utf8', maxBuffer: LINT_OUTPUT_LIMIT });
	const jsonStart = r.stdout ? r.stdout.indexOf('{') : -1;
	let report;
	try { report = JSON.parse(r.stdout.slice(jsonStart)); } catch { report = null; }
	if (jsonStart < 0 || !report) fail(`web-ext lint gave no report:\n${r.stdout || ''}${r.stderr || ''}`);
	const where = m => m.file ? ` (${m.file}${m.line ? ':' + m.line : ''})` : '';
	const show = (kind, m) => console.log(`  ${kind} ${m.code}: ${m.message}${where(m)}`);
	let problems = 0;
	for (const m of report.errors || []) { show('error', m); problems++; }
	for (const m of report.warnings || []) {
		if (ALLOWED_WARNINGS.has(m.code)) show('warning (allowed)', m);
		else { show('warning', m); problems++; }
	}
	for (const m of report.notices || []) show('notice', m);
	return problems;
}

module.exports = { lint, webExtBin };

if (require.main === module) {
	const args = process.argv.slice(2);
	const sourceDir = args.find(a => !a.startsWith('-'));
	if (!sourceDir || args.some(a => a.startsWith('-') && a !== SELF_HOSTED)) fail(`Usage: node release/lint.js <source folder> [${SELF_HOSTED}]`);
	const problems = lint(sourceDir, { selfHosted: args.includes(SELF_HOSTED) });
	if (problems) fail(`web-ext lint: ${problems} problem(s), see above`);
	console.log('Lint: no errors or warnings that count');
}
