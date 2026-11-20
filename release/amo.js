#!/usr/bin/env node
// Keeps Quick Dial NG's page on addons.mozilla.org (AMO) the same as release/amo-listing.md, through the AMO API (v5).
// Versions are submitted by the Release workflow (web-ext sign); this script is for the listing itself.
// The API key comes from AMO_JWT_ISSUER and AMO_JWT_SECRET, or else from the key file of release.js
// (amoKeyFile in release/config.local.json or QDNG_AMO_KEY_FILE). It is used only to sign requests and never printed.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const SCRIPT = 'node release/amo.js';
const USAGE = `Usage: ${SCRIPT} info                  the listing, its screenshots and the latest versions; what differs
       ${SCRIPT} listing               summary and description from amo-listing.md
       ${SCRIPT} icon                  release/amo-icon.png
       ${SCRIPT} previews [<png>...]   replace screenshots with these files (default: all in amo-listing.md),
                                       in the same place, captions from amo-listing.md
       ${SCRIPT} previews-set          make the screenshots exactly the ones in amo-listing.md, in its order
       ${SCRIPT} compat <version>      keep only Firefox (desktop) in a version's compatibility`;

// ---------- addons.mozilla.org ----------
const API = 'https://addons.mozilla.org/api/v5';
const ADDON = '/addons/addon/quick-dial-ng';
const LOCALE = 'en-US';
const APP_DESKTOP = 'firefox', APP_ANDROID = 'android';
const VERSIONS_SHOWN = 4; // in info
const HTTP_TOO_MANY_REQUESTS = 429;

// ---------- API key and request signing ----------
const ENV_ISSUER = 'AMO_JWT_ISSUER', ENV_SECRET = 'AMO_JWT_SECRET';
const ENV_KEY_FILE = 'QDNG_AMO_KEY_FILE', ENV_OUT_DIR = 'QDNG_OUT_DIR';
const KEY_FILE_ISSUER = 'JWT_ISSUER', KEY_FILE_SECRET = 'JWT_SECRET';
const JWT_HEADER = { alg: 'HS256', typ: 'JWT' }, JWT_HMAC = 'sha256';
const JWT_BACKDATE_S = 30; // issued slightly in the past: a clock ahead of AMO's would make iat invalid
const JWT_LIFETIME_S = 150; // AMO accepts tokens of at most 5 minutes
const AUTH_SCHEME = 'JWT';

// ---------- throttling (AMO limits listing edits) ----------
const THROTTLE_MAX_RETRIES = 20;
const THROTTLE_DEFAULT_WAIT_S = 30; // when AMO doesn't say how long
const THROTTLE_MARGIN_S = 2;
const THROTTLE_WAIT = /available in (\d+) second/;
const MS_PER_S = 1000;

// ---------- files ----------
const CONFIG_FILE = path.join(__dirname, 'config.local.json');
const LISTING_FILE = path.join(__dirname, 'amo-listing.md');
const ICON_FILE = path.join(__dirname, 'amo-icon.png');
const DEFAULT_OUT_DIR = path.join(__dirname, 'signed');
const PREVIEW_STATE_FILE = 'amo-previews.json'; // in the output folder
const PREVIEW_SET_STATE_FILE = 'amo-previews-set.json'; // in the output folder
const PNG = 'image/png';

// ---------- amo-listing.md ----------
const SUMMARY_HEADING = '## Summary', DESCRIPTION_HEADING = '## Description';
const CODE_BLOCK = /```[a-z]*\n([\s\S]*?)\n```/; // the first one after a heading
const SCREENSHOT_ROW = /^\| \d+ \| \[`([^`]+)`\]\(([^)]+)\) \| (.+?) \|$/gm; // | 1 | [`file.png`](path) | caption |

// ---------- comparing the description (the API returns it rendered as HTML) ----------
const HTML_TAG = /<[^>]+>/g;
const HTML_ENTITIES = { '&#39;': "'", '&#x27;': "'", '&quot;': '"', '&gt;': '>', '&lt;': '<', '&amp;': '&' };
const HTML_ENTITY = new RegExp(Object.keys(HTML_ENTITIES).join('|'), 'g');
const MD_LINK = /\[([^\]]*)\]\([^)]*\)/g;
const MD_MARKUP = /\*\*|`|^\s*[->]\s|^\s*\d+\.\s/gm; // bold, code, list items, quotes
const DIFF_CONTEXT_BEFORE = 20, DIFF_CONTEXT_AFTER = 40; // characters shown around a difference

function fail(msg) { console.error('Error: ' + msg); process.exit(1); }

function config() {
	const cfg = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : {};
	const abs = p => p && path.resolve(__dirname, p);
	return {
		keyFile: abs(process.env[ENV_KEY_FILE] || cfg.amoKeyFile),
		outDir: abs(process.env[ENV_OUT_DIR] || cfg.outDir) || DEFAULT_OUT_DIR,
	};
}
const cfg = config();

