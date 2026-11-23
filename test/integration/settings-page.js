// The Settings page (html/settings.html, js/settings.js; its own tab since 0.5.0): sections, Apply /
// Discard / Ctrl+S, the background picture, and the buttons of the Backup and Themes sections.
// It is used as the user would: clicks, typing, files chosen (setInputFiles), dialogs answered (t.answer),
// downloads caught (t.download). The page is opened in the "dial" frame (t.loadSettings).
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js), Classic look, no themes.
// The steps build on each other:
//   1. the form: rows end up at 3 and the toolbar button back at "settings"
//   2. a background picture applied (as a smaller WebP), then cleared; a folder picture applied, then reset
//   3. Backup: export; wrong files refused; the export imported (with rows changed to 2), first
//      cancelled, then done; the export snippet copied
//   4. Themes: "Saved one" saved (and replaced), exports, "Classic (imported)" imported then deleted
// Related: what the import itself does is in backup.js; Use / Apply of a theme is in themes.js.
'use strict';
const { BUILTIN_THEMES, freshProfile, changeSettings, pictures } = require('../lib/fixtures');

// A file for setInputFiles; the text of a status line (empty while hidden); the theme card names;
// the card of a theme whose name starts with `name` (a regular expression)
const json = (name, data) => ({ name, mimeType: 'application/json', buffer: Buffer.from(typeof data == 'string' ? data : JSON.stringify(data)) });
const status = (t, id) => t.inDial(id => { const el = document.getElementById(id); return el.hidden ? '' : el.textContent; }, id);
const themeNames = t => t.inDial(() => [...document.querySelectorAll('.qd-theme .qd-theme-name')].map(h => h.firstChild.textContent));
const card = (t, name) => t.dial().locator('.qd-theme', { has: t.dial().locator('.qd-theme-name', { hasText: new RegExp('^' + name) }) });

