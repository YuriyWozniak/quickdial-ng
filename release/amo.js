#!/usr/bin/env node
// Keeps Quick Dial NG's page on addons.mozilla.org (AMO) the same as release/amo-listing.md, through the AMO API (v5).
// Versions are submitted by the Release workflow (web-ext sign); this script is for the listing itself.
// Usage: node release/amo.js info                  the listing, its screenshots and the latest versions; what differs
//        node release/amo.js listing               summary and description from amo-listing.md
//        node release/amo.js icon                  release/amo-icon.png
//        node release/amo.js previews [<png>...]   replace screenshots with these files (default: all in amo-listing.md),
//                                                  in the same place, captions from amo-listing.md
//        node release/amo.js compat <version>      keep only Firefox (desktop) in a version's compatibility
// The API key comes from AMO_JWT_ISSUER and AMO_JWT_SECRET, or else from the key file of release.js
// (amoKeyFile in release/config.local.json or QDNG_AMO_KEY_FILE). It is used only to sign requests and never printed.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const API = 'https://addons.mozilla.org/api/v5';
const ADDON = '/addons/addon/quick-dial-ng';

function fail(msg) { console.error('Error: ' + msg); process.exit(1); }

function config() {
	const file = path.join(__dirname, 'config.local.json');
	const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
	const abs = p => p && path.resolve(__dirname, p);
	return {
		keyFile: abs(process.env.QDNG_AMO_KEY_FILE || cfg.amoKeyFile),
		outDir: abs(process.env.QDNG_OUT_DIR || cfg.outDir) || path.join(__dirname, 'signed'),
	};
}
const cfg = config();

let keys;
function key() {
	if (keys) return keys;
	if (process.env.AMO_JWT_ISSUER && process.env.AMO_JWT_SECRET)
		return keys = { iss: process.env.AMO_JWT_ISSUER, secret: process.env.AMO_JWT_SECRET };
	if (!cfg.keyFile || !fs.existsSync(cfg.keyFile)) fail('No AMO API key: set AMO_JWT_ISSUER and AMO_JWT_SECRET, or amoKeyFile in release/config.local.json');
	const t = fs.readFileSync(cfg.keyFile, 'utf8');
	const get = n => { const m = t.match(new RegExp('^\\s*' + n + '\\s*=\\s*(\\S+)', 'm')); if (!m) fail(`${n} missing in the key file`); return m[1]; };
	return keys = { iss: get('JWT_ISSUER'), secret: get('JWT_SECRET') };
}

function jwt() {
	const { iss, secret } = key();
	const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
	const now = Math.floor(Date.now() / 1000) - 30; // a clock slightly ahead would make iat invalid
	const head = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ iss, jti: crypto.randomUUID(), iat: now, exp: now + 150 });
	return head + '.' + crypto.createHmac('sha256', secret).update(head).digest('base64url');
}

