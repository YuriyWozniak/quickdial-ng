// Simulated Firefox WebExtension API shared by all frames (state lives in the top window, in mockState):
//   storage       browser.storage.local
//   writes        every key written to storage, with the size of its value: { key, size }
//   removes       every key removed from storage
//   bookmarkTree  the bookmarks (root > menu, toolbar)
//   listeners     the event listeners, by event name ('bm.onCreated', 'rt.onMessage.dial'...)
//   menus         the context menu titles; menuItems: everything passed to contextMenus.create
window.mockState = { storage: {}, writes: [], removes: [], frames: [], nextBookmarkId: 100, listeners: {} };
mockState.bookmarkTree = { id: 'root________', title: '', children: [
	{ id: 'menu________', title: 'menu', children: [] },
	{ id: 'toolbar_____', title: 'toolbar', children: [] } ] };
// A deep copy, as the real API gives (nothing shared between the caller and the stored data)
const copyOf = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
// The bookmark with that id and its parent folder ({ node, parent }), or null
function findBookmark(id, node = mockState.bookmarkTree, parent = null) {
	if (node.id === id) return { node, parent };
	for (const child of node.children || []) { const found = findBookmark(id, child, node); if (found) return found; }
	return null;
}
// An event of the API (onCreated...): its listeners are kept in mockState.listeners[eventName], marked
// with the role of the frame that added them, so replacing a frame removes them (index.html, loadFrame)
function mockEvent(eventName, ownerRole) {
	mockState.listeners[eventName] = mockState.listeners[eventName] || [];
	return {
		addListener: listener => { listener.__owner = ownerRole; if (!mockState.listeners[eventName].includes(listener)) mockState.listeners[eventName].push(listener); },
		removeListener: listener => { mockState.listeners[eventName] = mockState.listeners[eventName].filter(added => added !== listener); },
		hasListener: listener => mockState.listeners[eventName].includes(listener) };
}
// Calls every listener of an event, as Firefox does; a listener that throws doesn't stop the others
function fireEvent(eventName, ...eventArgs) {
	for (const listener of [...(mockState.listeners[eventName] || [])]) {
		try { listener(...eventArgs); } catch (e) { console.error('listener', eventName, e); }
	}
}
window.fireEvent = fireEvent;
// browser.i18n: the English texts (_locales/en/messages.json, read once), $1..$9 filled in as Firefox does
let englishMessages = null;
function getMessage(key, substitutions) {
	if (key === '@@bidi_dir') return 'ltr';
	if (!englishMessages) {
		const request = new XMLHttpRequest();
		request.open('GET', '/_locales/en/messages.json', false);
		request.send();
		englishMessages = JSON.parse(request.responseText);
	}
	const entry = englishMessages[key], values = substitutions == null ? [] : [].concat(substitutions);
	return entry ? entry.message.replace(/\$(\d|\$)/g, (placeholder, number) => number === '$' ? '$' : String(values[number - 1] ?? '')) : '';
}
// How long a sent message waits for an answer before it resolves with nothing, as when no listener answers
const MESSAGE_ANSWER_TIMEOUT = 50;

