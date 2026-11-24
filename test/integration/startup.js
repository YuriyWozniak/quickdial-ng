// Install, upgrade and restart (js/background/settings.js, images.js): what the background page stores
// when it starts, and that a start with nothing to change writes nothing.
//
// Starts from: an empty profile with the standard bookmarks (lib/fixtures.js). Each "start" is a reload
// of the background page frame (testPage.loadBg), which keeps storage and bookmarks, as a browser restart does.
// The steps build on each other: the stored data is edited in place (mockState.storage) to look like what an
// older version left, then the background page is started again and its writes (mockState.writes) are checked.
// The last step empties storage and removes the Quick Dial folder (a brand-new profile).
// Related: the upgrade rules in isolation are unit tests (unit/settings.test.js); imports of older data
// are in backup.js.
'use strict';
const { freshProfile, makeVersion4 } = require('../lib/fixtures');

// The keys written to storage since the last forgetWrites
const writtenKeys = testPage => testPage.inHost(() => mockState.writes.map(write => write.key));
const forgetWrites = testPage => testPage.inHost(() => { mockState.writes = []; });
// The size the tile tree may have once the pictures are out of it
const TILE_TREE_WITHOUT_PICTURES = 5000;

module.exports = {
	title: 'Fresh install, upgrades from older versions, restarts that write nothing',
	async run(testPage) {
		// ----- a fresh install -----
		await freshProfile(testPage);
		const installed = await testPage.inHost(() => ({ keys: Object.keys(mockState.storage), tiles: mockState.storage.node.children.length }));
		testPage.check('fresh install stores version, settings and tiles', ['version', 'settings', 'node'].every(key => installed.keys.includes(key)), installed.keys);
		testPage.check('first sync made a tile for each of the 7 bookmarks and folders', installed.tiles === 7, installed.tiles);
		const newSettings = await testPage.inHost(() => {
			const settings = mockState.storage.settings, cells = settings.grid.cells;
			return { action: settings.toolbarAction, oldSwitch: 'openQuickDialInNewPage' in settings, glass: cells.backgroundOpacity, effect: cells.hoverEffect, font: cells.titleFont, accent: settings.accentColor };
		});
		testPage.check('new installs: the toolbar button opens Settings', newSettings.action === 'settings' && !newSettings.oldSwitch, newSettings);
		testPage.check('style keys added in 0.4.0 start at their Classic values', newSettings.glass === 1 && newSettings.effect === 0 && newSettings.font === 'Arial, Verdana, Sans-serif' && newSettings.accent === null, newSettings);

		// ----- data of the original Quick Dial (version 4): pictures inline in the tile tree, as PNG -----
		const version4Size = await makeVersion4(testPage);
		await testPage.loadBg();
		const migrated = await testPage.inHost(() => {
			const pictureKeys = Object.keys(mockState.storage).filter(key => key.startsWith('img_')).sort();
			return { version: mockState.storage.version, tileTreeSize: JSON.stringify(mockState.storage.node).length, pictureKeys,
				webp: pictureKeys.every(key => mockState.storage[key].startsWith('data:image/webp')), totalSize: JSON.stringify(mockState.storage).length };
		});
		testPage.check('version 4 data is migrated to version 5', migrated.version === 5);
		testPage.check('the 7 pictures move to their own keys', testPage.same(migrated.pictureKeys, ['img_b1', 'img_b2', 'img_b3', 'img_b4', 'img_b5', 'img_b6', 'img_b7']), migrated.pictureKeys);
		testPage.check('the pictures are WebP', migrated.webp);
		testPage.check('the tile tree no longer holds pictures', migrated.tileTreeSize < TILE_TREE_WITHOUT_PICTURES, migrated.tileTreeSize);
		testPage.log(`storage size v4 -> v5: ${version4Size} -> ${migrated.totalSize} (${(version4Size / migrated.totalSize).toFixed(1)}x smaller)`);

		// ----- a restart with nothing to change -----
		await testPage.inHost(() => { mockState.writes = []; mockState.removes = []; });
		await testPage.loadBg();
		const changes = await testPage.inHost(() => [...mockState.writes, ...mockState.removes]);
		testPage.check('a restart with nothing changed writes nothing', changes.length === 0, changes);

		// ----- obsolete settings: the start page timer (before 0.3.5) is dropped from storage once -----
		await testPage.inHost(() => { mockState.storage.settings.startpageTimeout = 500; mockState.writes = []; });
		await testPage.loadBg();
		const timerDropped = await testPage.inHost(() => ({ stored: 'startpageTimeout' in mockState.storage.settings, live: 'startpageTimeout' in backgroundPage().app.settings,
			writes: mockState.writes.map(write => write.key) }));
		testPage.check('the obsolete startpageTimeout is dropped and saved once', !timerDropped.stored && !timerDropped.live && timerDropped.writes.includes('settings'), timerDropped);
		await forgetWrites(testPage);
		await testPage.loadBg();
		const writesAfterDrop = await writtenKeys(testPage);
		testPage.check('the start after that writes nothing again', writesAfterDrop.length === 0, writesAfterDrop);

		// ----- 0.5.0: the toolbar switch (dial in a new tab or this tab) becomes toolbarAction; existing installs keep what they had -----
		for (const [inNewPage, expectedAction] of [[true, 'newtab'], [false, 'current']]) {
			await testPage.inHost(switchValue => {
				const settings = mockState.storage.settings;
				delete settings.toolbarAction;
				settings.openQuickDialInNewPage = switchValue;
				mockState.writes = [];
			}, inNewPage);
			await testPage.loadBg();
			const upgraded = await testPage.inHost(() => ({ stored: mockState.storage.settings.toolbarAction, oldSwitch: 'openQuickDialInNewPage' in mockState.storage.settings,
				writes: mockState.writes.map(write => write.key) }));
			testPage.check(`existing installs keep their toolbar button (${inNewPage} -> ${expectedAction}), saved once`, upgraded.stored === expectedAction && !upgraded.oldSwitch && upgraded.writes.includes('settings'), upgraded);
		}
		await forgetWrites(testPage);
		await testPage.loadBg();
		const writesAfterUpgrade = await writtenKeys(testPage);
		testPage.check('the start after the toolbar change writes nothing', !writesAfterUpgrade.includes('settings'), writesAfterUpgrade);

		// ----- a new profile has no Quick Dial folder: it is created (Firefox returns new folders without children) -----
		await testPage.inHost(() => {
			const menu = mockState.bookmarkTree.children[0];
			mockState.storage = {};
			menu.children = menu.children.filter(folder => folder.id !== 'qd');
		});
		await testPage.loadBg();
		await testPage.inHost(() => backgroundPage().browser.bookmarks.create({ parentId: mockState.bookmarkTree.children[0].children.find(folder => folder.title === 'Quick Dial').id,
			title: 'Fresh', url: 'https://fresh.example/' }));
		await testPage.idle();
		const newProfile = await testPage.inHost(() => ({ syncing: !!backgroundPage().app.GridNodes._syncing, tiles: ((mockState.storage.node && mockState.storage.node.children) || []).map(tile => tile.url) }));
		testPage.check('a profile without the folder creates it and keeps syncing', !newProfile.syncing && testPage.same(newProfile.tiles, ['https://fresh.example/']), newProfile);
	}
};