const wait = ms => new Promise(r => setTimeout(r, ms));
async function api(method, url, body, tries = 0) {
	const opts = { method, headers: { Authorization: 'JWT ' + jwt() } };
	if (body instanceof FormData) opts.body = body;
	else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
	const r = await fetch(url.startsWith('http') ? url : API + url, opts);
	const text = await r.text();
	let data; try { data = text ? JSON.parse(text) : null; } catch { data = text.slice(0, 400); }
	if (r.status === 429 && tries < 20) { // throttled: wait as long as AMO asks
		const s = +((JSON.stringify(data).match(/available in (\d+) second/) || [])[1] || 30);
		console.log(`  throttled, waiting ${s + 2} s`); await wait((s + 2) * 1000);
		return api(method, url, body, tries + 1);
	}
	if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${JSON.stringify(data)}`);
	return data;
}

const blob = (p, type) => new Blob([fs.readFileSync(p)], { type });
const listing = () => fs.readFileSync(path.join(__dirname, 'amo-listing.md'), 'utf8').replace(/\r\n/g, '\n');
// The first ``` block after `marker`
function block(md, marker) {
	const i = md.indexOf(marker); if (i < 0) fail('not found in amo-listing.md: ' + marker);
	return md.slice(i).match(/```[a-z]*\n([\s\S]*?)\n```/)[1];
}
const en = o => o && (o['en-US'] || Object.values(o)[0]);
// Screenshot file -> caption, from the table in amo-listing.md
function captions() {
	const out = {};
	for (const m of listing().matchAll(/^\| \d+ \| \[`([^`]+)`\]\(([^)]+)\) \| (.+?) \|$/gm)) out[m[1]] = { caption: m[3], file: path.resolve(__dirname, m[2]) };
	return out;
}

const commands = {
	async info() {
		const a = await api('GET', ADDON + '/');
		const md = listing();
		const diff = (x, y) => { let i = 0; while (i < x.length && x[i] === y[i]) i++; return i >= Math.max(x.length, y.length) ? 'same' : `differs at ${i}: ${JSON.stringify(x.slice(Math.max(0, i - 20), i + 40))} vs ${JSON.stringify(y.slice(Math.max(0, i - 20), i + 40))}`; };
		console.log({ id: a.id, status: a.status, current: a.current_version && a.current_version.version, icon: a.icon_url });
		console.log('summary:', diff(en(a.summary), block(md, '## Summary')));
		// The API returns the description rendered as HTML: compare the plain text
		const text = s => s.replace(/<[^>]+>/g, ' ').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>')
			.replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/\*\*|`|^\s*[->]\s|^\s*\d+\.\s/gm, ' ').replace(/\s+/g, ' ').trim();
		console.log('description:', diff(text(en(a.description)), text(block(md, '## Description'))));
		for (const p of a.previews) console.log('screenshot', p.id, 'pos', p.position, JSON.stringify(en(p.caption)));
		const v = await api('GET', ADDON + '/versions/?filter=all_with_unlisted&page_size=4');
		for (const x of v.results) console.log('version', x.version, x.channel, x.file && x.file.status, Object.keys(x.compatibility || {}).join('+'));
	},
	async listing() {
		const md = listing();
		const r = await api('PATCH', ADDON + '/', { summary: { 'en-US': block(md, '## Summary') }, description: { 'en-US': block(md, '## Description') } });
		console.log('summary:', en(r.summary).length, 'characters; description:', en(r.description).length, 'characters');
	},
	async icon() {
		const f = new FormData(); f.append('icon', blob(path.join(__dirname, 'amo-icon.png'), 'image/png'), 'amo-icon.png');
		const r = await api('PATCH', ADDON + '/', f);
		console.log('icon:', r.icon_url);
	},
	// Each new screenshot goes in the place of the one with the same caption, which is then deleted. Resumable:
	// amo-previews.json in the output folder records a replacement in progress, so a rerun after an interruption
	// (AMO throttles edits, sometimes for an hour) finishes it instead of adding another screenshot.
	async previews(...files) {
		const known = captions();
		if (!files.length) files = Object.values(known).map(c => c.file);
		fs.mkdirSync(cfg.outDir, { recursive: true });
		const stateFile = path.join(cfg.outDir, 'amo-previews.json');
		const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
		const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));
		const listed = async () => (await (await fetch(API + ADDON + '/?lang=en-US')).json()).previews; // public, not throttled
		for (const file of files) {
			const name = path.basename(file), caption = known[name] && known[name].caption;
			if (!caption) { console.log('skip', name, '(no caption in amo-listing.md)'); continue; }
			const same = (await listed()).filter(p => en(p.caption) === caption);
			let s = state[name];
			if (!s) {
				if (same.length !== 1) { console.log('skip', name, `(${same.length} screenshots on AMO have its caption)`); continue; }
				const f = new FormData(); f.append('image', blob(file, 'image/png'), name); f.append('position', String(same[0].position));
				const n = await api('POST', ADDON + '/previews/', f);
				s = state[name] = { id: n.id, position: same[0].position, captioned: false }; save();
			}
			if (!s.captioned) {
				await api('PATCH', `${ADDON}/previews/${s.id}/`, { caption: { 'en-US': caption }, position: s.position });
				s.captioned = true; save();
			}
			for (const old of same.filter(p => p.id !== s.id)) await api('DELETE', `${ADDON}/previews/${old.id}/`);
			delete state[name]; save(); // finished: the next run replaces it again
			console.log(new Date().toISOString(), 'replaced', name, '->', s.id, 'pos', s.position);
		}
		if (!Object.keys(state).length) fs.rmSync(stateFile, { force: true });
		console.log('screenshots done');
	},
	// AMO adds Firefox for Android when the manifest has gecko_android (needed by the linter): keep only desktop
	async compat(version) {
		if (!version) fail('Usage: node release/amo.js compat <version>');
		const g = await api('GET', `${ADDON}/versions/${version}/`);
		console.log('before', JSON.stringify(g.compatibility));
		const r = await api('PATCH', `${ADDON}/versions/${g.id}/`, { compatibility: { firefox: g.compatibility.firefox } });
		console.log('after', JSON.stringify(r.compatibility));
	},
};

const [cmd, ...args] = process.argv.slice(2);
if (!commands[cmd]) {
	console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 11).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
	process.exit(cmd ? 1 : 0);
}
commands[cmd](...args).catch(e => fail(e.message));
