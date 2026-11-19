// The background page's message API, as the dial, Settings and Properties pages use it (js/background/messages.js).
'use strict';
const { freshProfile, spyTabs, stubDrawWindow, pictures } = require('../lib/fixtures');

// Sends a message to the background page as an extension page would, and returns the answer
const ask = (t, msg) => t.J(msg => {
	window.tester = window.tester || makeBrowser(window, 'tester');
	return tester.runtime.sendMessage(msg);
}, msg);
const C = { getSettings: 0, setSettings: 1, getNode: 2, getNodeByID: 3, updateNode: 4, setNodeIndex: 5, createBookmark: 6, createFolder: 7, deleteNode: 8,
	refreshNode: 9, getImages: 11, exportData: 12, importData: 13, getThemes: 14, setThemes: 15, openSettings: 16 };
const node = (t, id) => t.J(id => bg().app.GridNodes.getNodeById(id), id);
const bookmark = (t, id) => t.J(id => { const f = n => n.id === id ? n : (n.children || []).map(f).find(Boolean); return f(S.bm); }, id);

module.exports = {
	title: 'Messages from the pages: read and change tiles, settings, pictures, themes, backups',
	async run(t) {
		await freshProfile(t);
		await stubDrawWindow(t);
		const [pic] = await pictures(t, 1);

		let st = await ask(t, { cmd: C.getSettings });
		t.check('getSettings', st.grid.rows === 4 && st.toolbarAction === 'settings', st.grid);
		st = [await ask(t, { cmd: C.getNode, path: '/' }), await ask(t, { cmd: C.getNode, path: '/Folder/' }), await ask(t, { cmd: C.getNode, path: '/Nope/' })];
		t.check('getNode: the root, a folder, a missing folder', st[0].children.length === 7 && st[1].children[0].id === 'b7' && st[2] === null, st.map(n => n && n.title));
		st = await ask(t, { cmd: C.getNodeByID, id: 'b7' });
		t.check('getNodeByID', st.title === 'Site 7', st);

		// updateNode: what the Properties page sends
		await ask(t, { cmd: C.updateNode, id: 'b1', value: { title: 'Mine', titleLocked: true, imageLocked: true, image: pic, imageMode: 3, url: 'https://site1.example/' } });
		await t.idle();
		st = { node: await node(t, 'b1'), bookmark: await bookmark(t, 'b1'), stored: await t.J(() => (S.storage.img_b1 || '').slice(0, 15)) };
		t.check('updateNode sets the title, locks, fit and picture, and renames the bookmark', st.node.title === 'Mine' && st.node.titleLocked && st.node.imageLocked && st.node.imageMode === 3 && st.node.image === '1' && st.stored === 'data:image/png;' && st.bookmark.title === 'Mine', st);
		await ask(t, { cmd: C.updateNode, id: 'b1', value: { title: 'Mine', image: null, imageMode: -1 } });
		await t.idle();
		st = await node(t, 'b1');
		t.check('a kept picture stays when the page sends none; fit -1 goes back to the default', st.image === '1' && !('imageMode' in st), st);
		await ask(t, { cmd: C.updateNode, id: 'b1', value: { title: 'Mine', url: 'https://moved.example/' } });
		await t.waitFor('the new address to be fetched', () => !bg().app.GridNodes.getNodeById('b1').__isLoading && S.bm.children[0].children[0].children[0].url === 'https://moved.example/');
		st = { node: await node(t, 'b1'), bookmark: await bookmark(t, 'b1') };
		t.check('a new address is saved to the bookmark; a locked title and picture are kept', st.node.url === 'https://moved.example/' && st.node.title === 'Mine' && st.node.image === '1' && st.bookmark.url === 'https://moved.example/' && st.bookmark.title === 'Mine', st);
		await ask(t, { cmd: C.updateNode, id: 'b2', value: { title: 'Two', url: 'https://two.example/', image: null } });
		await t.waitFor('the new address to be fetched', () => bg().app.GridNodes.getNodeById('b2').image === '1');
		st = await node(t, 'b2');
		t.check('...an unlocked tile takes the new page\'s title and picture', st.title === 'two.example' && st.url === 'https://two.example/', st);

		// Tiles: swap, create, delete, refresh a folder
		await ask(t, { cmd: C.setNodeIndex, path: '/', index: 0, newIndex: 1 });
		await t.idle();
		st = await t.J(() => S.storage.node.children.slice(0, 2).map(c => c.id));
		t.check('setNodeIndex swaps two tiles', t.same(st, ['b2', 'b1']), st);
		await ask(t, { cmd: C.createBookmark, path: '/Folder/', url: 'folder-site.example', title: 'folder-site.example' });
		await ask(t, { cmd: C.createFolder, path: '/', name: 'Sub' });
		await t.idle();
		st = await t.J(() => ({ folder: bg().app.node.children[6].children.map(c => c.url), root: bg().app.node.children.map(c => c.title).slice(-1),
			bms: S.bm.children[0].children[0].children.map(c => c.title).slice(-1) }));
		t.check('createBookmark (in a folder, http:// added) and createFolder', t.same(st.folder, ['https://site7.example/', 'http://folder-site.example']) && t.same(st.root, ['Sub']) && t.same(st.bms, ['Sub']), st);
		const sub = await t.J(() => bg().app.node.children[7].id);
		await ask(t, { cmd: C.deleteNode, path: '/', id: sub });
		await t.idle();
		st = await t.J(sub => [bg().app.node.children.length, !!S.bm.children[0].children[0].children.find(c => c.id === sub)], sub);
		t.check('deleteNode removes the tile and the bookmarks folder', t.same(st, [7, false]), st);
		await ask(t, { cmd: C.updateNode, id: 'f1', value: { title: 'Folder', image: pic } });
		await t.idle();
		await ask(t, { cmd: C.refreshNode, path: '/', id: 'f1' });
		await t.idle();
		st = { node: await node(t, 'f1'), key: await t.J(() => 'img_f1' in S.storage) };
		t.check('refreshNode on a folder clears its picture (back to the folder icon)', !st.node.image && !st.key, st);

		st = await ask(t, { cmd: C.getImages, ids: ['b1', 'b3'] });
		t.check('getImages answers the pictures there are', Object.keys(st).join() === 'b1' && st.b1.startsWith('data:image/'), Object.keys(st));
		const backup = await ask(t, { cmd: C.exportData });
		t.check('exportData', backup.format === 'quickdial-ng' && backup.images.b1, Object.keys(backup));
		st = await ask(t, { cmd: C.importData, data: backup });
		await t.idle();
		t.check('importData answers what it did', st.ok && st.matched === 9 && st.created === 0, st);
		st = await ask(t, { cmd: C.importData, data: { nothing: true } }).catch(e => 'refused: ' + e.message.split('\n')[0]);
		t.check('importData refuses what isn\'t a backup', /Not a Quick Dial backup/.test(st), st);
		st = await ask(t, { cmd: C.setThemes, themes: [{ name: 'Mine', style: {} }, { name: 'Anori', style: {} }] });
		const listed = await ask(t, { cmd: C.getThemes });
		t.check('setThemes answers the cleaned list; getThemes', t.same(st.map(x => x.name), ['Mine']) && t.same(listed.map(x => x.name), ['Mine']), [st, listed]);
		await spyTabs(t);
		await ask(t, { cmd: C.openSettings, tab: 'themes' });
		st = await t.J(() => bg().qdTabs);
		t.check('openSettings', t.same(st, [['create', { url: 'html/settings.html?tab=themes' }]]), st);

		// setSettings: a new root folder brings its own tiles (pictures of the old ones go), then back
		const settings = await ask(t, { cmd: C.getSettings });
		settings.grid.root = 'Other';
		st = await ask(t, { cmd: C.setSettings, settings });
		await t.idle();
		const other = await t.J(() => ({ id: bg().app.node.id, tiles: bg().app.node.children.length, images: Object.keys(S.storage).filter(k => k.startsWith('img_')).length }));
		settings.grid.root = 'Quick Dial';
		await ask(t, { cmd: C.setSettings, settings });
		await t.idle();
		const back = await t.J(() => ({ id: bg().app.node.id, tiles: bg().app.node.children.length }));
		t.check('setSettings with another root folder shows that folder\'s tiles, and back', st.grid.root === 'Other' && other.id === 'other' && other.tiles === 0 && other.images === 0 && back.id === 'qd' && back.tiles === 7, [other, back]);
	}
};
