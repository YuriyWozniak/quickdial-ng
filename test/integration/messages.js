// The background page's message API (js/background/messages.js), as the dial, Settings and Properties
// pages use it: every command they send (QDCommon.Commands in js/common.js), with what it answers and
// what it changes. The pages' own use of these messages is covered by their suites.
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js), no pictures, drawing pages
// works (stubDrawWindow, so a new address takes the stub page's title, its host). No page is open: the
// messages come from a sender made in the host page (makeBrowser), as from any extension page.
// The steps build on each other: b1 ends up "Mine" (locked) at https://moved.example/, b2 "two.example";
// b1 and b2 swap cells; a bookmark is added in the folder (f1); a folder "Sub" is made and deleted;
// the root folder is switched to "Other" and back.
'use strict';
const { freshProfile, spyTabs, stubDrawWindow, pictures } = require('../lib/fixtures');

// Sends a message to the background page as an extension page would, and returns the answer
const ask = (testPage, message) => testPage.inHost(sentMessage => {
	window.tester = window.tester || makeBrowser(window, 'tester');
	return tester.runtime.sendMessage(sentMessage);
}, message);
// The command numbers used here (QDCommon.Commands)
const Commands = { getSettings: 0, setSettings: 1, getNode: 2, getNodeById: 3, updateNode: 4, setNodeIndex: 5, createBookmark: 6, createFolder: 7, deleteNode: 8,
	refreshNode: 9, getImages: 11, exportData: 12, importData: 13, getThemes: 14, setThemes: 15, openSettings: 16 };
// How a picture fills its tile (QDCommon.ImageMode): inherit is the "Default" fit
const ImageMode = { inherit: -1, original: 3 };
// A node by id in the background page; a bookmark by id
const nodeById = (testPage, id) => testPage.inHost(nodeId => backgroundPage().app.GridNodes.getNodeById(nodeId), id);
const bookmarkById = (testPage, id) => testPage.inHost(bookmarkId => {
	const find = bookmark => bookmark.id === bookmarkId ? bookmark : (bookmark.children || []).map(find).find(Boolean);
	return find(mockState.bookmarkTree);
}, id);