let keys;
function key() {
	if (keys) return keys;
	if (process.env[ENV_ISSUER] && process.env[ENV_SECRET])
		return keys = { iss: process.env[ENV_ISSUER], secret: process.env[ENV_SECRET] };
	if (!cfg.keyFile || !fs.existsSync(cfg.keyFile))
		fail(`No AMO API key: set ${ENV_ISSUER} and ${ENV_SECRET}, or amoKeyFile in release/config.local.json`);
	const text = fs.readFileSync(cfg.keyFile, 'utf8');
	const get = name => {
		const m = text.match(new RegExp(`^\\s*${name}\\s*=\\s*(\\S+)`, 'm'));
		if (!m) fail(`${name} missing in the key file`);
		return m[1];
	};
	return keys = { iss: get(KEY_FILE_ISSUER), secret: get(KEY_FILE_SECRET) };
}

function jwt() {
	const { iss, secret } = key();
	const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
	const iat = Math.floor(Date.now() / MS_PER_S) - JWT_BACKDATE_S;
	const signed = b64(JWT_HEADER) + '.' + b64({ iss, jti: crypto.randomUUID(), iat, exp: iat + JWT_LIFETIME_S });
	return signed + '.' + crypto.createHmac(JWT_HMAC, secret).update(signed).digest('base64url');
}