module.exports = {
	title: 'Settings: sections, Apply / Discard / Ctrl+S, backup and theme buttons',
	async run(t) {
		await freshProfile(t);

		// ----- sections and the form -----
		await t.loadSettings('grid');
		const form = () => t.inDial(() => ({ title: PanelTitle.textContent, grid: !TabGrid.hidden, rows: GridRows.value, toolbar: ToolbarAction.value,
			apply: BtnApply.disabled, discard: BtnDiscard.disabled, url: location.search }));
		let st = await form();
		t.check('?tab= opens that section, with nothing to apply', st.title === 'Grid' && st.grid && st.toolbar === 'settings' && st.apply && st.discard, st);
		const rows0 = st.rows;
		await t.dial().locator('#GridRows').fill('9');
		st = await form();
		t.check('an edit enables Apply and Discard', !st.apply && !st.discard && st.rows === '9', st);
		await t.dial().locator('#BtnDiscard').click();
		st = await form();
		t.check('Discard brings back what the dial uses', st.rows === rows0 && st.apply && st.discard && String(await t.J(() => bg().app.settings.grid.rows)) === rows0, st);
		await t.dial().locator('#GridRows').fill('6');
		await t.dial().locator('#GridRows').press('Control+s');
		await t.waitFor('Ctrl+S to apply', () => bg().app.settings.grid.rows === 6);
		t.check('Ctrl+S applies', (await form()).apply);
		await changeSettings(t, { grid: { rows: 3 }, toolbarAction: 'current' });
		await t.waitFor('the open Settings page to follow', () => win('dial').GridRows.value === '3');
		st = await form();
		t.check('settings applied elsewhere show up while nothing is pending', st.rows === '3' && st.toolbar === 'current', st);
		await t.dial().locator('#TabTilesButton').click();
		await t.J(() => fire('rt.onMessage.dial', { cmd: 209, tab: 'themes' }, {}, () => {}));
		st = await t.inDial(() => ({ themes: !TabThemes.hidden, title: PanelTitle.textContent, url: location.search }));
		t.check('an open Settings page switches to the section asked for', st.themes && st.title === 'Themes' && st.url === '?tab=themes', st);
		await changeSettings(t, { toolbarAction: 'settings' });

		// ----- the click effect: picked from the list, it plays on the sample tile and is applied like the rest -----
		const RIPPLE = '3';
		await t.loadSettings('tiles');
		await t.dial().locator('#GridCellsClickEffect').selectOption(RIPPLE);
		st = await t.inDial(() => ({ playing: TileHover.classList.contains('is-clicked'), css: app.clickEffectStyle.textContent, apply: BtnApply.disabled }));
		t.check('a click effect picked plays on the Hover sample, with its rules', st.playing && st.css.includes('qd-click-ripple') && !st.apply, st);
		await t.waitFor('the effect to end', () => !win('dial').TileHover.classList.contains('is-clicked'));
		await t.dial().locator('#TileNormal').click();
		t.check('clicking a sample tile plays it again', await t.inDial(() => TileNormal.classList.contains('is-clicked')));
		await t.dial().locator('#GridCellsClickEffect').press('Control+s');
		await t.waitFor('Ctrl+S to apply', () => bg().app.settings.grid.cells.clickEffect === 3);
		t.check('the click effect is applied to the dial settings', true);
		await changeSettings(t, { grid: { cells: { clickEffect: 0 } } });

		// ----- the background picture: from a file (made WebP and smaller), then cleared; a folder picture -----
		await t.loadSettings('page');
		const pngFile = (name, png) => ({ name, mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
		// The size of a picture in a settings value (url("data:...")), as [width, height]
		const size = css => t.J(css => new Promise(resolve => {
			const img = new Image();
			img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
			img.onerror = () => resolve(null);
			img.src = css.replace(/^url\("?|"?\)$/g, '');
		}), css);
		const big = await t.J(() => { // 3200x1600, larger than the background limit (2560)
			const c = document.createElement('canvas'); c.width = 3200; c.height = 1600; const x = c.getContext('2d');
			const g = x.createLinearGradient(0, 0, 3200, 1600); g.addColorStop(0, '#246'); g.addColorStop(1, '#c84'); x.fillStyle = g; x.fillRect(0, 0, 3200, 1600);
			return c.toDataURL('image/png');
		});
		await t.dial().locator('#BackgroundImageFile').setInputFiles(pngFile('bg.png', big));
		await t.waitFor('the picture to be read', () => !win('dial').BtnApply.disabled);
		await t.dial().locator('#BtnApply').click();
		await t.waitFor('the picture to be applied', () => /^url\("?data:/.test(bg().app.settings.backgroundImage || ''));
		let stored = await t.J(() => bg().app.settings.backgroundImage);
		t.check('a background picture from a file is stored as WebP, at most 2560 pixels wide', stored.startsWith('url("data:image/webp') && t.same(await size(stored), [2560, 1280]), [stored.slice(0, 30), await size(stored)]);
		await t.dial().locator('#BackgroundImageClear').click();
		await t.dial().locator('#BtnApply').click();
		await t.waitFor('the picture to be cleared', () => bg().app.settings.backgroundImage === null);
		t.check('Clear removes the background picture', true);
		await t.loadSettings('grid');
		const [png] = await pictures(t, 1);
		await t.dial().locator('#GridFolderImageFile').setInputFiles(pngFile('folder.png', png));
		await t.waitFor('the picture to be read', () => !win('dial').BtnApply.disabled);
		await t.dial().locator('#BtnApply').click();
		await t.waitFor('the picture to be applied', () => /^url\("?data:/.test(bg().app.settings.grid.folderIcon || ''));
		stored = await t.J(() => bg().app.settings.grid.folderIcon);
		t.check('a folder picture from a file is stored as WebP', stored.startsWith('url("data:image/webp') && t.same(await size(stored), [320, 240]), [stored.slice(0, 30), await size(stored)]);
		await t.dial().locator('#GridFolderImageReset').click();
		await t.dial().locator('#BtnApply').click();
		await t.waitFor('the built-in folder picture', () => bg().app.settings.grid.folderIcon === 'url(/img/folder.svg)');

		// ----- Backup -----
		await t.loadSettings('backup');
		st = await t.inDial(() => ({ tab: !TabBackup.hidden, selected: TabBackupButton.getAttribute('aria-selected'), imp: !!document.getElementById('BtnImport'), copy: !!document.getElementById('BtnCopySnippet') }));
		t.check('?tab=backup opens the Backup section with its buttons', st.tab && st.selected === 'true' && st.imp && st.copy, st);
		const file = await t.download(() => t.dial().locator('#BtnExport').click());
		const backup = JSON.parse(file.text);
		t.check('Export downloads a dated backup file', /^quickdial-ng-backup-\d{4}-\d\d-\d\d\.json$/.test(file.name) && backup.format === 'quickdial-ng' && backup.node.children.length === 7, [file.name, backup.format]);
		await t.dial().locator('#ImportFile').setInputFiles(json('x.json', '{"not": "a backup"}'));
		await t.waitFor('the import message', () => !win('dial').ImportStatus.hidden);
		t.check('importing another file says what is wrong', /not a Quick Dial export/.test(await status(t, 'ImportStatus')), await status(t, 'ImportStatus'));
		await t.dial().locator('#ImportFile').setInputFiles(json('t.json', { format: 'quickdial-ng-theme', version: 1, name: 'T', style: {} }));
		await t.waitFor('the import message', () => /theme/.test(win('dial').ImportStatus.textContent));
		t.check('importing a theme file here points to the Themes tab', /Themes tab/.test(await status(t, 'ImportStatus')), await status(t, 'ImportStatus'));
		backup.settings.grid.rows = 2;
		await t.dial().locator('#ImportFile').setInputFiles(json('b.json', backup));
		let d = await t.answer({ ok: false });
		await t.idle();
		t.check('the import asks first; Cancel imports nothing', /Import this Quick Dial NG backup/.test(d.title) && (await t.J(() => bg().app.settings.grid.rows)) === 3, d.title);
		await t.dial().locator('#ImportFile').setInputFiles(json('b.json', backup));
		await t.answer();
		await t.waitFor('Settings to reload after the import', () => { const w = win('dial'); return w.app && w.app.settings && /^Imported/.test(w.ImportStatus.textContent); });
		await t.idle();
		st = await status(t, 'ImportStatus');
		t.check('the import replaces the settings and reports what it did', (await t.J(() => bg().app.settings.grid.rows)) === 2 && /^Imported 7 tiles in 2 folders/.test(st), st);
		await t.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: t.base.slice(0, -1) });
		await t.loadSettings('backup');
		await t.dial().locator('#BtnCopySnippet').click();
		await t.waitFor('the snippet to be copied', () => /Copied/.test(win('dial').BtnCopySnippet.textContent));
		st = await t.inDial(() => navigator.clipboard.readText());
		t.check('Copy export snippet puts the snippet on the clipboard', st === (await t.inDial(() => app.Backup.exportSnippet)), st.slice(0, 40));

		// ----- Themes -----
		await t.loadSettings('themes');
		await t.dial().locator('#BtnThemeSave').click();
		d = await t.answer({ values: ['Anori'] });
		t.check('a theme can\'t be saved under a built-in name', /built-in theme/.test(d.error), d);
		await t.answer({ ok: false });
		await t.dial().locator('#BtnThemeSave').click();
		await t.answer({ values: ['Saved one', 'my look'] });
		await t.waitFor('the theme to be saved', () => (bg().app.Themes.list || []).some(x => x.name === 'Saved one'));
		t.check('Save current as theme adds it, in use', t.same(await themeNames(t), [...BUILTIN_THEMES, 'Saved one']) && /Saved "Saved one"/.test(await status(t, 'ThemeStatus')), await themeNames(t));
		await t.dial().locator('#BtnThemeSave').click();
		d = await t.answer({ values: ['Saved one'] }); // the form matches Classic, so the name field starts at "My theme"
		const replace = await t.answer();
		t.check('saving under an existing name asks before replacing it', d.error === null && /Replace "Saved one"/.test(replace.title) && (await t.J(() => bg().app.Themes.list.length)) === 1, replace);
		let f = await t.download(async () => { await t.dial().locator('#BtnThemeExport').click(); await t.answer({ values: ['Shared look'] }); });
		let data = JSON.parse(f.text);
		t.check('Export current as theme downloads a theme file', f.name === 'quickdial-ng-theme-shared-look.json' && data.format === 'quickdial-ng-theme' && data.name === 'Shared look', [f.name, data.name]);
		f = await t.download(() => card(t, 'Anori').locator('button', { hasText: 'Export' }).click());
		data = JSON.parse(f.text);
		t.check('a theme\'s Export… downloads that theme', f.name === 'quickdial-ng-theme-anori.json' && data.style.accentColor === '#00794a', f.name);
		await t.dial().locator('#ThemeFile').setInputFiles(json('c.json', { format: 'quickdial-ng-theme', version: 1, name: 'Classic', style: { backgroundColor: '#222222' } }));
		await t.waitFor('the theme to be imported', () => (bg().app.Themes.list || []).some(x => x.name === 'Classic (imported)'));
		t.check('Import theme adds it (a built-in name gets "(imported)")', (await themeNames(t)).includes('Classic (imported)'), await themeNames(t));
		await t.dial().locator('#ThemeFile').setInputFiles(json('b.json', backup));
		await t.waitFor('the theme message', () => /backup/.test(win('dial').ThemeStatus.textContent));
		t.check('importing a backup there says it is a backup', /full Quick Dial NG backup/.test(await status(t, 'ThemeStatus')), await status(t, 'ThemeStatus'));
		t.check('built-in themes have no Delete', (await card(t, 'Anori').locator('button', { hasText: 'Delete' }).count()) === 0);
		await card(t, 'Classic \\(imported\\)').locator('button', { hasText: 'Delete' }).click();
		await t.answer();
		await t.waitFor('the theme to be deleted', () => !bg().app.Themes.list.some(x => x.name === 'Classic (imported)'));
		t.check('Delete removes the theme after asking', t.same(await themeNames(t), [...BUILTIN_THEMES, 'Saved one']), await themeNames(t));
	}
};