module.exports = {
	title: 'Messages from the pages: read and change tiles, settings, pictures, themes, backups',
	async run(testPage) {
		await freshProfile(testPage);
		await stubDrawWindow(testPage);
		const [picture] = await pictures(testPage, 1);

		// ----- reading: settings, folders, tiles -----
		const settingsAnswer = await ask(testPage, { cmd: Commands.getSettings });
		testPage.check('getSettings', settingsAnswer.grid.rows === 4 && settingsAnswer.toolbarAction === 'settings', settingsAnswer.grid);
		const [rootNode, folderNode, missingNode] = [await ask(testPage, { cmd: Commands.getNode, path: '/' }), await ask(testPage, { cmd: Commands.getNode, path: '/Folder/' }),
			await ask(testPage, { cmd: Commands.getNode, path: '/Nope/' })];
		testPage.check('getNode: the root, a folder, a missing folder', rootNode.children.length === 7 && folderNode.children[0].id === 'b7' && missingNode === null,
			[rootNode, folderNode, missingNode].map(node => node && node.title));
		const nodeAnswer = await ask(testPage, { cmd: Commands.getNodeById, id: 'b7' });
		testPage.check('getNodeById', nodeAnswer.title === 'Site 7', nodeAnswer);

		// ----- updateNode: what the Properties page sends -----
		const found = await ask(testPage, { cmd: Commands.updateNode, id: 'b1', value: { title: 'Mine', titleLocked: true, imageLocked: true, image: picture, imageMode: ImageMode.original, url: 'https://site1.example/' } });
		await testPage.idle();
		const updated = { node: await nodeById(testPage, 'b1'), bookmark: await bookmarkById(testPage, 'b1'), stored: await testPage.inHost(() => (mockState.storage.img_b1 || '').slice(0, 15)) };
		testPage.check('updateNode sets the title, locks, fit and picture, and renames the bookmark', found === true && updated.node.title === 'Mine' && updated.node.titleLocked
			&& updated.node.imageLocked && updated.node.imageMode === ImageMode.original && updated.node.image === '1' && updated.stored === 'data:image/png;' && updated.bookmark.title === 'Mine', updated);
		const goneAnswer = await ask(testPage, { cmd: Commands.updateNode, id: 'gone', value: { title: 'X' } });
		testPage.check('updateNode for a tile that is gone answers false (the Properties page shows it was deleted)', goneAnswer === false, goneAnswer);
		await ask(testPage, { cmd: Commands.updateNode, id: 'b1', value: { title: 'Mine', image: null, imageMode: ImageMode.inherit } });
		await testPage.idle();
		const keptPicture = await nodeById(testPage, 'b1');
		testPage.check('a kept picture stays when the page sends none; fit -1 goes back to the default', keptPicture.image === '1' && !('imageMode' in keptPicture), keptPicture);
		await ask(testPage, { cmd: Commands.updateNode, id: 'b1', value: { title: 'Mine', url: 'https://moved.example/' } });
		await testPage.waitFor('the new address to be fetched', () => !backgroundPage().app.GridNodes.getNodeById('b1').__isLoading && dialFolderBookmarks()[0].url === 'https://moved.example/');
		const moved = { node: await nodeById(testPage, 'b1'), bookmark: await bookmarkById(testPage, 'b1') };
		testPage.check('a new address is saved to the bookmark; a locked title and picture are kept', moved.node.url === 'https://moved.example/' && moved.node.title === 'Mine'
			&& moved.node.image === '1' && moved.bookmark.url === 'https://moved.example/' && moved.bookmark.title === 'Mine', moved);
		await ask(testPage, { cmd: Commands.updateNode, id: 'b2', value: { title: 'Two', url: 'https://two.example/', image: null } });
		await testPage.waitFor('the new address to be fetched', () => backgroundPage().app.GridNodes.getNodeById('b2').image === '1');
		const unlocked = await nodeById(testPage, 'b2');
		testPage.check('...an unlocked tile takes the new page\'s title and picture', unlocked.title === 'two.example' && unlocked.url === 'https://two.example/', unlocked);

		// ----- tiles: swap, create, delete, refresh a folder -----
		await ask(testPage, { cmd: Commands.setNodeIndex, path: '/', index: 0, newIndex: 1 });
		await testPage.idle();
		const swappedIds = await testPage.inHost(() => mockState.storage.node.children.slice(0, 2).map(tile => tile.id));
		testPage.check('setNodeIndex swaps two tiles', testPage.same(swappedIds, ['b2', 'b1']), swappedIds);
		await ask(testPage, { cmd: Commands.createBookmark, path: '/Folder/', url: 'folder-site.example', title: 'folder-site.example' });
		await ask(testPage, { cmd: Commands.createFolder, path: '/', name: 'Sub' });
		await testPage.idle();
		const created = await testPage.inHost(() => ({ folder: backgroundPage().app.node.children[6].children.map(tile => tile.url), root: backgroundPage().app.node.children.map(tile => tile.title).slice(-1),
			bookmarks: dialFolderBookmarks().map(bookmark => bookmark.title).slice(-1) }));
		testPage.check('createBookmark (in a folder, http:// added) and createFolder', testPage.same(created.folder, ['https://site7.example/', 'http://folder-site.example'])
			&& testPage.same(created.root, ['Sub']) && testPage.same(created.bookmarks, ['Sub']), created);
		const subfolderId = await testPage.inHost(() => backgroundPage().app.node.children[7].id);
		await ask(testPage, { cmd: Commands.deleteNode, path: '/', id: subfolderId });
		await testPage.idle();
		const afterDelete = await testPage.inHost(id => ({ tiles: backgroundPage().app.node.children.length, bookmarked: !!dialFolderBookmarks().find(bookmark => bookmark.id === id) }), subfolderId);
		testPage.check('deleteNode removes the tile and the bookmarks folder', afterDelete.tiles === 7 && !afterDelete.bookmarked, afterDelete);
		await ask(testPage, { cmd: Commands.updateNode, id: 'f1', value: { title: 'Folder', image: picture } });
		await testPage.idle();
		await ask(testPage, { cmd: Commands.refreshNode, path: '/', id: 'f1' });
		await testPage.idle();
		const refreshedFolder = { node: await nodeById(testPage, 'f1'), key: await testPage.inHost(() => 'img_f1' in mockState.storage) };
		testPage.check('refreshNode on a folder clears its picture (back to the folder icon)', !refreshedFolder.node.image && !refreshedFolder.key, refreshedFolder);

		// ----- pictures, backups, themes, the Settings tab -----
		const imagesAnswer = await ask(testPage, { cmd: Commands.getImages, ids: ['b1', 'b3'] });
		testPage.check('getImages answers the pictures there are', Object.keys(imagesAnswer).join() === 'b1' && imagesAnswer.b1.startsWith('data:image/'), Object.keys(imagesAnswer));
		const backup = await ask(testPage, { cmd: Commands.exportData });
		testPage.check('exportData', backup.format === 'quickdial-ng' && backup.images.b1, Object.keys(backup));
		const importReport = await ask(testPage, { cmd: Commands.importData, data: backup });
		await testPage.idle();
		testPage.check('importData answers what it did', importReport.ok && importReport.matched === 9 && importReport.created === 0, importReport);
		const refusal = await ask(testPage, { cmd: Commands.importData, data: { nothing: true } }).catch(error => 'refused: ' + error.message.split('\n')[0]);
		testPage.check('importData refuses what isn\'t a backup', /Not a Quick Dial backup/.test(refusal), refusal);
		const savedThemes = await ask(testPage, { cmd: Commands.setThemes, themes: [{ name: 'Mine', style: {} }, { name: 'Anori', style: {} }] });
		const listedThemes = await ask(testPage, { cmd: Commands.getThemes });
		testPage.check('setThemes answers the cleaned list; getThemes', testPage.same(savedThemes.map(theme => theme.name), ['Mine']) && testPage.same(listedThemes.map(theme => theme.name), ['Mine']), [savedThemes, listedThemes]);
		await spyTabs(testPage);
		await ask(testPage, { cmd: Commands.openSettings, tab: 'themes' });
		const openedTabs = await testPage.inHost(() => backgroundPage().qdTabs);
		testPage.check('openSettings', testPage.same(openedTabs, [['create', { url: 'html/settings.html?tab=themes' }]]), openedTabs);

		// ----- setSettings: a new root folder brings its own tiles (pictures of the old ones go), then back -----
		const settings = await ask(testPage, { cmd: Commands.getSettings });
		settings.grid.root = 'Other';
		const setAnswer = await ask(testPage, { cmd: Commands.setSettings, settings });
		await testPage.idle();
		const otherRoot = await testPage.inHost(() => ({ id: backgroundPage().app.node.id, tiles: backgroundPage().app.node.children.length,
			images: Object.keys(mockState.storage).filter(key => key.startsWith('img_')).length }));
		settings.grid.root = 'Quick Dial';
		await ask(testPage, { cmd: Commands.setSettings, settings });
		await testPage.idle();
		const rootAgain = await testPage.inHost(() => ({ id: backgroundPage().app.node.id, tiles: backgroundPage().app.node.children.length }));
		testPage.check('setSettings with another root folder shows that folder\'s tiles, and back', setAnswer.grid.root === 'Other' && otherRoot.id === 'other' && otherRoot.tiles === 0
			&& otherRoot.images === 0 && rootAgain.id === 'qd' && rootAgain.tiles === 7, [otherRoot, rootAgain]);
	}
};