const wait = s => new Promise(r => setTimeout(r, s * MS_PER_S));
async function api(method, url, body, tries = 0) {
	const opts = { method, headers: { Authorization: `${AUTH_SCHEME} ${jwt()}` } };
	if (body instanceof FormData) opts.body = body;
	else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
	const r = await fetch(url.startsWith('http') ? url : API + url, opts);
	const text = await r.text();
	let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
	if (r.status === HTTP_TOO_MANY_REQUESTS && tries < THROTTLE_MAX_RETRIES) { // wait as long as AMO asks
		const s = +((JSON.stringify(data).match(THROTTLE_WAIT) || [])[1] || THROTTLE_DEFAULT_WAIT_S) + THROTTLE_MARGIN_S;
		console.log(`  throttled, waiting ${s} s`); await wait(s);
		return api(method, url, body, tries + 1);
	}
	if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${JSON.stringify(data)}`);
	return data;
}

const blob = (file, type) => new Blob([fs.readFileSync(file)], { type });
const localized = text => ({ [LOCALE]: text });
const en = o => o && (o[LOCALE] || Object.values(o)[0]);
const listing = () => fs.readFileSync(LISTING_FILE, 'utf8').replace(/\r\n/g, '\n');
// The first code block after a heading of amo-listing.md
function block(md, heading) {
	const i = md.indexOf(heading);
	if (i < 0) fail(`not found in ${path.basename(LISTING_FILE)}: ${heading}`);
	return md.slice(i).match(CODE_BLOCK)[1];
}
// Screenshot file name -> its caption and path, from the table in amo-listing.md
function screenshots() {
	const out = {};
	for (const [, name, rel, caption] of listing().matchAll(SCREENSHOT_ROW)) out[name] = { caption, file: path.resolve(__dirname, rel) };
	return out;
}
const plainText = s => s.replace(HTML_TAG, ' ').replace(HTML_ENTITY, e => HTML_ENTITIES[e]).replace(MD_LINK, '$1')
	.replace(MD_MARKUP, ' ').replace(/\s+/g, ' ').trim();
function difference(x, y) {
	let i = 0;
	while (i < x.length && x[i] === y[i]) i++;
	if (i >= Math.max(x.length, y.length)) return 'same';
	const around = s => JSON.stringify(s.slice(Math.max(0, i - DIFF_CONTEXT_BEFORE), i + DIFF_CONTEXT_AFTER));
	return `differs at ${i}: ${around(x)} vs ${around(y)}`;
}

const commands = {
	async info() {
		const a = await api('GET', ADDON + '/');
		const md = listing();
		console.log({ id: a.id, status: a.status, current: a.current_version && a.current_version.version, icon: a.icon_url });
		console.log('summary:', difference(en(a.summary), block(md, SUMMARY_HEADING)));
		console.log('description:', difference(plainText(en(a.description)), plainText(block(md, DESCRIPTION_HEADING))));
		for (const p of a.previews) console.log('screenshot', p.id, 'pos', p.position, JSON.stringify(en(p.caption)));
		const v = await api('GET', `${ADDON}/versions/?filter=all_with_unlisted&page_size=${VERSIONS_SHOWN}`);
		for (const x of v.results) console.log('version', x.version, x.channel, x.file && x.file.status, Object.keys(x.compatibility || {}).join('+'));
	},
	async listing() {
		const md = listing();
		const r = await api('PATCH', ADDON + '/', {
			summary: localized(block(md, SUMMARY_HEADING)), description: localized(block(md, DESCRIPTION_HEADING)) });
		console.log('summary:', en(r.summary).length, 'characters; description:', en(r.description).length, 'characters');
	},
	async icon() {
		const f = new FormData(); f.append('icon', blob(ICON_FILE, PNG), path.basename(ICON_FILE));
		const r = await api('PATCH', ADDON + '/', f);
		console.log('icon:', r.icon_url);
	},
	// Each new screenshot goes in the place of the one with the same caption, which is then deleted. Resumable:
	// amo-previews.json in the output folder records a replacement in progress, so a rerun after an interruption
	// (AMO throttles edits, sometimes for an hour) finishes it instead of adding another screenshot.
	async previews(...files) {
		const known = screenshots();
		if (!files.length) files = Object.values(known).map(s => s.file);
		fs.mkdirSync(cfg.outDir, { recursive: true });
		const stateFile = path.join(cfg.outDir, PREVIEW_STATE_FILE);
		const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
		const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));
		const listed = async () => (await (await fetch(`${API}${ADDON}/?lang=${LOCALE}`)).json()).previews; // public, not throttled
		for (const file of files) {
			const name = path.basename(file), caption = known[name] && known[name].caption;
			if (!caption) { console.log('skip', name, `(no caption in ${path.basename(LISTING_FILE)})`); continue; }
			const same = (await listed()).filter(p => en(p.caption) === caption);
			let s = state[name];
			if (!s) {
				if (same.length !== 1) { console.log('skip', name, `(${same.length} screenshots on AMO have its caption)`); continue; }
				const f = new FormData(); f.append('image', blob(file, PNG), name); f.append('position', String(same[0].position));
				const n = await api('POST', ADDON + '/previews/', f);
				s = state[name] = { id: n.id, position: same[0].position, captioned: false }; save();
			}
			if (!s.captioned) {
				await api('PATCH', `${ADDON}/previews/${s.id}/`, { caption: localized(caption), position: s.position });
				s.captioned = true; save();
			}
			for (const old of same.filter(p => p.id !== s.id)) await api('DELETE', `${ADDON}/previews/${old.id}/`);
			delete state[name]; save(); // finished: the next run replaces it again
			console.log(new Date().toISOString(), 'replaced', name, '->', s.id, 'pos', s.position);
		}
		if (!Object.keys(state).length) fs.rmSync(stateFile, { force: true });
		console.log('screenshots done');
	},
	// Makes AMO's screenshots exactly the ones in amo-listing.md, in its order: uploads each with its caption and
	// position, then deletes every other screenshot. For a new set, when previews can't match old captions.
	// Resumable: amo-previews-set.json in the output folder records what is uploaded, so a rerun after an
	// interruption (AMO throttles edits) goes on instead of uploading the same picture twice.
	async 'previews-set'() {
		const wanted = Object.entries(screenshots()); // [name, { caption, file }], in the order of the table
		if (!wanted.length) fail(`no screenshots in ${path.basename(LISTING_FILE)}`);
		for (const [name, { file }] of wanted) if (!fs.existsSync(file)) fail(`${name} not found: ${file}`);
		fs.mkdirSync(cfg.outDir, { recursive: true });
		const stateFile = path.join(cfg.outDir, PREVIEW_SET_STATE_FILE);
		const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { uploaded: {} };
		const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));
		for (const [index, [name, { caption, file }]] of wanted.entries()) {
			const position = index + 1;
			let s = state.uploaded[name];
			if (!s) {
				const f = new FormData(); f.append('image', blob(file, PNG), name); f.append('position', String(position));
				s = state.uploaded[name] = { id: (await api('POST', ADDON + '/previews/', f)).id, captioned: false }; save();
			}
			if (!s.captioned) {
				await api('PATCH', `${ADDON}/previews/${s.id}/`, { caption: localized(caption), position });
				s.captioned = true; save();
			}
			console.log(new Date().toISOString(), 'uploaded', name, '->', s.id, 'pos', position);
		}
		const keep = new Set(Object.values(state.uploaded).map(s => s.id));
		for (const p of (await api('GET', `${ADDON}/?lang=${LOCALE}`)).previews) {
			if (keep.has(p.id)) continue;
			await api('DELETE', `${ADDON}/previews/${p.id}/`);
			console.log(new Date().toISOString(), 'deleted', p.id, JSON.stringify(en(p.caption)));
		}
		fs.rmSync(stateFile, { force: true });
		console.log('screenshots done:', wanted.length);
	},
	// AMO adds Firefox for Android when the manifest has gecko_android (needed by the linter): keep only desktop
	async compat(version) {
		if (!version) fail(`Usage: ${SCRIPT} compat <version>`);
		const v = await api('GET', `${ADDON}/versions/${version}/`);
		console.log('before', JSON.stringify(v.compatibility));
		const r = await api('PATCH', `${ADDON}/versions/${v.id}/`, { compatibility: { [APP_DESKTOP]: v.compatibility[APP_DESKTOP] } });
		console.log('after', JSON.stringify(r.compatibility));
		if (r.compatibility[APP_ANDROID]) fail(`AMO still lists ${APP_ANDROID} for ${version}`);
	},
};

const [cmd, ...args] = process.argv.slice(2);
if (!commands[cmd]) { console.log(USAGE); process.exit(cmd ? 1 : 0); }
commands[cmd](...args).catch(e => fail(e.message));
