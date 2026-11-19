// Themes (app.Themes in js/background/settings.js; the Themes tab of js/settings.js; the dial's styles in
// js/dial.js): custom themes stored by the background page, and putting a theme on the dial from Settings.
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js), Classic look.
// The steps build on each other:
//   1. the background page stores a custom theme list (cleaned) and reloads it after a restart
//   2. with one custom theme ("Mine") and a background picture set, Settings › Themes: Use Anori,
//      Apply; the dial then draws Anori; finally Classic is put back
// Related: the theme rules (value checks, theme files) are unit tests (unit/themes.test.js); the
// Themes tab's Save / Export / Import / Delete buttons are in settings-page.js.
'use strict';
const { freshProfile } = require('../lib/fixtures');

// Runs in the Settings page: is the Themes tab shown, the names of the theme cards, and those marked "In use"
const themeCards = () => ({ tab: !document.getElementById('TabThemes').hidden, cards: [...document.querySelectorAll('.qd-theme .qd-theme-name')].map(h => h.firstChild.textContent),
	current: [...document.querySelectorAll('.qd-theme.is-current .qd-theme-name')].map(h => h.firstChild.textContent) });

module.exports = {
	title: 'Custom themes saved and reloaded; Use, Apply and Classic in Settings; the dial draws the theme',
	async run(t) {
		await freshProfile(t);

		// ----- custom themes stored by the background page -----
		await t.J(() => bg().app.Themes.save([{ name: 'Mine', description: 'test', style: { backgroundColor: '#112233', grid: { cells: { borderRadius: 9 } } } },
			{ name: 'Classic', style: {} }, { name: 'mine', style: {} }, { nameless: true }]));
		let st = await t.J(() => S.storage.themes);
		t.check('custom themes saved; built-in names, duplicates and broken entries dropped', st.length === 1 && st[0].name === 'Mine' && st[0].style.grid.cells.borderRadius === 9 && st[0].style.grid.cells.margin === 4, st.map(x => x.name));
		await t.loadBg();
		st = await t.J(() => bg().app.Themes.list.map(x => x.name));
		t.check('custom themes are loaded after a restart', t.same(st, ['Mine']), st);
		await t.J(() => bg().app.Themes.save([]));
		t.check('an empty list removes the stored key', !(await t.J(() => 'themes' in S.storage)));
		await t.J(() => bg().app.Themes.save([{ name: 'Mine', style: { backgroundColor: '#112233' } }]));

		// ----- Settings › Themes: Use Anori, Apply, the dial follows; rows, columns and the background picture are kept -----
		await t.J(() => { const s = bg().app.settings; s.backgroundImage = 'url(/img/back.svg)'; });
		const layout = () => t.J(() => { const s = bg().app.settings; return { rows: s.grid.rows, cols: s.grid.columns, ratio: s.grid.ratioX + ':' + s.grid.ratioY, pic: s.backgroundImage }; });
		const before = await layout();
		await t.loadSettings('themes');
		st = await t.inDial(themeCards);
		t.check('the Themes tab lists the built-in and custom themes, Classic in use', st.tab && t.same(st.cards, ['Classic', 'Anori', 'Mine']) && t.same(st.current, ['Classic']), st);
		await t.dial().locator('.qd-theme').nth(1).locator('button', { hasText: 'Use' }).click();
		st = await t.inDial(() => ({ accent: AccentColor.value, pos: GridCellsTitlePosition.value, glass: GridCellsBackgroundOpacity.value, dirty: !BtnApply.disabled,
			current: [...document.querySelectorAll('.qd-theme.is-current .qd-theme-name')].map(h => h.firstChild.textContent),
			gradientRow: !BackgroundGradientRow.hidden, accented: document.documentElement.classList.contains('qd-accented') }));
		t.check('"Use" fills the form with Anori', st.accent === '#00794a' && st.pos === '1' && st.glass === '6' && t.same(st.current, ['Anori']) && st.dirty && st.gradientRow && st.accented, st);
		t.check('the dial is not changed before Apply', (await t.J(() => bg().app.settings.accentColor)) === null);
		await t.dial().locator('#BtnApply').click();
		await t.waitFor('the theme to be applied', () => bg().app.settings.accentColor);
		await t.idle();
		st = await t.J(() => { const s = bg().app.settings, T = bg().QDThemes; return { accent: s.accentColor, grad: !!s.backgroundGradient, anori: T.equal(T.extract(s), T.BUILTIN[1].style) }; });
		const after = await layout();
		t.check('Apply puts Anori on; layout and background picture are kept', st.accent === '#00794a' && st.grad && st.anori && t.same(after, before), [st, before, after]);


		// ----- the dial draws the theme; Classic brings the original look back -----
		await t.loadDial();
		st = await t.inDial(() => { const a = document.querySelector('table.Grid a:not(.Empty)'), cs = getComputedStyle(a), title = getComputedStyle(a.lastChild);
			return { bg: getComputedStyle(document.body).backgroundImage.slice(0, 40), radius: cs.borderTopLeftRadius, blur: cs.backdropFilter, shadow: cs.boxShadow !== 'none', titlePos: title.position, panelH: a.firstChild.offsetHeight, linkH: a.clientHeight }; });
		t.check('the dial draws Anori: picture over the gradient, glass, shadow, title over the picture', st.bg.startsWith('url(') && st.bg.includes('back.svg') && st.radius === '14px' && st.blur === 'blur(14px)' && st.shadow && st.titlePos === 'absolute' && st.panelH === st.linkH, st);
		st = await t.J(() => { const a = bg().app, T = bg().QDThemes, s = JSON.parse(JSON.stringify(a.settings)); T.apply(s, T.BUILTIN[0].style);
			return new Promise(r => a.Settings.update(s, () => r(T.equal(T.extract(a.settings), T.CLASSIC)))); });
		t.check('Classic brings the original look back', st);
	}
};
