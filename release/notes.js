#!/usr/bin/env node
// The release notes of a version, from the "Release notes" section of amo-listing.md (### <version>, then a code block).
// Usage: node release/notes.js <version> [--out <file>]  prints the notes (or writes them to a file, for release.js --notes)
//        node release/notes.js --check                   CI check: a version in src/manifest.json that isn't tagged yet
//                                                        (v<version> on origin) must have its notes in amo-listing.md
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LISTING = path.join(__dirname, 'amo-listing.md');

function fail(msg) { console.error('Error: ' + msg); process.exit(1); }

// The text inside the code block under "### <version>" in the "## Release notes" section, or null
function notesOf(version) {
	const md = fs.readFileSync(LISTING, 'utf8').replace(/\r\n/g, '\n');
	const section = md.split(/^## /m).find(s => s.startsWith('Release notes'));
	if (!section) fail('amo-listing.md has no "## Release notes" section');
	const block = section.split(/^### /m).find(s => s.split('\n')[0].trim() === version);
	if (!block) return null;
	const m = block.match(/^```[^\n]*\n([\s\S]*?)^```/m);
	return m && m[1].trim() ? m[1].trim() + '\n' : null;
}

function tagExists(tag) {
	const r = spawnSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`], { cwd: ROOT, encoding: 'utf8' });
	if (r.status !== 0) fail(`git ls-remote failed:\n${r.stderr}`);
	return r.stdout.trim() !== '';
}

const args = process.argv.slice(2);
if (args[0] === '--check') {
	const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'manifest.json'), 'utf8'));
	if (tagExists(`v${version}`)) {
		console.log(`${version} is already released (tag v${version}); nothing to check.`);
	} else if (notesOf(version)) {
		console.log(`OK: release notes for ${version} found in release/amo-listing.md.`);
	} else {
		fail(`src/manifest.json is at ${version}, which isn't released yet, but release/amo-listing.md has no notes for it.\n` +
			`Add them under "## Release notes" as "### ${version}" followed by a code block.`);
	}
} else if (args[0] && !args[0].startsWith('-')) {
	const notes = notesOf(args[0]);
	if (!notes) fail(`No release notes for ${args[0]} in release/amo-listing.md`);
	const out = args[1] === '--out' ? args[2] : null;
	if (args[1] === '--out' && !out) fail('--out needs a file name');
	if (out) fs.writeFileSync(out, notes);
	else process.stdout.write(notes);
} else {
	fail('Usage: node release/notes.js <version> [--out <file>] | --check');
}
