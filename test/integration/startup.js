// Install, upgrade and restart: what the background page stores when it starts.
'use strict';
const { freshProfile, makeVersion4 } = require('../lib/fixtures');

module.exports = {
	title: 'Fresh install, upgrades from older versions, restarts that write nothing',
	async run(t) {
		await freshProfile(t);
		let st = await t.J(() => ({ keys: Object.keys(S.storage), tiles: S.storage.node.children.length }));
		t.check('fresh install stores version, settings and tiles', ['version', 'settings', 'node'].every(k => st.keys.includes(k)), st.keys);
		t.check('first sync made a tile for each of the 7 bookmarks and folders', st.tiles === 7, st.tiles);
		st = await t.J(() => { const s = S.storage.settings, c = s.grid.cells; return { action: s.toolbarAction, old: 'openQuickDialInNewPage' in s, glass: c.backgroundOpacity, effect: c.hoverEffect, font: c.titleFont, accent: s.accentColor }; });
		t.check('new installs: the toolbar button opens Settings', st.action === 'settings' && !st.old, st);
		t.check('style keys added in 0.4.0 start at their Classic values', st.glass === 1 && st.effect === 0 && st.font === 'Arial, Verdana, Sans-serif' && st.accent === null, st);

		// Data of the original Quick Dial: pictures inline in the tile tree, as PNG
		const v4size = await makeVersion4(t);
		await t.loadBg();
		st = await t.J(() => ({ version: S.storage.version, nodeLen: JSON.stringify(S.storage.node).length, imgKeys: Object.keys(S.storage).filter(k => k.startsWith('img_')).sort(),
			webp: Object.keys(S.storage).filter(k => k.startsWith('img_')).every(k => S.storage[k].startsWith('data:image/webp')), total: JSON.stringify(S.storage).length }));
		t.check('version 4 data is migrated to version 5', st.version === 5);
		t.check('the 7 pictures move to their own keys', t.same(st.imgKeys, ['img_b1', 'img_b2', 'img_b3', 'img_b4', 'img_b5', 'img_b6', 'img_b7']), st.imgKeys);
		t.check('the pictures are WebP', st.webp);
		t.check('the tile tree no longer holds pictures', st.nodeLen < 5000, st.nodeLen);
		t.log(`storage size v4 -> v5: ${v4size} -> ${st.total} (${(v4size / st.total).toFixed(1)}x smaller)`);

		await t.J(() => { S.writes = []; S.removes = []; });
		await t.loadBg();
		st = await t.J(() => [...S.writes, ...S.removes]);
		t.check('a restart with nothing changed writes nothing', st.length === 0, st);

		// The start page timer (before 0.3.5) is dropped from storage once
		await t.J(() => { S.storage.settings.startpageTimeout = 500; S.writes = []; });
		await t.loadBg();
		st = await t.J(() => ({ stored: 'startpageTimeout' in S.storage.settings, live: 'startpageTimeout' in bg().app.settings, writes: S.writes.map(w => w.k) }));
		t.check('the obsolete startpageTimeout is dropped and saved once', !st.stored && !st.live && st.writes.includes('settings'), st);
		await t.J(() => { S.writes = []; });
		await t.loadBg();
		st = await t.J(() => S.writes.map(w => w.k));
		t.check('the start after that writes nothing again', st.length === 0, st);

		// 0.5.0: the toolbar switch (dial in a new tab or this tab) becomes toolbarAction; existing installs keep what they had
		for (const [old, want] of [[true, 'newtab'], [false, 'current']]) {
			await t.J(old => { const s = S.storage.settings; delete s.toolbarAction; s.openQuickDialInNewPage = old; S.writes = []; }, old);
			await t.loadBg();
			st = await t.J(() => ({ stored: S.storage.settings.toolbarAction, old: 'openQuickDialInNewPage' in S.storage.settings, writes: S.writes.map(w => w.k) }));
			t.check(`existing installs keep their toolbar button (${old} -> ${want}), saved once`, st.stored === want && !st.old && st.writes.includes('settings'), st);
		}
		await t.J(() => { S.writes = []; });
		await t.loadBg();
		st = await t.J(() => S.writes.map(w => w.k));
		t.check('the start after the toolbar change writes nothing', !st.includes('settings'), st);

		// A new profile has no Quick Dial folder: it is created (Firefox returns new folders without children)
		await t.J(() => { S.storage = {}; S.bm.children[0].children = S.bm.children[0].children.filter(c => c.id !== 'qd'); });
		await t.loadBg();
		await t.J(() => bg().browser.bookmarks.create({ parentId: S.bm.children[0].children.find(c => c.title === 'Quick Dial').id, title: 'Fresh', url: 'https://fresh.example/' }));
		await t.idle();
		st = await t.J(() => ({ syncing: !!bg().app.GridNodes._syncing, tiles: ((S.storage.node && S.storage.node.children) || []).map(c => c.url) }));
		t.check('a profile without the folder creates it and keeps syncing', !st.syncing && t.same(st.tiles, ['https://fresh.example/']), st);
	}
};
