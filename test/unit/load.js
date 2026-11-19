// Loads extension scripts from src/js into a fresh sandbox (node:vm) for unit tests: no browser, no
// Playwright. The scripts share the sandbox's globals as they share window in a page.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const SRC = path.resolve(__dirname, '..', '..', 'src');

// A minimal stand-in for the WebExtension API: storage in memory, a bookmarks tree (browser.bookmarks.tree,
// a "menu________" folder to start with) whose events only count their listeners, and nothing else.
// Calls that change something are logged in browser.calls.
function fakeBrowser() {
	const store = {}, calls = [];
	let next = 1;
	const event = () => { const ls = new Set(); return { addListener: f => ls.add(f), removeListener: f => ls.delete(f), hasListener: f => ls.has(f), listeners: ls }; };
	const copy = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
	const bookmarks = { onCreated: event(), onChanged: event(), onMoved: event(), onRemoved: event(),
		tree: { id: 'root________', type: 'folder', children: [{ id: 'menu________', type: 'folder', title: 'menu', children: [] }] },
		find: (id, n = bookmarks.tree) => n.id === id ? n : (n.children || []).map(c => bookmarks.find(id, c)).find(Boolean),
		getSubTree: id => bookmarks.find(id) ? Promise.resolve([copy(bookmarks.find(id))]) : Promise.reject(new Error('no bookmark ' + id)),
		create: o => {
			calls.push(['create', o.title]);
			const n = { id: 'n' + next++, parentId: o.parentId, title: o.title, type: o.url ? 'bookmark' : 'folder' };
			if (o.url) n.url = o.url;
			bookmarks.find(o.parentId).children.push(o.url ? n : { ...n, children: [] });
			return Promise.resolve(copy(n)); // like Firefox: a new folder comes without a children list
		},
		update: (id, ch) => { calls.push(['update', id, ch]); return Promise.resolve(); },
		removeTree: id => { calls.push(['removeTree', id]); return Promise.resolve(); } };
	return {
		calls, store, bookmarks,
		storage: { local: {
			get: keys => Promise.resolve(Object.fromEntries([].concat(keys).filter(k => k in store).map(k => [k, copy(store[k])]))),
			set: o => { calls.push(['set', Object.keys(o)]); Object.assign(store, copy(o)); return Promise.resolve(); },
			remove: ks => { calls.push(['remove', [].concat(ks)]); for (const k of [].concat(ks)) delete store[k]; return Promise.resolve(); },
			clear: () => { calls.push(['clear']); for (const k in store) delete store[k]; return Promise.resolve(); } } },
		runtime: { sendMessage: () => Promise.resolve() }
	};
}

// load('js/themes.js', ...) -> the sandbox, with its globals (QDThemes, app...) as properties.
// Background scripts are loaded without main.js, so nothing starts by itself.
function load(...files) {
	const browser = fakeBrowser();
	const memory = {};
	const sandbox = { console, setTimeout, clearTimeout, browser,
		localStorage: { getItem: k => (k in memory ? memory[k] : null), setItem: (k, v) => { memory[k] = String(v); }, removeItem: k => { delete memory[k]; } } };
	sandbox.window = sandbox;
	vm.createContext(sandbox);
	for (const f of files) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: path.join(SRC, f) });
	return sandbox;
}
// common.js, themes.js and every background script but main.js, in manifest order
function loadBackground() {
	const scripts = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8')).background.scripts;
	return load(...scripts.filter(s => !s.endsWith('/main.js')));
}

// Values made in the sandbox have its own Object and Array: compare plain copies
const plain = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
// Lets queued timers (Settings.save waits 100 ms) and promises run
const settle = (ms = 150) => new Promise(r => setTimeout(r, ms));

module.exports = { load, loadBackground, plain, settle };
