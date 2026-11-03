#!/usr/bin/env node
// Builds, signs and publishes a Quick Dial NG release. See README.md in this folder.
// Usage: node release/release.js <version> [--commit <rev>] [--notes <file>] [--xpi <file>]
//        [--no-updates-json] [--dry-run] [--config <file>]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const OWNER = 'YuriyWozniak', REPO = 'quickdial-ng', ADDON_ID = 'quickdial-ng@yuriywozniak';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const ROOT = path.resolve(__dirname, '..');

// ---------- arguments and config ----------
function parseArgs(argv) {
	const a = { flags: {} };
	for (let i = 0; i < argv.length; i++) {
		const v = argv[i];
		if (v === '--dry-run' || v === '--no-updates-json' || v === '-h' || v === '--help') a.flags[v.replace(/^-+/, '')] = true;
		else if (/^--(commit|notes|xpi|config)$/.test(v)) {
			if (i + 1 >= argv.length) fail(`${v} needs a value`);
			a.flags[v.slice(2)] = argv[++i];
		} else if (v.startsWith('-')) fail(`Unknown option ${v}`);
		else if (!a.version) a.version = v;
		else fail(`Unexpected argument ${v}`);
	}
	return a;
}

function loadConfig(file) {
	const cfgPath = file ? path.resolve(file) : path.join(__dirname, 'config.local.json');
	let cfg = {};
	if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
	else if (file) fail(`Config file not found: ${cfgPath}`);
	const base = path.dirname(cfgPath);
	const abs = p => p && path.resolve(base, p);
	return {
		keyFile: abs(process.env.QDNG_AMO_KEY_FILE || cfg.amoKeyFile),
		webExtDir: abs(process.env.QDNG_WEB_EXT_DIR || cfg.webExtDir) || __dirname,
		outDir: abs(process.env.QDNG_OUT_DIR || cfg.outDir) || path.join(__dirname, 'signed'),
	};
}

// ---------- helpers ----------
function fail(msg) { console.error('Error: ' + msg); process.exit(1); }
function log(msg) { console.log(msg); }

function git(args, opts = {}) {
	const r = spawnSync('git', args, { cwd: ROOT, encoding: opts.binary ? 'buffer' : 'utf8', maxBuffer: 64 << 20 });
	if (r.error) fail(`git ${args[0]}: ${r.error.message}`);
	if (r.status !== 0 && !opts.allowFail) fail(`git ${args.join(' ')} failed:\n${r.stderr}`);
	return opts.binary ? r.stdout : (r.status === 0 ? r.stdout.trim() : null);
}

// Minimal ZIP reader (stored and deflated entries), enough for .xpi files and git archives.
function readZip(buf) {
	let eocd = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--)
		if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
	if (eocd < 0) throw new Error('not a zip file');
	const count = buf.readUInt16LE(eocd + 10);
	let p = buf.readUInt32LE(eocd + 16);
	const files = new Map();
	for (let n = 0; n < count; n++) {
		if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip central directory');
		const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
		const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
		const local = buf.readUInt32LE(p + 42);
		const name = buf.toString('utf8', p + 46, p + 46 + nlen);
		p += 46 + nlen + xlen + clen;
		if (name.endsWith('/')) continue;
		const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
		const raw = buf.subarray(start, start + csize);
		if (method === 0) files.set(name, Buffer.from(raw));
		else if (method === 8) files.set(name, zlib.inflateRawSync(raw));
		else throw new Error(`unsupported zip method ${method} for ${name}`);
	}
	return files;
}

// Files of src/ at a commit, keyed by path relative to src/.
function sourceAt(commit) {
	const zip = readZip(git(['archive', '--format=zip', commit, 'src'], { binary: true }));
	const files = new Map();
	for (const [name, data] of zip) files.set(name.replace(/^src\//, ''), data);
	return files;
}

// The signer rewrites manifest.json and line endings may differ; compare what matters.
function sameContent(name, a, b) {
	if (name === 'manifest.json') {
		try { return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b)); } catch { return false; }
	}
	if (a.equals(b)) return true;
	const t = x => x.toString('latin1').replace(/\r\n/g, '\n');
	return t(a) === t(b);
}

function checkXpi(xpiPath, version, src) {
	const files = readZip(fs.readFileSync(xpiPath));
	if (!files.has('META-INF/mozilla.rsa')) fail(`${xpiPath} is not signed by Mozilla`);
	const v = JSON.parse(files.get('manifest.json')).version;
	if (v !== version) fail(`${xpiPath} contains version ${v}, not ${version}`);
	const xpiNames = [...files.keys()].filter(n => !n.startsWith('META-INF/'));
	const diffs = [];
	for (const n of xpiNames) if (!src.has(n)) diffs.push('only in .xpi: ' + n);
	for (const n of src.keys()) {
		if (!files.has(n)) diffs.push('missing in .xpi: ' + n);
		else if (!sameContent(n, files.get(n), src.get(n))) diffs.push('differs: ' + n);
	}
	if (diffs.length) fail(`${path.basename(xpiPath)} does not match the source:\n  ${diffs.join('\n  ')}`);
}

function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

