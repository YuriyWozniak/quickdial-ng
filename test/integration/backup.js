// Backups (js/background/backup.js): export and import of settings, tiles, pictures and themes, and
// imports of the original Quick Dial's data. Calls app.Backup directly; the Settings page's Export and
// Import buttons around it are tested in settings-page.js, the importData message in messages.js.
//
// Starts from: the standard bookmarks (lib/fixtures.js) with every tile holding a picture (makeVersion4).
// The steps build on each other:
//   1. a background picture is set, then export, empty the storage, import: everything comes back (the
//      bookmarks stay as they were); the background travels inline and is stored under its own key again
//   2. the folder f1 (with b7) is removed, then an original Quick Dial export from another profile is
//      imported: its bookmark ids don't exist here, so tiles are matched by address or folder name,
//      or their bookmarks are created; importing it again creates nothing
//   3. themes: a backup carries the custom themes, importing one adds or replaces themes by name
// Related: how tiles are matched to bookmarks is also a unit test (unit/background.test.js).
'use strict';
const { freshProfile, makeVersion4, pictures } = require('../lib/fixtures');

// The node types of the original Quick Dial's data (QDCommon.NodeType)
const NodeType = { empty: 0, folder: 1, bookmark: 2 };
// What the background page imports from a backup; its answer
const importBackup = (testPage, backup) => testPage.inHost(data => backgroundPage().app.Backup.import(data), backup);
// The stored picture keys (one per tile with a picture)
const storedPictureKeys = testPage => testPage.inHost(() => Object.keys(mockState.storage).filter(key => key.startsWith('img_')).sort());

