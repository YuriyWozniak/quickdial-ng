// Loads extension scripts from src/js into a fresh sandbox (node:vm) for unit tests: no browser, no
// Playwright. The scripts share the sandbox's globals as they share window in a page.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const SRC = path.resolve(__dirname, '..', '..', 'src');

// A deep copy, as the real API gives (nothing shared between the caller and the stored data)
const copyOf = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

// A minimal stand-in for the WebExtension API: storage in memory, a bookmarks tree (browser.bookmarks.tree,
// a "menu________" folder to start with) whose events only count their listeners, and nothing else.
// Calls that change something are logged in browser.calls.
function fakeBrowser() {
	const store = {}, calls = [];
	let nextBookmarkId = 1;
	const fakeEvent = () => {
		const listeners = new Set();
		return { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener), hasListener: listener => listeners.has(listener), listeners };
	};
	const bookmarks = { onCreated: fakeEvent(), onChanged: fakeEvent(), onMoved: fakeEvent(), onRemoved: fakeEvent(),
		tree: { id: 'root________', type: 'folder', children: [{ id: 'menu________', type: 'folder', title: 'menu', children: [] }] },
		find: (id, node = bookmarks.tree) => node.id === id ? node : (node.children || []).map(child => bookmarks.find(id, child)).find(Boolean),
		getSubTree: id => bookmarks.find(id) ? Promise.resolve([copyOf(bookmarks.find(id))]) : Promise.reject(new Error('no bookmark ' + id)),
		create: ({ parentId, title, url }) => {
			calls.push(['create', title]);
			const created = { id: 'n' + nextBookmarkId++, parentId, title, type: url ? 'bookmark' : 'folder' };
			if (url) created.url = url;
			bookmarks.find(parentId).children.push(url ? created : { ...created, children: [] });
			return Promise.resolve(copyOf(created)); // like Firefox: a new folder comes without a children list
		},
		update: (id, changes) => { calls.push(['update', id, changes]); return Promise.resolve(); },
		removeTree: id => { calls.push(['removeTree', id]); return Promise.resolve(); } };
	return {
		calls, store, bookmarks,
		storage: { local: {
			get: keys => Promise.resolve(Object.fromEntries([].concat(keys).filter(key => key in store).map(key => [key, copyOf(store[key])]))),
			set: items => { calls.push(['set', Object.keys(items)]); Object.assign(store, copyOf(items)); return Promise.resolve(); },
			remove: keys => { calls.push(['remove', [].concat(keys)]); for (const key of [].concat(keys)) delete store[key]; return Promise.resolve(); },
			clear: () => { calls.push(['clear']); for (const key in store) delete store[key]; return Promise.resolve(); } } },
		runtime: { sendMessage: () => Promise.resolve() },
		i18n: { getMessage, getUILanguage: () => 'en' }
	};
}
// browser.i18n.getMessage with the English texts, $1..$9 filled in as Firefox does
const ENGLISH_MESSAGES = JSON.parse(fs.readFileSync(path.join(SRC, '_locales', 'en', 'messages.json'), 'utf8'));
function getMessage(key, substitutions) {
	const entry = ENGLISH_MESSAGES[key], values = substitutions == null ? [] : [].concat(substitutions);
	return entry ? entry.message.replace(/\$(\d|\$)/g, (placeholder, number) => number === '$' ? '$' : String(values[number - 1] ?? '')) : '';
}

// load('js/themes.js', ...) -> the sandbox, with its globals (QDThemes, app...) as properties.
// Background scripts are loaded without main.js, so nothing starts by itself.
function load(...files) {
	const browser = fakeBrowser();
	const localItems = {};
	const sandbox = { console, setTimeout, clearTimeout, browser,
		localStorage: { getItem: key => (key in localItems ? localItems[key] : null), setItem: (key, value) => { localItems[key] = String(value); }, removeItem: key => { delete localItems[key]; } } };
	sandbox.window = sandbox;
	vm.createContext(sandbox);
	for (const file of files) vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), sandbox, { filename: path.join(SRC, file) });
	return sandbox;
}
// common.js, themes.js and every background script but main.js, in manifest order
function loadBackground() {
	const scripts = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8')).background.scripts;
	return load(...scripts.filter(script => !script.endsWith('/main.js')));
}

// Values made in the sandbox have its own Object and Array: compare plain copies
const plain = copyOf;
// Lets queued timers (Settings.save waits 100 ms) and promises run
const settle = (ms = 150) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { load, loadBackground, plain, settle };
