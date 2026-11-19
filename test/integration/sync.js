// The tiles follow the Quick Dial bookmarks folder: changes there are synced, changes elsewhere ignored.
'use strict';
const { freshProfile, makeVersion4 } = require('../lib/fixtures');

const tiles = t => t.J(() => S.storage.node.children.map(c => c.id || '-'));
const imageKeys = t => t.J(() => Object.keys(S.storage).filter(k => k.startsWith('img_')).sort());

module.exports = {
	title: 'Bookmark changes: created, renamed, re-addressed, moved, removed',
	async run(t) {
		await freshProfile(t);
		await makeVersion4(t); // every tile with a picture, to see which pictures go
		await t.loadBg();

		await t.J(() => { S.writes = []; return bg().browser.bookmarks.create({ parentId: 'other', title: 'X', url: 'https://x.example/' }); });
		await t.idle();
		let st = await t.J(() => S.writes);
		t.check('a bookmark created outside the Quick Dial folder: nothing written', st.length === 0, st);
		await t.J(() => bg().browser.bookmarks.update('b1', { title: 'Renamed 1' }));
		await t.idle();
		st = await t.J(() => ({ writes: S.writes.map(x => x.k), title: S.storage.node.children[0].title }));
		t.check('a tracked bookmark renamed: tile saved, pictures not rewritten', st.title === 'Renamed 1' && st.writes.includes('node') && !st.writes.some(k => k.startsWith('img_')), st);

		await t.J(() => { S.removes = []; bg().app.GridNodes.deleteNode(bg().app.node, 'b2'); });
		await t.idle();
		st = await t.J(() => ({ removes: S.removes, keys: Object.keys(S.storage), bookmark: S.bm.children[0].children[0].children.some(c => c.id === 'b2') }));
		t.check('deleting a tile removes its picture and its bookmark', st.removes.includes('img_b2') && !st.keys.includes('img_b2') && !st.bookmark, st);
		t.check('the deleted tile leaves a gap', t.same(await tiles(t), ['b1', '-', 'b3', 'b4', 'b5', 'b6', 'f1']), await tiles(t));

		await t.J(() => bg().browser.bookmarks.update('b3', { url: 'https://changed.example/' }));
		await t.idle();
		st = await t.J(() => ({ removed: S.removes, image: S.storage.node.children.find(n => n.id === 'b3').image }));
		t.check('a new address drops the old picture', st.removed.includes('img_b3') && st.image == null, st);

		await t.J(() => bg().browser.bookmarks.removeTree('f1'));
		await t.idle();
		t.check('removing a folder drops the pictures inside it', !(await imageKeys(t)).includes('img_b7'), await imageKeys(t));
		t.check('the folder\'s tile is gone (no gap at the end)', t.same(await tiles(t), ['b1', '-', 'b3', 'b4', 'b5', 'b6']), await tiles(t));

		await t.J(() => bg().browser.bookmarks.create({ parentId: 'qd', title: 'New', url: 'https://new.example/' }));
		await t.idle();
		st = await tiles(t);
		t.check('a new bookmark fills the first gap', st[1] !== '-' && st.length === 6, st);

		// Moves (bookmarks.onMoved)
		await t.J(() => bg().browser.bookmarks.move('b4', { parentId: 'other' }));
		await t.idle();
		st = { tiles: await tiles(t), keys: await imageKeys(t) };
		t.check('a bookmark moved out of the folder: its tile becomes a gap, its picture goes', st.tiles[3] === '-' && !st.keys.includes('img_b4'), st);
		await t.J(() => bg().browser.bookmarks.move('b4', { parentId: 'qd' }));
		await t.idle();
		st = await tiles(t);
		t.check('a bookmark moved into the folder fills the gap', st[3] === 'b4', st);
		await t.J(() => { S.writes = []; return bg().browser.bookmarks.create({ parentId: 'other', title: 'Y', url: 'https://y.example/' }).then(b => bg().browser.bookmarks.move(b.id, { parentId: 'other', index: 0 })); });
		await t.idle();
		st = await t.J(() => S.writes.map(w => w.k));
		t.check('a move outside the folder: nothing written', st.length === 0, st);
		await t.J(() => bg().browser.bookmarks.move('b5', { parentId: 'qd', index: 0 }));
		await t.idle();
		st = await tiles(t);
		t.check('a bookmark reordered inside the folder keeps its cell', st[4] === 'b5', st);
	}
};
