// Bookmark sync (js/background/bookmarks.js, gridnodes.js): the tiles follow the Quick Dial bookmarks
// folder. Changes made there are synced and saved; changes elsewhere are ignored and write nothing.
//
// Starts from: the standard bookmarks (lib/fixtures.js), every tile with a stored picture (makeVersion4),
// so each step can check which pictures go. The changes are made through the bookmarks API, as the
// user would in Firefox's bookmark manager (except deleting a tile, which the dial asks the background
// page for); each step waits for the background page to be idle.
// The steps build on each other; the stored tiles (by bookmark id, '-' for a gap) go:
//   start               b1 b2 b3 b4 b5 b6 f1
//   b2 deleted          b1 -  b3 b4 b5 b6 f1
//   f1 removed          b1 -  b3 b4 b5 b6
//   new bookmark        b1 n  b3 b4 b5 b6
//   b4 moved out, back  b1 n  b3 -  b5 b6  ->  b1 n b3 b4 b5 b6
// Related: the same sync rules in isolation are unit tests (unit/gridnodes.test.js); a profile without
// the Quick Dial folder is in startup.js.
'use strict';
const { freshProfile, makeVersion4 } = require('../lib/fixtures');

// The stored tiles by bookmark id ('-' for a gap), and the stored picture keys (img_<id>)
const storedTiles = testPage => testPage.inHost(() => mockState.storage.node.children.map(tile => tile.id || '-'));
const pictureKeys = testPage => testPage.inHost(() => Object.keys(mockState.storage).filter(key => key.startsWith('img_')).sort());

module.exports = {
	title: 'Bookmark changes: created, renamed, re-addressed, moved, removed',
	async run(testPage) {
		await freshProfile(testPage);
		await makeVersion4(testPage); // every tile with a picture, to see which pictures go
		await testPage.loadBg();

		// ----- created and renamed -----
		await testPage.inHost(() => { mockState.writes = []; return backgroundPage().browser.bookmarks.create({ parentId: 'other', title: 'X', url: 'https://x.example/' }); });
		await testPage.idle();
		const writesForOther = await testPage.inHost(() => mockState.writes);
		testPage.check('a bookmark created outside the Quick Dial folder: nothing written', writesForOther.length === 0, writesForOther);
		await testPage.inHost(() => backgroundPage().browser.bookmarks.update('b1', { title: 'Renamed 1' }));
		await testPage.idle();
		const renamed = await testPage.inHost(() => ({ writes: mockState.writes.map(write => write.key), title: mockState.storage.node.children[0].title }));
		testPage.check('a tracked bookmark renamed: tile saved, pictures not rewritten', renamed.title === 'Renamed 1' && renamed.writes.includes('node') && !renamed.writes.some(key => key.startsWith('img_')), renamed);

		// ----- deleted, re-addressed, a folder removed, a gap filled -----
		await testPage.inHost(() => { mockState.removes = []; backgroundPage().app.GridNodes.deleteNode(backgroundPage().app.node, 'b2'); });
		await testPage.idle();
		const deleted = await testPage.inHost(() => ({ removes: mockState.removes, keys: Object.keys(mockState.storage), bookmarked: dialFolderBookmarks().some(bookmark => bookmark.id === 'b2') }));
		testPage.check('deleting a tile removes its picture and its bookmark', deleted.removes.includes('img_b2') && !deleted.keys.includes('img_b2') && !deleted.bookmarked, deleted);
		const tilesAfterDelete = await storedTiles(testPage);
		testPage.check('the deleted tile leaves a gap', testPage.same(tilesAfterDelete, ['b1', '-', 'b3', 'b4', 'b5', 'b6', 'f1']), tilesAfterDelete);

		await testPage.inHost(() => backgroundPage().browser.bookmarks.update('b3', { url: 'https://changed.example/' }));
		await testPage.idle();
		const readdressed = await testPage.inHost(() => ({ removed: mockState.removes, image: mockState.storage.node.children.find(tile => tile.id === 'b3').image }));
		testPage.check('a new address drops the old picture', readdressed.removed.includes('img_b3') && readdressed.image == null, readdressed);

		await testPage.inHost(() => backgroundPage().browser.bookmarks.removeTree('f1'));
		await testPage.idle();
		const keysAfterFolderRemoved = await pictureKeys(testPage);
		testPage.check('removing a folder drops the pictures inside it', !keysAfterFolderRemoved.includes('img_b7'), keysAfterFolderRemoved);
		const tilesAfterFolderRemoved = await storedTiles(testPage);
		testPage.check('the folder\'s tile is gone (no gap at the end)', testPage.same(tilesAfterFolderRemoved, ['b1', '-', 'b3', 'b4', 'b5', 'b6']), tilesAfterFolderRemoved);

		await testPage.inHost(() => backgroundPage().browser.bookmarks.create({ parentId: 'qd', title: 'New', url: 'https://new.example/' }));
		await testPage.idle();
		const tilesWithNew = await storedTiles(testPage);
		testPage.check('a new bookmark fills the first gap', tilesWithNew[1] !== '-' && tilesWithNew.length === 6, tilesWithNew);

		// ----- moved (bookmarks.onMoved): out of the folder, back in, elsewhere, within it -----
		await testPage.inHost(() => backgroundPage().browser.bookmarks.move('b4', { parentId: 'other' }));
		await testPage.idle();
		const movedOut = { tiles: await storedTiles(testPage), keys: await pictureKeys(testPage) };
		testPage.check('a bookmark moved out of the folder: its tile becomes a gap, its picture goes', movedOut.tiles[3] === '-' && !movedOut.keys.includes('img_b4'), movedOut);
		await testPage.inHost(() => backgroundPage().browser.bookmarks.move('b4', { parentId: 'qd' }));
		await testPage.idle();
		const movedBack = await storedTiles(testPage);
		testPage.check('a bookmark moved into the folder fills the gap', movedBack[3] === 'b4', movedBack);
		await testPage.inHost(() => {
			const bookmarks = backgroundPage().browser.bookmarks;
			mockState.writes = [];
			return bookmarks.create({ parentId: 'other', title: 'Y', url: 'https://y.example/' }).then(created => bookmarks.move(created.id, { parentId: 'other', index: 0 }));
		});
		await testPage.idle();
		const writesForMoveElsewhere = await testPage.inHost(() => mockState.writes.map(write => write.key));
		testPage.check('a move outside the folder: nothing written', writesForMoveElsewhere.length === 0, writesForMoveElsewhere);
		await testPage.inHost(() => backgroundPage().browser.bookmarks.move('b5', { parentId: 'qd', index: 0 }));
		await testPage.idle();
		const reordered = await storedTiles(testPage);
		testPage.check('a bookmark reordered inside the folder keeps its cell', reordered[4] === 'b5', reordered);
	}
};
