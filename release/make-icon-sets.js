#!/usr/bin/env node
// Makes the icon sets of the icon picker (Properties › Picture › Icon) from their published sources. None of them comes
// with the extension: each is a file of a release of this repository, which the picker downloads when the user asks for it.
//   <work folder>/icon-sets/<tag>/outline.json  Tabler Icons, outline style (MIT): icons [name, search words, SVG markup inside a 24×24 <svg>]
//   <work folder>/icon-sets/<tag>/pixel.json    Pixelarticons (MIT): icons [name, search words, SVG markup inside a 24×24 <svg>]
//   <work folder>/icon-sets/<tag>/retro.json    the SerenityOS icons (BSD-2-Clause), in colour: picture, one PNG with CELL×CELL
//                                               pixels per icon, and icons [name, search words, x, y, size]: where each one is in it
// Each file also holds its source (name and version) and its licence, which every copy must carry.
//   src/iconsets.json  what the extension knows of them: for each set, its address (a file of a release), its size and
//                      fingerprint (SHA-256), which the extension checks a download against, and its source and licence.
// Each set names its own release, so a release holds only the sets that changed in it: the others keep pointing at the
// release they came with, and installed copies don't offer to download them again.
// Usage, from the test folder (it reuses the tests' Playwright to draw the retro picture):
//   node ../release/make-icon-sets.js <work folder> <release tag, e.g. icons-2> [set...]
// Only the sets named (outline, pixel, retro; all of them by default) are made again; a set whose file comes out the same
// as the one src/iconsets.json names keeps its release too. The work folder also receives the downloads (npm pack, and a
// sparse git checkout of the icons only). Then publish the files it lists under that tag (see release/README.md, Icon sets)
// and commit src/iconsets.json.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync, execSync } = require('child_process');
const { chromium } = require(require.resolve('playwright', { paths: [path.join(__dirname, '..', 'test'), process.cwd()] }));

const CATALOG = path.join(__dirname, '..', 'src', 'iconsets.json');
const RELEASES = 'https://github.com/YuriyWozniak/quickdial-ng/releases/download/';
const TAG = /^icons-\d+$/;
const TABLER_PACKAGE = '@tabler/icons', PIXEL_PACKAGE = 'pixelarticons';
const SERENITY_REPO = 'https://github.com/SerenityOS/serenity.git', SERENITY_ICONS = 'Base/res/icons';
// Where each set comes from, for the picker: its home page and licence
const ABOUT = Object.freeze({
	outline: { homepage: 'https://tabler.io/icons', license: 'MIT', licenseUrl: 'https://github.com/tabler/tabler-icons/blob/main/LICENSE' },
	pixel: { homepage: 'https://pixelarticons.com', license: 'MIT', licenseUrl: 'https://github.com/halfmage/pixelarticons/blob/master/LICENSE' },
	retro: { homepage: 'https://github.com/SerenityOS/serenity', license: 'BSD-2-Clause', licenseUrl: 'https://github.com/SerenityOS/serenity/blob/master/LICENSE' }
});
const RETRO_SIZES = [32, 16]; // SerenityOS icon folders (32x32, 16x16), preferred first: a name in both comes from the first
const RETRO_DOUBLE = /-2x$/; // twice-the-size copies of 16×16 icons, for high-density screens: left out
const CELL = 32; // the retro picture: each icon in a CELL×CELL square, at its top left
const SPRITE_COLUMNS = 20;
const PIXEL_VARIANT = /-sharp$/; // Pixelarticons' square-cornered copies of its icons: left out
const OUTPUT_LIMIT = 64 << 20; // bytes of a command's output (npm pack --json lists every file of the package)

function fail(msg) { console.error('Error: ' + msg); process.exit(1); }
const OPTIONS = cwd => ({ cwd, encoding: 'utf8', maxBuffer: OUTPUT_LIMIT, stdio: ['ignore', 'pipe', 'inherit'] });
const run = (cmd, args, cwd) => execFileSync(cmd, args, OPTIONS(cwd));

