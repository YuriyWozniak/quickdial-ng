// Backups: export and import of settings, tiles, pictures and themes, and imports of the original Quick Dial's data.
'use strict';
const { freshProfile, makeVersion4, pictures } = require('../lib/fixtures');

module.exports = {
	title: 'Export, import, original Quick Dial exports, themes in backups',
	async run(t) {
		await freshProfile(t);
		await makeVersion4(t);
		await t.loadBg();

		const exp = await t.J(() => bg().app.Backup.export());
		t.check('an export has the 7 pictures', Object.keys(exp.images).length === 7, Object.keys(exp.images));
		await t.J(() => { S.storage = {}; });
		await t.loadBg();
		let r = await t.J(data => bg().app.Backup.import(data), exp);
		await t.idle();
		let st = await t.J(() => Object.keys(S.storage).filter(k => k.startsWith('img_')).length);
		t.check('importing it into an empty profile restores the 7 pictures', st === 7 && r.matched === 8 && r.created === 0, [st, r]);
		st = await t.J(() => bg().app.Backup.import({ settings: {} }).then(() => 'imported', e => e.message));
		t.check('data that is not a backup is refused', st === 'Not a Quick Dial backup', st);

		// An original Quick Dial export from another profile: its bookmark ids don't exist here
		await t.J(() => bg().browser.bookmarks.removeTree('f1'));
		await t.idle();
		const settings = await t.J(() => S.storage.settings);
		settings.startpageTimeout = 500; // the obsolete start page timer: dropped on import
		settings.grid = { ...settings.grid, columns: 7, cells: { ...settings.grid.cells, titleColor: '#ff0000' } };
		delete settings.grid.cells.snapshotDelay;
		const [img1, img2, img3] = await pictures(t, 3);
		const original = { version: 4, settings, node: { id: 'oldroot', type: 1, title: 'Quick Dial', children: [
			{ id: 'x1', type: 2, title: 'Site 1', url: 'https://site1.example/', image: img1, imageLocked: true, imageMode: 2 },
			{ type: 0 }, null,
			{ id: 'x9', type: 2, title: 'New 9', url: 'https://new9.example/', image: 'url(' + img2 + ')', __isLoading: true },
			{ id: 'xf', type: 1, title: 'Folder', children: [{ type: 0 }, { id: 'x7', type: 2, title: 'Site 7', url: 'https://site7.example/', image: img3 }, { id: 'x10', type: 2, title: 'New 10', url: 'https://new10.example/' }] },
			{ id: 'xg', type: 1, title: 'Brand new', children: [{ id: 'x11', type: 2, title: 'New 11', url: 'https://new11.example/' }] }] } };
		r = await t.J(data => bg().app.Backup.import(data), original);
		await t.idle();
		t.check('the import reports what it did', r && r.ok && r.tiles === 5 && r.folders === 2 && r.matched === 1 && r.created === 6 && r.images === 3, r);
		st = await t.J(() => {
			const qd = S.bm.children[0].children.find(c => c.id === 'qd'), n = S.storage.node;
			const urls = f => (f.children || []).map(c => c.url || ('[' + c.title + ']'));
			return { rootId: n.id, c0: n.children[0], c3: n.children[3], c4: n.children[4], c5: n.children[5],
				qd: urls(qd), f: urls(qd.children.find(c => c.title === 'Folder') || {}), g: urls(qd.children.find(c => c.title === 'Brand new') || {}),
				imgs: Object.keys(S.storage).filter(k => k.startsWith('img_')).sort(), s: S.storage.settings };
		});
		t.check('a matching tile reuses bookmark b1 at cell 0 with its options', st.c0.id === 'b1' && st.c0.imageLocked && st.c0.imageMode === 2 && st.c0.image === '1', st.c0);
		t.check('a missing bookmark is created at cell 3', st.c3.url === 'https://new9.example/' && st.qd.includes('https://new9.example/') && st.c3.image === '1' && !('__isLoading' in st.c3), st.c3);
		t.check('a folder is recreated at cell 4, keeping its inner gap', st.c4.type === 1 && st.c4.children[0].type === 0 && st.c4.children[1].url === 'https://site7.example/' && t.same(st.f, ['https://site7.example/', 'https://new10.example/']), [st.c4, st.f]);
		t.check('a new folder at cell 5 with its bookmark', st.c5.title === 'Brand new' && t.same(st.g, ['https://new11.example/']), st.g);
		t.check('the tiles are linked to the Quick Dial folder', st.rootId === 'qd', st.rootId);
		t.check('the pictures follow their tiles (3, under the new ids)', st.imgs.length === 3 && st.imgs.includes('img_b1') && st.imgs.includes('img_' + st.c3.id) && st.imgs.includes('img_' + st.c4.children[1].id), st.imgs);
		t.check('style and grid imported, missing fields defaulted, obsolete ones dropped', st.s.grid.columns === 7 && st.s.grid.cells.titleColor === '#ff0000' && st.s.grid.cells.snapshotDelay === 2000 && !('startpageTimeout' in st.s), st.s.grid);
		r = await t.J(data => bg().app.Backup.import(data), original);
		await t.idle();
		t.check('importing the same export again matches everything and creates nothing', r.created === 0 && r.matched === 7, r);

		// Themes travel with backups; style values from a backup are cleaned
		await t.J(() => bg().app.Themes.save([{ name: 'Mine', style: { backgroundColor: '#112233' } }]));
		const bk = await t.J(() => bg().app.Backup.export());
		t.check('a backup carries the custom themes', bk.themes && bk.themes.length === 1 && bk.themes[0].name === 'Mine', bk.themes);
		bk.themes.push({ name: 'From backup', style: { accentColor: '#aa0000' } });
		bk.settings.backgroundGradient = 'url(https://evil.example/)';
		await t.J(() => bg().app.Themes.save([{ name: 'mine', description: 'changed here', style: {} }, { name: 'Local only', style: {} }]));
		await t.J(data => bg().app.Backup.import(data), bk);
		await t.idle();
		st = await t.J(() => ({ themes: bg().app.Themes.list.map(t => t.name + ':' + (t.description || '')), grad: bg().app.settings.backgroundGradient, stored: S.storage.themes.length }));
		t.check('importing it adds its themes (the same name: replaced) and cleans style values', t.same(st.themes.sort(), ['From backup:', 'Local only:', 'Mine:']) && st.grad === null && st.stored === 3, st);
	}
};