// ---------- signing ----------
function readKeys(file) {
	if (!file) fail('No AMO key file configured (amoKeyFile in release/config.local.json or QDNG_AMO_KEY_FILE).');
	if (!fs.existsSync(file)) fail(`AMO key file not found: ${file}`);
	const kv = {};
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*(JWT_ISSUER|JWT_SECRET)\s*=\s*(\S+)\s*$/);
		if (m) kv[m[1]] = m[2];
	}
	if (!kv.JWT_ISSUER || !kv.JWT_SECRET || /^paste-/.test(kv.JWT_ISSUER) || /^paste-/.test(kv.JWT_SECRET))
		fail(`Fill in JWT_ISSUER and JWT_SECRET in ${file} first.`);
	return kv;
}

function webExtBin(dir) {
	// Look for node_modules/web-ext the way Node does (require.resolve can't: web-ext doesn't export package.json)
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

function writeSource(src, dir) {
	for (const [name, data] of src) {
		fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
		fs.writeFileSync(path.join(dir, name), data);
	}
}

// Lint exactly what will be signed. --self-hosted: the add-on has its own update_url (GitHub), which
// the linter otherwise rejects as if it were listed on addons.mozilla.org.
function lint(src, cfg) {
	const bin = webExtBin(cfg.webExtDir);
	const work = fs.mkdtempSync(path.join(os.tmpdir(), 'qdng-lint-'));
	try {
		const srcDir = path.join(work, 'src');
		writeSource(src, srcDir);
		log('Linting the source (web-ext lint --self-hosted --warnings-as-errors)...');
		const r = spawnSync(process.execPath, [bin, 'lint', '--source-dir', srcDir, '--self-hosted', '--warnings-as-errors'], { cwd: work, stdio: 'inherit' });
		if (r.status !== 0) fail('web-ext lint reported problems (see above); fix them before releasing.');
		log('Lint: no errors or warnings');
	} finally {
		fs.rmSync(work, { recursive: true, force: true });
	}
}

function sign(src, cfg, xpiPath) {
	const keys = readKeys(cfg.keyFile);
	const bin = webExtBin(cfg.webExtDir);
	const work = fs.mkdtempSync(path.join(os.tmpdir(), 'qdng-sign-'));
	try {
		const srcDir = path.join(work, 'src'), artifacts = path.join(work, 'out');
		writeSource(src, srcDir);
		log('Signing on addons.mozilla.org (unlisted). Approval usually takes a few minutes...');
		const r = spawnSync(process.execPath, [bin, 'sign', '--source-dir', srcDir, '--artifacts-dir', artifacts,
			'--channel', 'unlisted', '--approval-timeout', '900000'], {
			cwd: work, stdio: 'inherit',
			env: { ...process.env, WEB_EXT_API_KEY: keys.JWT_ISSUER, WEB_EXT_API_SECRET: keys.JWT_SECRET },
		});
		if (r.status !== 0) fail(`web-ext sign failed (exit ${r.status})`);
		const out = fs.existsSync(artifacts) ? fs.readdirSync(artifacts).filter(f => f.endsWith('.xpi')) : [];
		if (out.length !== 1) fail(`Expected one signed .xpi, found ${out.length}`);
		fs.mkdirSync(path.dirname(xpiPath), { recursive: true });
		fs.copyFileSync(path.join(artifacts, out[0]), xpiPath);
		log(`Signed: ${xpiPath}`);
	} finally {
		fs.rmSync(work, { recursive: true, force: true });
	}
}

// ---------- GitHub ----------
function githubToken() {
	if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
	const r = spawnSync('git', ['credential', 'fill'], {
		cwd: ROOT, encoding: 'utf8', input: 'protocol=https\nhost=github.com\n\n',
		env: { ...process.env, GCM_INTERACTIVE: 'never', GIT_TERMINAL_PROMPT: '0' },
	});
	const m = r.status === 0 && r.stdout.match(/^password=(.+)$/m);
	if (!m) fail('No GitHub login found (set GITHUB_TOKEN or sign in with Git Credential Manager).');
	return m[1].trim();
}

async function gh(token, method, url, body, contentType = 'application/json') {
	const res = await fetch(url.startsWith('http') ? url : API + url, {
		method,
		headers: {
			Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
			'User-Agent': 'quickdial-ng-release', 'X-GitHub-Api-Version': '2022-11-28',
			...(body ? { 'Content-Type': contentType } : {}),
		},
		body: body && contentType === 'application/json' ? JSON.stringify(body) : body,
	});
	const text = await res.text();
	return { status: res.status, data: text ? JSON.parse(text) : null };
}

// ---------- main ----------
async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.flags.help || !args.version) {
		log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 4).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
		process.exit(args.version || args.flags.help ? 0 : 1);
	}
	const { version, flags } = args;
	if (!/^\d+(\.\d+){1,3}$/.test(version)) fail(`"${version}" is not a valid add-on version`);
	const dry = !!flags['dry-run'];
	const cfg = loadConfig(flags.config);
	const tag = 'v' + version, xpiName = `quickdial-ng-${version}.xpi`;
	const xpiPath = flags.xpi ? path.resolve(flags.xpi) : path.join(cfg.outDir, xpiName);
	if (dry) log('Dry run: nothing is signed, pushed or uploaded.');

	// 1. Which commit
	git(['fetch', '-q', '--tags', 'origin']);
	const rev = flags.commit || git(['log', '-1', '--format=%H', 'origin/develop', '--', 'src']);
	const commit = git(['rev-parse', '--verify', rev + '^{commit}']);
	if (git(['merge-base', '--is-ancestor', commit, 'origin/develop'], { allowFail: true }) === null)
		fail(`${commit.slice(0, 7)} is not on origin/develop; push it first.`);
	const src = sourceAt(commit);
	const srcVersion = JSON.parse(src.get('manifest.json')).version;
	if (srcVersion !== version) fail(`src/manifest.json at ${commit.slice(0, 7)} has version ${srcVersion}, not ${version}`);
	log(`Commit: ${commit.slice(0, 7)} ${git(['log', '-1', '--format=%s', commit])}`);

	// 2. Signed file (the source is linted first whenever it is going to be signed, dry runs included)
	if (!fs.existsSync(xpiPath) && !flags.xpi) lint(src, cfg);
	if (fs.existsSync(xpiPath)) log(`Using signed file ${xpiPath}`);
	else if (flags.xpi) fail(`File not found: ${xpiPath}`);
	else if (dry) { log(`Would sign the source and save ${xpiPath}`); }
	else sign(src, cfg, xpiPath);
	if (fs.existsSync(xpiPath)) { checkXpi(xpiPath, version, src); log(`${xpiName}: signed, version ${version}, matches the source`); }

	// 3. Tag
	const remoteTag = git(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]);
	if (!remoteTag) {
		if (dry) log(`Would tag ${tag} -> ${commit.slice(0, 7)} and push it`);
		else {
			if (!git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { allowFail: true })) git(['tag', tag, commit]);
			else if (git(['rev-parse', `${tag}^{commit}`]) !== commit) fail(`Local tag ${tag} points elsewhere; delete it first.`);
			git(['push', '-q', 'origin', `refs/tags/${tag}`]);
			log(`Tagged ${tag} -> ${commit.slice(0, 7)}`);
		}
	} else if (!remoteTag.startsWith(commit)) fail(`${tag} already exists on GitHub at a different commit: ${remoteTag}`);
	else log(`${tag} already on GitHub`);

	// 4. Release and asset
	const token = githubToken();
	let rel = await gh(token, 'GET', `/releases/tags/${tag}`);
	if (rel.status === 200) log(`Release ${tag} already exists`);
	else if (rel.status !== 404) fail(`GitHub returned ${rel.status} for release ${tag}`);
	else if (dry) log(`Would create release "Quick Dial NG ${version}"${flags.notes ? ` with notes from ${flags.notes}` : ''}`);
	else {
		const notes = flags.notes ? fs.readFileSync(flags.notes, 'utf8') : '';
		rel = await gh(token, 'POST', '/releases', { tag_name: tag, name: `Quick Dial NG ${version}`, body: notes, make_latest: 'legacy' });
		if (rel.status !== 201) fail(`Creating the release failed (${rel.status}): ${JSON.stringify(rel.data)}`);
		log(`Created release ${tag}`);
	}
	if (rel.data && rel.data.assets && rel.data.assets.some(a => a.name === xpiName)) log(`${xpiName} already attached`);
	else if (dry || !fs.existsSync(xpiPath)) log(`Would upload ${xpiName}`);
	else {
		const up = await gh(token, 'POST', `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${rel.data.id}/assets?name=${xpiName}`,
			fs.readFileSync(xpiPath), 'application/x-xpinstall');
		if (up.status !== 201) fail(`Upload failed (${up.status}): ${JSON.stringify(up.data)}`);
		log(`Uploaded ${xpiName} (${up.data.size} bytes)`);
	}

	// 5. updates.json
	if (!flags['no-updates-json']) {
		const ujPath = path.join(ROOT, 'updates.json');
		const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
		if (branch !== 'develop') fail(`updates.json is committed on develop, but ${branch} is checked out`);
		if (!dry) git(['pull', '-q', '--ff-only', 'origin', 'develop']);
		const data = JSON.parse(fs.readFileSync(ujPath, 'utf8'));
		const list = data.addons[ADDON_ID].updates;
		if (list.some(u => u.version === version)) log(`updates.json already lists ${version}`);
		else if (dry) log(`Would add ${version} to updates.json, commit and push`);
		else {
			list.push({
				version,
				update_link: `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/${xpiName}`,
				update_hash: 'sha256:' + sha256(xpiPath),
			});
			fs.writeFileSync(ujPath, JSON.stringify(data, null, 2) + '\n');
			git(['add', 'updates.json']);
			git(['commit', '-q', '-m', `updates.json: add ${version}`, '--', 'updates.json']);
			git(['push', '-q', 'origin', 'develop']);
			log(`updates.json: added ${version}`);
		}
	}
	log(`Done: https://github.com/${OWNER}/${REPO}/releases/tag/${tag}`);
}

main().catch(e => fail(e.stack || String(e)));