// npm pack, then unpack: the package's folder. npm is a script on Windows, so it runs in a shell (the name is one of ours).
function npmPackage(name, workDir) {
	const [packed] = JSON.parse(execSync(`npm pack ${name} --json`, OPTIONS(workDir)));
	const dir = path.join(workDir, packed.filename.replace(/\.tgz$/, ''));
	fs.mkdirSync(dir, { recursive: true });
	run('tar', ['-xzf', packed.filename, '-C', dir], workDir);
	return { dir: path.join(dir, 'package'), version: packed.version };
}
// The SerenityOS icons, without the rest of the system
function serenityIcons(workDir) {
	const dir = path.join(workDir, 'serenity');
	if (!fs.existsSync(dir)) {
		run('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', SERENITY_REPO, dir], workDir);
		run('git', ['sparse-checkout', 'set', SERENITY_ICONS], dir);
	}
	return { dir, commit: run('git', ['rev-parse', '--short', 'HEAD'], dir).trim() };
}

// The words a search finds an icon by, besides its name: lower case, each once, none of the name's own
const searchWords = (name, words) => {
	const own = new Set(name.split('-'));
	const seen = new Set();
	for (const word of words.join(' ').toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (word && !own.has(word)) seen.add(word);
	return [...seen].join(' ');
};
// SVG markup from Tabler's nodes: [["path", { d }], ...]
const markup = nodes => nodes.map(([tag, attrs]) => '<' + tag + Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join('') + '/>').join('');
// What is inside a file's <svg> element, without comments, on one line; null when there is none or a comment can't be removed
const COMMENT = /<!--[\s\S]*?-->/g;
const svgBody = text => {
	const match = text.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
	if (!match) return null;
	let body = match[1], previous;
	do { // Again until nothing changes: removing one comment can join the parts of another
		previous = body;
		body = body.replace(COMMENT, '');
	} while (body !== previous);
	if (body.includes('<!--')) return null;
	return body.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
};
// A licence file's text, with \n line ends
const licenseText = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim() + '\n';

function makeOutline(tabler) {
	const infos = JSON.parse(fs.readFileSync(path.join(tabler.dir, 'icons.json'), 'utf8'));
	const nodes = JSON.parse(fs.readFileSync(path.join(tabler.dir, 'tabler-nodes-outline.json'), 'utf8'));
	const icons = Object.keys(nodes).sort().map(name => {
		const info = infos[name] || {};
		return [name, searchWords(name, [...(info.tags || []).map(String), String(info.category || '')]), markup(nodes[name])];
	});
	return { source: 'Tabler Icons ' + tabler.version, license: licenseText(path.join(tabler.dir, 'LICENSE')), icons };
}

function makePixel(pixel) {
	const svgDir = path.join(pixel.dir, 'svg');
	const icons = [];
	for (const file of fs.readdirSync(svgDir).filter(f => f.endsWith('.svg')).sort()) {
		const name = file.slice(0, -4);
		if (PIXEL_VARIANT.test(name)) continue;
		const body = svgBody(fs.readFileSync(path.join(svgDir, file), 'utf8'));
		if (body) icons.push([name, '', body]);
	}
	return { source: 'Pixelarticons ' + pixel.version, license: licenseText(path.join(pixel.dir, 'LICENSE')), icons };
}

async function makeRetro(serenity) {
	const files = new Map(); // name -> { file, size }
	for (const size of RETRO_SIZES) {
		const dir = path.join(serenity.dir, SERENITY_ICONS, size + 'x' + size);
		for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort()) {
			const name = file.slice(0, -4);
			if (RETRO_DOUBLE.test(name)) continue;
			if (!files.has(name)) files.set(name, { file: path.join(dir, file), size });
		}
	}
	const names = [...files.keys()].sort();
	const pictures = names.map(name => 'data:image/png;base64,' + fs.readFileSync(files.get(name).file).toString('base64'));
	const browser = await chromium.launch();
	const page = await browser.newPage();
	const drawn = await page.evaluate(async ({ pictures, cell, columns }) => {
		const canvas = document.createElement('canvas');
		canvas.width = cell * columns;
		canvas.height = cell * Math.ceil(pictures.length / columns);
		const ctx = canvas.getContext('2d');
		const sizes = [];
		for (let i = 0; i < pictures.length; i++) {
			const img = new Image();
			img.src = pictures[i];
			await img.decode();
			ctx.drawImage(img, (i % columns) * cell, Math.floor(i / columns) * cell);
			sizes.push([img.naturalWidth, img.naturalHeight]);
		}
		return { png: canvas.toDataURL('image/png'), sizes };
	}, { pictures, cell: CELL, columns: SPRITE_COLUMNS });
	await browser.close();
	const icons = names.map((name, i) => {
		const [width, height] = drawn.sizes[i];
		if (width !== files.get(name).size || height !== width) fail(`${name}: ${width}x${height}, expected ${files.get(name).size}x${files.get(name).size}`);
		return [name, '', (i % SPRITE_COLUMNS) * CELL, Math.floor(i / SPRITE_COLUMNS) * CELL, width];
	}); // in the same order as the picture holds them
	return { source: 'SerenityOS icons ' + serenity.commit, license: licenseText(path.join(serenity.dir, 'LICENSE')), cell: CELL, picture: drawn.png, icons };
}