module.exports = {
	title: 'Export, import, original Quick Dial exports, themes in backups',
	async run(testPage) {
		await freshProfile(testPage);
		await makeVersion4(testPage);
		await testPage.loadBg();

		// ----- export, then import into an empty profile -----
		const background = 'url(' + (await pictures(testPage, 1))[0] + ')'; // a picture picked in Settings: stored under its own key
		await testPage.inHost(picture => backgroundPage().app.Settings.update(Object.assign(JSON.parse(JSON.stringify(backgroundPage().app.settings)), { backgroundImage: picture })), background);
		const exported = await testPage.inHost(() => backgroundPage().app.Backup.export());
		testPage.check('an export has the 7 pictures', Object.keys(exported.images).length === 7, Object.keys(exported.images));
		testPage.check('and the background picture inline in its settings', exported.settings.backgroundImage === background);
		await testPage.inHost(() => { mockState.storage = {}; });
		await testPage.loadBg();
		const restoreReport = await importBackup(testPage, exported);
		await testPage.idle();
		const restoredPictures = await storedPictureKeys(testPage);
		testPage.check('importing it into an empty profile restores the 7 pictures', restoredPictures.length === 7 && restoreReport.matched === 8 && restoreReport.created === 0, [restoredPictures, restoreReport]);
		const restoredBackground = await testPage.inHost(() => ({ key: mockState.storage.picture_background, stored: mockState.storage.settings.backgroundImage, shown: backgroundPage().app.settings.backgroundImage }));
		testPage.check('and the background under its own key', restoredBackground.key === background && restoredBackground.stored === '1' && restoredBackground.shown === background,
			[restoredBackground.stored, !!restoredBackground.key, (restoredBackground.shown || '').slice(0, 30)]);
		const notBackupOutcome = await testPage.inHost(() => backgroundPage().app.Backup.import({ settings: {} }).then(() => 'imported', error => error.message));
		testPage.check('data that is not a backup is refused', notBackupOutcome === 'Not a Quick Dial backup', notBackupOutcome);

		// ----- an original Quick Dial export from another profile: its bookmark ids don't exist here -----
		await testPage.inHost(() => backgroundPage().browser.bookmarks.removeTree('f1'));
		await testPage.idle();
		const settings = await testPage.inHost(() => mockState.storage.settings);
		settings.startpageTimeout = 500; // the obsolete start page timer: dropped on import
		settings.grid = { ...settings.grid, columns: 7, cells: { ...settings.grid.cells, titleColor: '#ff0000', previewWidth: 1200, previewHeight: 710 } }; // the fixed picture size: dropped too
		delete settings.grid.cells.snapshotDelay;
		const [picture1, picture2, picture3] = await pictures(testPage, 3);
		const originalExport = { version: 4, settings, node: { id: 'oldroot', type: NodeType.folder, title: 'Quick Dial', children: [
			{ id: 'x1', type: NodeType.bookmark, title: 'Site 1', url: 'https://site1.example/', image: picture1, imageLocked: true, imageMode: 2 },
			{ type: NodeType.empty }, null,
			{ id: 'x9', type: NodeType.bookmark, title: 'New 9', url: 'https://new9.example/', image: 'url(' + picture2 + ')', __isLoading: true },
			{ id: 'xf', type: NodeType.folder, title: 'Folder', children: [{ type: NodeType.empty }, { id: 'x7', type: NodeType.bookmark, title: 'Site 7', url: 'https://site7.example/', image: picture3 },
				{ id: 'x10', type: NodeType.bookmark, title: 'New 10', url: 'https://new10.example/' }] },
			{ id: 'xg', type: NodeType.folder, title: 'Brand new', children: [{ id: 'x11', type: NodeType.bookmark, title: 'New 11', url: 'https://new11.example/' }] }] } };
		const originalReport = await importBackup(testPage, originalExport);
		await testPage.idle();
		testPage.check('the import reports what it did', originalReport && originalReport.ok && originalReport.tiles === 5 && originalReport.folders === 2
			&& originalReport.matched === 1 && originalReport.created === 6 && originalReport.images === 3, originalReport);
		const imported = await testPage.inHost(() => {
			const dialFolder = mockState.bookmarkTree.children[0].children.find(child => child.id === 'qd'), storedRoot = mockState.storage.node;
			// The addresses in a bookmarks folder, with [title] for a folder
			const addressesIn = folder => (folder.children || []).map(child => child.url || ('[' + child.title + ']'));
			const subfolder = title => dialFolder.children.find(child => child.title === title) || {};
			return { rootId: storedRoot.id, tiles: storedRoot.children.slice(0, 6),
				dialFolder: addressesIn(dialFolder), folder: addressesIn(subfolder('Folder')), brandNew: addressesIn(subfolder('Brand new')),
				pictureKeys: Object.keys(mockState.storage).filter(key => key.startsWith('img_')).sort(), settings: mockState.storage.settings };
		});
		const [matchedTile, , , createdTile, folderTile, newFolderTile] = imported.tiles;
		testPage.check('a matching tile reuses bookmark b1 at cell 0 with its options', matchedTile.id === 'b1' && matchedTile.imageLocked && matchedTile.imageMode === 2 && matchedTile.image === '1', matchedTile);
		testPage.check('a missing bookmark is created at cell 3', createdTile.url === 'https://new9.example/' && imported.dialFolder.includes('https://new9.example/') && createdTile.image === '1' && !('__isLoading' in createdTile), createdTile);
		testPage.check('a folder is recreated at cell 4, keeping its inner gap', folderTile.type === NodeType.folder && folderTile.children[0].type === NodeType.empty
			&& folderTile.children[1].url === 'https://site7.example/' && testPage.same(imported.folder, ['https://site7.example/', 'https://new10.example/']), [folderTile, imported.folder]);
		testPage.check('a new folder at cell 5 with its bookmark', newFolderTile.title === 'Brand new' && testPage.same(imported.brandNew, ['https://new11.example/']), imported.brandNew);
		testPage.check('the tiles are linked to the Quick Dial folder', imported.rootId === 'qd', imported.rootId);
		testPage.check('the pictures follow their tiles (3, under the new ids)', imported.pictureKeys.length === 3 && imported.pictureKeys.includes('img_b1')
			&& imported.pictureKeys.includes('img_' + createdTile.id) && imported.pictureKeys.includes('img_' + folderTile.children[1].id), imported.pictureKeys);
		const importedGrid = imported.settings.grid;
		testPage.check('style and grid imported, missing fields defaulted, obsolete ones dropped', importedGrid.columns === 7 && importedGrid.cells.titleColor === '#ff0000'
			&& importedGrid.cells.snapshotDelay === 2000 && !('startpageTimeout' in imported.settings) && !('previewWidth' in importedGrid.cells) && !('previewHeight' in importedGrid.cells), importedGrid);
		const importedBackground = await testPage.inHost(() => ({ stored: mockState.storage.settings.backgroundImage, key: 'picture_background' in mockState.storage }));
		testPage.check('a stored-picture mark without its picture (copied from storage) imports as no background', importedBackground.stored === null && !importedBackground.key, importedBackground);
		const againReport = await importBackup(testPage, originalExport);
		await testPage.idle();
		testPage.check('importing the same export again matches everything and creates nothing', againReport.created === 0 && againReport.matched === 7, againReport);

		// ----- themes travel with backups; style values from a backup are cleaned -----
		await testPage.inHost(() => backgroundPage().app.Themes.save([{ name: 'Mine', style: { backgroundColor: '#112233' } }]));
		const backupWithThemes = await testPage.inHost(() => backgroundPage().app.Backup.export());
		testPage.check('a backup carries the custom themes', backupWithThemes.themes && backupWithThemes.themes.length === 1 && backupWithThemes.themes[0].name === 'Mine', backupWithThemes.themes);
		backupWithThemes.themes.push({ name: 'From backup', style: { accentColor: '#aa0000' } });
		backupWithThemes.settings.backgroundGradient = 'url(https://evil.example/)';
		await testPage.inHost(() => backgroundPage().app.Themes.save([{ name: 'mine', description: 'changed here', style: {} }, { name: 'Local only', style: {} }]));
		await importBackup(testPage, backupWithThemes);
		await testPage.idle();
		const themesAfter = await testPage.inHost(() => ({ themes: backgroundPage().app.Themes.list.map(theme => theme.name + ':' + (theme.description || '')),
			gradient: backgroundPage().app.settings.backgroundGradient, stored: mockState.storage.themes.length }));
		testPage.check('importing it adds its themes (the same name: replaced) and cleans style values', testPage.same(themesAfter.themes.sort(), ['From backup:', 'Local only:', 'Mine:'])
			&& themesAfter.gradient === null && themesAfter.stored === 3, themesAfter);
	}
};
