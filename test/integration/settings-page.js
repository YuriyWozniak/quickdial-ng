// The Settings page (html/settings.html, js/settings.js; its own tab since 0.5.0): sections, Apply /
// Discard / Ctrl+S, the background picture, and the buttons of the Backup and Themes sections.
// It is used as the user would: clicks, typing, files chosen (setInputFiles), dialogs answered (testPage.answer),
// downloads caught (testPage.download). The page is opened in the "dial" frame (testPage.loadSettings).
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js), Classic look, no themes.
// The steps build on each other:
//   1. the form: rows end up at 3 and the toolbar button back at "settings"
//   2. a background picture applied (as a smaller WebP), then cleared; a folder picture applied, then reset
//   3. Backup: export; wrong files refused; the export imported (with rows changed to 2), first
//      cancelled, then done; the export snippet copied
//   4. Themes: "Saved one" saved (and replaced), exports, "Classic (imported)" imported then deleted
//   5. Tiles: New tiles get starts at a screenshot; Apply to tiles asks first, and Cancel changes nothing
// Related: what the import itself does is in backup.js; Use / Apply of a theme is in themes.js.
'use strict';
const { BUILTIN_THEMES, freshProfile, changeSettings, pictures } = require('../lib/fixtures');

// A JSON file for setInputFiles
const jsonFile = (name, data) => ({ name, mimeType: 'application/json', buffer: Buffer.from(typeof data == 'string' ? data : JSON.stringify(data)) });
// A PNG data URL as a file for setInputFiles
const pngFile = (name, dataUrl) => ({ name, mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
// The text of a status line (empty while hidden)
const statusText = (testPage, id) => testPage.inDial(elementId => { const line = document.getElementById(elementId); return line.hidden ? '' : line.textContent; }, id);
// The theme card names
const themeNames = testPage => testPage.inDial(() => [...document.querySelectorAll('.qd-theme .qd-theme-name')].map(heading => heading.firstChild.textContent));
// The card of a theme whose name starts with `name` (a regular expression)
const themeCard = (testPage, name) => testPage.dial().locator('.qd-theme', { has: testPage.dial().locator('.qd-theme-name', { hasText: new RegExp('^' + name) }) });
// The size of a picture in a settings value (url("data:...")), as [width, height]
const pictureSize = (testPage, cssValue) => testPage.inHost(value => new Promise(resolve => {
	const image = new Image();
	image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
	image.onerror = () => resolve(null);
	image.src = value.replace(/^url\("?|"?\)$/g, '');
}), cssValue);

// The click effect "Ripple" (QDThemes.ClickEffect), as the list's value
const RIPPLE = '3';
// What new tiles get (QDCommon.TilePicture), as the list's values, and how many choices the list has
const TILE_PICTURE = { page: '0', siteIconOrPage: '2' }, TILE_PICTURE_CHOICES = 3;
// The command the background page sends an open Settings page to show a section (js/settings.js)
const SHOW_SETTINGS_TAB = 209;
// A background picture larger than the limit (2560 pixels wide), and what it is made into
const BIG_PICTURE = { width: 3200, height: 1600 }, BACKGROUND_LIMITED = [2560, 1280];

module.exports = {
	title: 'Settings: sections, Apply / Discard / Ctrl+S, backup and theme buttons',
	async run(testPage) {
		await freshProfile(testPage);

		// ----- sections and the form -----
		await testPage.loadSettings('grid');
		const form = () => testPage.inDial(() => ({ title: PanelTitle.textContent, grid: !TabGrid.hidden, rows: GridRows.value, toolbar: ToolbarAction.value,
			apply: BtnApply.disabled, discard: BtnDiscard.disabled, url: location.search }));
		const opened = await form();
		testPage.check('?tab= opens that section, with nothing to apply', opened.title === 'Grid' && opened.grid && opened.toolbar === 'settings' && opened.apply && opened.discard, opened);
		const rowsInUse = opened.rows;
		await testPage.dial().locator('#GridRows').fill('9');
		const edited = await form();
		testPage.check('an edit enables Apply and Discard', !edited.apply && !edited.discard && edited.rows === '9', edited);
		await testPage.dial().locator('#BtnDiscard').click();
		const discarded = await form();
		testPage.check('Discard brings back what the dial uses', discarded.rows === rowsInUse && discarded.apply && discarded.discard
			&& String(await testPage.inHost(() => backgroundPage().app.settings.grid.rows)) === rowsInUse, discarded);
		await testPage.dial().locator('#GridRows').fill('6');
		await testPage.dial().locator('#GridRows').press('Control+s');
		await testPage.waitFor('Ctrl+S to apply', () => backgroundPage().app.settings.grid.rows === 6);
		testPage.check('Ctrl+S applies', (await form()).apply);
		await changeSettings(testPage, { grid: { rows: 3 }, toolbarAction: 'current' });
		await testPage.waitFor('the open Settings page to follow', () => frameWindow('dial').GridRows.value === '3');
		const appliedElsewhere = await form();
		testPage.check('settings applied elsewhere show up while nothing is pending', appliedElsewhere.rows === '3' && appliedElsewhere.toolbar === 'current', appliedElsewhere);
		await testPage.dial().locator('#TabTilesButton').click();
		await testPage.inHost(command => fireEvent('rt.onMessage.dial', { cmd: command, tab: 'themes' }, {}, () => {}), SHOW_SETTINGS_TAB);
		const switched = await testPage.inDial(() => ({ themes: !TabThemes.hidden, title: PanelTitle.textContent, url: location.search }));
		testPage.check('an open Settings page switches to the section asked for', switched.themes && switched.title === 'Themes' && switched.url === '?tab=themes', switched);
		await changeSettings(testPage, { toolbarAction: 'settings' });

		// ----- the click effect: picked from the list, it plays on the sample tile and is applied like the rest -----
		await testPage.loadSettings('tiles');
		await testPage.dial().locator('#GridCellsClickEffect').selectOption(RIPPLE);
		const picked = await testPage.inDial(() => ({ playing: TileHover.classList.contains('is-clicked'), css: app.clickEffectStyle.textContent, apply: BtnApply.disabled }));
		testPage.check('a click effect picked plays on the Hover sample, with its rules', picked.playing && picked.css.includes('qd-click-ripple') && !picked.apply, picked);
		await testPage.waitFor('the effect to end', () => !frameWindow('dial').TileHover.classList.contains('is-clicked'));
		await testPage.dial().locator('#TileNormal').click();
		testPage.check('clicking a sample tile plays it again', await testPage.inDial(() => TileNormal.classList.contains('is-clicked')));
		await testPage.dial().locator('#GridCellsClickEffect').press('Control+s');
		await testPage.waitFor('Ctrl+S to apply', effect => backgroundPage().app.settings.grid.cells.clickEffect === effect, +RIPPLE);
		testPage.check('the click effect is applied to the dial settings', true);
		await changeSettings(testPage, { grid: { cells: { clickEffect: 0 } } });

		// ----- the background picture: from a file (made WebP and smaller), then cleared; a folder picture -----
		await testPage.loadSettings('page');
		const bigPicture = await testPage.inHost(({ width, height }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width; canvas.height = height;
			const context = canvas.getContext('2d'), gradient = context.createLinearGradient(0, 0, width, height);
			gradient.addColorStop(0, '#246'); gradient.addColorStop(1, '#c84');
			context.fillStyle = gradient; context.fillRect(0, 0, width, height);
			return canvas.toDataURL('image/png');
		}, BIG_PICTURE);
		await testPage.dial().locator('#BackgroundImageFile').setInputFiles(pngFile('bg.png', bigPicture));
		await testPage.waitFor('the picture to be read', () => !frameWindow('dial').BtnApply.disabled);
		await testPage.dial().locator('#BtnApply').click();
		await testPage.waitFor('the picture to be applied', () => /^url\("?data:/.test(backgroundPage().app.settings.backgroundImage || ''));
		const backgroundPicture = await testPage.inHost(() => backgroundPage().app.settings.backgroundImage);
		const backgroundSize = await pictureSize(testPage, backgroundPicture);
		testPage.check('a background picture from a file is stored as WebP, at most 2560 pixels wide', backgroundPicture.startsWith('url("data:image/webp')
			&& testPage.same(backgroundSize, BACKGROUND_LIMITED), [backgroundPicture.slice(0, 30), backgroundSize]);
		await testPage.dial().locator('#BackgroundImageClear').click();
		await testPage.dial().locator('#BtnApply').click();
		await testPage.waitFor('the picture to be cleared', () => backgroundPage().app.settings.backgroundImage === null);
		testPage.check('Clear removes the background picture', true);
		await testPage.loadSettings('grid');
		const [png] = await pictures(testPage, 1);
		await testPage.dial().locator('#GridFolderImageFile').setInputFiles(pngFile('folder.png', png));
		await testPage.waitFor('the picture to be read', () => !frameWindow('dial').BtnApply.disabled);
		await testPage.dial().locator('#BtnApply').click();
		await testPage.waitFor('the picture to be applied', () => /^url\("?data:/.test(backgroundPage().app.settings.grid.folderIcon || ''));
		const folderPicture = await testPage.inHost(() => backgroundPage().app.settings.grid.folderIcon);
		const folderPictureSize = await pictureSize(testPage, folderPicture);
		testPage.check('a folder picture from a file is stored as WebP', folderPicture.startsWith('url("data:image/webp') && testPage.same(folderPictureSize, [320, 240]), [folderPicture.slice(0, 30), folderPictureSize]);
		await testPage.dial().locator('#GridFolderImageReset').click();
		await testPage.dial().locator('#BtnApply').click();
		await testPage.waitFor('the built-in folder picture', () => backgroundPage().app.settings.grid.folderIcon === 'url(/img/folder.svg)');

		// ----- Backup -----
		await testPage.loadSettings('backup');
		const backupSection = await testPage.inDial(() => ({ shown: !TabBackup.hidden, selected: TabBackupButton.getAttribute('aria-selected'),
			importButton: !!document.getElementById('BtnImport'), copyButton: !!document.getElementById('BtnCopySnippet') }));
		testPage.check('?tab=backup opens the Backup section with its buttons', backupSection.shown && backupSection.selected === 'true' && backupSection.importButton && backupSection.copyButton, backupSection);
		const exportFile = await testPage.download(() => testPage.dial().locator('#BtnExport').click());
		const backup = JSON.parse(exportFile.text);
		testPage.check('Export downloads a dated backup file', /^quickdial-ng-backup-\d{4}-\d\d-\d\d\.json$/.test(exportFile.name) && backup.format === 'quickdial-ng'
			&& backup.node.children.length === 7, [exportFile.name, backup.format]);
		await testPage.dial().locator('#ImportFile').setInputFiles(jsonFile('x.json', '{"not": "a backup"}'));
		await testPage.waitFor('the import message', () => !frameWindow('dial').ImportStatus.hidden);
		const wrongFileStatus = await statusText(testPage, 'ImportStatus');
		testPage.check('importing another file says what is wrong', /not a Quick Dial export/.test(wrongFileStatus), wrongFileStatus);
		await testPage.dial().locator('#ImportFile').setInputFiles(jsonFile('t.json', { format: 'quickdial-ng-theme', version: 1, name: 'T', style: {} }));
		await testPage.waitFor('the import message', () => /theme/.test(frameWindow('dial').ImportStatus.textContent));
		const themeFileStatus = await statusText(testPage, 'ImportStatus');
		testPage.check('importing a theme file here points to the Themes tab', /Themes tab/.test(themeFileStatus), themeFileStatus);
		backup.settings.grid.rows = 2;
		await testPage.dial().locator('#ImportFile').setInputFiles(jsonFile('b.json', backup));
		const importDialog = await testPage.answer({ ok: false });
		await testPage.idle();
		testPage.check('the import asks first; Cancel imports nothing', /Import this Quick Dial NG backup/.test(importDialog.title)
			&& (await testPage.inHost(() => backgroundPage().app.settings.grid.rows)) === 3, importDialog.title);
		await testPage.dial().locator('#ImportFile').setInputFiles(jsonFile('b.json', backup));
		await testPage.answer();
		await testPage.waitFor('Settings to reload after the import', () => { const settingsWindow = frameWindow('dial'); return settingsWindow.app && settingsWindow.app.settings && /^Imported/.test(settingsWindow.ImportStatus.textContent); });
		await testPage.idle();
		const importedStatus = await statusText(testPage, 'ImportStatus');
		testPage.check('the import replaces the settings and reports what it did', (await testPage.inHost(() => backgroundPage().app.settings.grid.rows)) === 2
			&& /^Imported 7 tiles in 2 folders/.test(importedStatus), importedStatus);
		await testPage.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: testPage.base.slice(0, -1) });
		await testPage.loadSettings('backup');
		await testPage.dial().locator('#BtnCopySnippet').click();
		await testPage.waitFor('the snippet to be copied', () => /Copied/.test(frameWindow('dial').BtnCopySnippet.textContent));
		const clipboardText = await testPage.inDial(() => navigator.clipboard.readText());
		testPage.check('Copy export snippet puts the snippet on the clipboard', clipboardText === (await testPage.inDial(() => app.Backup.exportSnippet)), clipboardText.slice(0, 40));

		// ----- Themes -----
		const themeSaved = (what, name) => testPage.waitFor(what, themeName => (backgroundPage().app.Themes.list || []).some(theme => theme.name === themeName), name);
		await testPage.loadSettings('themes');
		await testPage.dial().locator('#BtnThemeSave').click();
		const builtInName = await testPage.answer({ values: ['Anori'] });
		testPage.check('a theme can\'t be saved under a built-in name', /built-in theme/.test(builtInName.error), builtInName);
		await testPage.answer({ ok: false });
		await testPage.dial().locator('#BtnThemeSave').click();
		await testPage.answer({ values: ['Saved one', 'my look'] });
		await themeSaved('the theme to be saved', 'Saved one');
		const namesAfterSave = await themeNames(testPage);
		testPage.check('Save current as theme adds it, in use', testPage.same(namesAfterSave, [...BUILTIN_THEMES, 'Saved one']) && /Saved "Saved one"/.test(await statusText(testPage, 'ThemeStatus')), namesAfterSave);
		await testPage.dial().locator('#BtnThemeSave').click();
		const sameNameDialog = await testPage.answer({ values: ['Saved one'] }); // the form matches Classic, so the name field starts at "My theme"
		const replaceDialog = await testPage.answer();
		testPage.check('saving under an existing name asks before replacing it', sameNameDialog.error === null && /Replace "Saved one"/.test(replaceDialog.title)
			&& (await testPage.inHost(() => backgroundPage().app.Themes.list.length)) === 1, replaceDialog);
		const currentThemeFile = await testPage.download(async () => { await testPage.dial().locator('#BtnThemeExport').click(); await testPage.answer({ values: ['Shared look'] }); });
		const currentTheme = JSON.parse(currentThemeFile.text);
		testPage.check('Export current as theme downloads a theme file', currentThemeFile.name === 'quickdial-ng-theme-shared-look.json' && currentTheme.format === 'quickdial-ng-theme'
			&& currentTheme.name === 'Shared look', [currentThemeFile.name, currentTheme.name]);
		const anoriFile = await testPage.download(() => themeCard(testPage, 'Anori').locator('button', { hasText: 'Export' }).click());
		const anoriTheme = JSON.parse(anoriFile.text);
		testPage.check('a theme\'s Export… downloads that theme', anoriFile.name === 'quickdial-ng-theme-anori.json' && anoriTheme.style.accentColor === '#00794a', anoriFile.name);
		await testPage.dial().locator('#ThemeFile').setInputFiles(jsonFile('c.json', { format: 'quickdial-ng-theme', version: 1, name: 'Classic', style: { backgroundColor: '#222222' } }));
		await themeSaved('the theme to be imported', 'Classic (imported)');
		const namesAfterImport = await themeNames(testPage);
		testPage.check('Import theme adds it (a built-in name gets "(imported)")', namesAfterImport.includes('Classic (imported)'), namesAfterImport);
		await testPage.dial().locator('#ThemeFile').setInputFiles(jsonFile('b.json', backup));
		await testPage.waitFor('the theme message', () => /backup/.test(frameWindow('dial').ThemeStatus.textContent));
		const backupAsThemeStatus = await statusText(testPage, 'ThemeStatus');
		testPage.check('importing a backup there says it is a backup', /full Quick Dial NG backup/.test(backupAsThemeStatus), backupAsThemeStatus);
		testPage.check('built-in themes have no Delete', (await themeCard(testPage, 'Anori').locator('button', { hasText: 'Delete' }).count()) === 0);
		await themeCard(testPage, 'Classic \\(imported\\)').locator('button', { hasText: 'Delete' }).click();
		await testPage.answer();
		await testPage.waitFor('the theme to be deleted', () => !backgroundPage().app.Themes.list.some(theme => theme.name === 'Classic (imported)'));
		const namesAfterDelete = await themeNames(testPage);
		testPage.check('Delete removes the theme after asking', testPage.same(namesAfterDelete, [...BUILTIN_THEMES, 'Saved one']), namesAfterDelete);

		// ----- Tiles › Thumbnails: New tiles get; Apply to tiles asks first -----
		await testPage.loadSettings('tiles');
		const newTiles = await testPage.inDial(() => ({ value: GridNewTilePicture.value, choices: GridNewTilePicture.options.length }));
		testPage.check('New tiles get starts at a screenshot of the page, of three choices', newTiles.value === TILE_PICTURE.page && newTiles.choices === TILE_PICTURE_CHOICES, newTiles);
		await testPage.dial().locator('#GridNewTilePicture').selectOption(TILE_PICTURE.siteIconOrPage);
		const sourcesBefore = await testPage.inHost(() => JSON.stringify(backgroundPage().app.node.children.map(tile => tile.imageSource)));
		await testPage.dial().locator('#BtnApplyTilePicture').click();
		const applyDialog = await testPage.answer({ ok: false });
		const afterCancel = { status: await testPage.inDial(() => TilePictureStatus.textContent), dirty: await testPage.inDial(() => !BtnApply.disabled),
			sources: await testPage.inHost(() => JSON.stringify(backgroundPage().app.node.children.map(tile => tile.imageSource))) };
		testPage.check('Apply to tiles asks first; Cancel changes no tile; the choice waits for Apply', /Apply to your tiles/.test(applyDialog.title) && afterCancel.status === ''
			&& afterCancel.sources === sourcesBefore && afterCancel.dirty, [applyDialog.title, afterCancel]);
		await testPage.dial().locator('#BtnDiscard').click();
	}
};