// How each set is made from its sources
const MAKERS = Object.freeze({
	outline: workDir => makeOutline(npmPackage(TABLER_PACKAGE, workDir)),
	pixel: workDir => makePixel(npmPackage(PIXEL_PACKAGE, workDir)),
	retro: workDir => makeRetro(serenityIcons(workDir))
});
const USAGE = 'Usage: node ../release/make-icon-sets.js <work folder> <release tag, e.g. icons-2> [' + Object.keys(MAKERS).join(' | ') + ' ...]';

(async () => {
	const [workDir, tag, ...asked] = process.argv.slice(2);
	if (!workDir || !TAG.test(tag || '') || asked.some(name => !MAKERS[name])) fail(USAGE);
	const names = asked.length ? asked : Object.keys(MAKERS);
	const outDir = path.join(workDir, 'icon-sets', tag);
	fs.mkdirSync(outDir, { recursive: true });
	const old = fs.existsSync(CATALOG) ? JSON.parse(fs.readFileSync(CATALOG, 'utf8')) : { sets: {} };
	// A published release's files never change: installed copies check them against their own fingerprints
	if (Object.values(old.sets).some(set => set.url.startsWith(RELEASES + tag + '/'))) fail(tag + ' is already published: use a new tag');
	const catalog = { sets: {} }, published = [];
	for (const name of Object.keys(MAKERS)) {
		if (!names.includes(name)) {
			if (!old.sets[name]) fail(name + ' is not in ' + CATALOG + ' yet: make it too');
			catalog.sets[name] = old.sets[name];
			continue;
		}
		const data = await MAKERS[name](workDir);
		const file = name + '.json', bytes = Buffer.from(JSON.stringify(data) + '\n');
		const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
		if (old.sets[name] && old.sets[name].sha256 === sha256) {
			catalog.sets[name] = old.sets[name];
			console.log(`${name}: the same as before, stays at ${old.sets[name].url}`);
			continue;
		}
		fs.writeFileSync(path.join(outDir, file), bytes);
		published.push(path.join(outDir, file));
		catalog.sets[name] = { url: RELEASES + tag + '/' + file, bytes: bytes.length, sha256, count: data.icons.length, source: data.source, ...ABOUT[name] };
		console.log(`${name}: ${bytes.length} bytes, ${data.icons.length} icons, ${data.source} -> ${path.join(outDir, file)}`);
	}
	if (!published.length) return console.log('Nothing changed: no release to publish, ' + CATALOG + ' left as it was.');
	fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, '\t') + '\n');
	console.log('Wrote ' + CATALOG + '. Publish these files under ' + tag + ' (release/README.md, Icon sets), then commit it:');
	console.log('  ' + published.join('\n  '));
})().catch(e => fail(e.stack || String(e)));