// The browser object of one frame: role is 'bg' for the background page, 'dial' for the other pages
window.makeBrowser = function (frameWindow, role) {
	mockState.frames.push({ win: frameWindow, role });
	const storage = { local: {
		get: keys => {
			const wanted = keys == null ? Object.keys(mockState.storage) : (typeof keys === 'string' ? [keys] : keys);
			const result = {};
			for (const key of wanted) if (key in mockState.storage) result[key] = copyOf(mockState.storage[key]);
			return Promise.resolve(result);
		},
		set: items => {
			for (const key in items) { mockState.storage[key] = copyOf(items[key]); mockState.writes.push({ key, size: JSON.stringify(items[key]).length }); }
			return Promise.resolve();
		},
		remove: keys => {
			for (const key of [].concat(keys)) { delete mockState.storage[key]; mockState.removes.push(key); }
			return Promise.resolve();
		},
		clear: () => { mockState.storage = {}; return Promise.resolve(); } } };

	// Like Firefox, a bookmark id that doesn't exist (any more) rejects; changes fire their events afterwards
	const later = (eventName, ...eventArgs) => setTimeout(() => fireEvent(eventName, ...eventArgs), 0);
	const missing = id => Promise.reject(new Error('no bookmark ' + id));
	const bookmarks = {
		getSubTree: id => findBookmark(id) ? Promise.resolve([copyOf(findBookmark(id).node)]) : missing(id),
		create: ({ parentId, title, url }) => {
			const parentFolder = findBookmark(parentId).node;
			const created = { id: 'n' + (mockState.nextBookmarkId++), title, parentId, type: url ? 'bookmark' : 'folder' };
			if (url) created.url = url; else created.children = [];
			parentFolder.children.push(created);
			later('bm.onCreated', created.id, copyOf(created));
			const answer = copyOf(created);
			delete answer.children; // Firefox returns new folders without a children list
			return Promise.resolve(answer);
		},
		update: (id, changes) => {
			if (!findBookmark(id)) return missing(id);
			const bookmark = findBookmark(id).node;
			Object.assign(bookmark, changes);
			later('bm.onChanged', id, changes);
			return Promise.resolve(copyOf(bookmark));
		},
		move: (id, { parentId, index }) => {
			if (!findBookmark(id) || !findBookmark(parentId)) return missing(id);
			const moved = findBookmark(id);
			const oldParentId = moved.parent.id, oldIndex = moved.parent.children.indexOf(moved.node);
			moved.parent.children.splice(oldIndex, 1);
			const newParent = findBookmark(parentId).node;
			newParent.children.splice(index == null ? newParent.children.length : index, 0, moved.node);
			moved.node.parentId = parentId;
			later('bm.onMoved', id, { parentId, oldParentId, index: newParent.children.indexOf(moved.node), oldIndex });
			return Promise.resolve(copyOf(moved.node));
		},
		removeTree: id => {
			const removed = findBookmark(id);
			if (!removed) return missing(id);
			removed.parent.children = removed.parent.children.filter(child => child.id !== id);
			later('bm.onRemoved', id, { parentId: removed.parent.id });
			return Promise.resolve();
		},
		onCreated: mockEvent('bm.onCreated', role), onChanged: mockEvent('bm.onChanged', role), onMoved: mockEvent('bm.onMoved', role),
		onRemoved: mockEvent('bm.onRemoved', role), onImportBegan: mockEvent('bm.onImportBegan', role), onImportEnded: mockEvent('bm.onImportEnded', role) };

	// Messages go from the background page to the dial and from any other page to the background page
	const sendMessage = message => {
		const receiverRole = role === 'bg' ? 'dial' : 'bg';
		const receivers = mockState.listeners['rt.onMessage.' + receiverRole] || [];
		if (!receivers.length) return Promise.reject(new Error('no receiver'));
		return new Promise((resolve, reject) => {
			let answered = false;
			for (const receiver of receivers) {
				const returned = receiver(copyOf(message), {}, answer => { answered = true; resolve(copyOf(answer)); });
				if (returned && returned.then) { answered = true; returned.then(answer => resolve(copyOf(answer)), reject); }
			}
			setTimeout(() => { if (!answered) resolve(undefined); }, MESSAGE_ANSWER_TIMEOUT);
		});
	};
	const runtime = {
		onMessage: mockEvent('rt.onMessage.' + role, role),
		sendMessage,
		getBackgroundPage: () => Promise.resolve((mockState.frames.filter(frame => frame.role === 'bg').pop() || {}).win),
		getURL: extensionPath => extensionPath,
		getManifest: () => ({ version: '0.0.0' }) };

	const tabs = { query: () => Promise.resolve([]), update: () => Promise.resolve({}), create: () => Promise.resolve({ id: 1 }), remove: () => Promise.resolve(),
		getCurrent: () => Promise.resolve({ id: 1 }), sendMessage: () => Promise.resolve(), captureVisibleTab: () => Promise.reject(new Error('n/a')),
		get: () => Promise.resolve({ status: 'complete' }) };
	// mockState.menus: the titles; mockState.menuItems: everything passed to create (onclick included), so tests can click an item
	const contextMenus = {
		create: item => { (mockState.menus = mockState.menus || []).push(item.title); (mockState.menuItems = mockState.menuItems || []).push(item); return item.id || mockState.menuItems.length; },
		removeAll: () => { mockState.menus = []; mockState.menuItems = []; return Promise.resolve(); },
		onClicked: mockEvent('cm.onClicked', role) };

	return { storage, bookmarks, runtime, tabs, contextMenus,
		browserAction: { onClicked: mockEvent('ba.onClicked', role) },
		i18n: { getMessage, getUILanguage: () => 'en' } };
};
