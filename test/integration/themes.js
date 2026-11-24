// Themes (app.Themes in js/background/settings.js; the Themes tab of js/settings.js; the dial's styles in
// js/grid.js): custom themes stored by the background page, and putting a theme on the dial from Settings.
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js), Classic look.
// The steps build on each other:
//   1. the background page stores a custom theme list (cleaned) and reloads it after a restart
//   2. with one custom theme ("Mine") and a background picture set, Settings › Themes: Use Anori,
//      Apply; the dial then draws Anori; finally Classic is put back
// Related: the theme rules (value checks, theme files) are unit tests (unit/themes.test.js); the
// Themes tab's Save / Export / Import / Delete buttons are in settings-page.js.
'use strict';
const { BUILTIN_THEMES, freshProfile } = require('../lib/fixtures');

// Runs in the Settings page: is the Themes tab shown, the names of the theme cards, and those marked "In use"
const themeCards = () => ({ tab: !document.getElementById('TabThemes').hidden, cards: [...document.querySelectorAll('.qd-theme .qd-theme-name')].map(heading => heading.firstChild.textContent),
	current: [...document.querySelectorAll('.qd-theme.is-current .qd-theme-name')].map(heading => heading.firstChild.textContent) });
// Anori's values in the Settings form (its accent colour; the title over the picture; glass level 6)
const ANORI = { accent: '#00794a', titlePosition: '1', glass: '6' };
// The built-in themes by their place in QDThemes.BUILTIN
const CLASSIC_INDEX = 0, ANORI_INDEX = 1;

module.exports = {
	title: 'Custom themes saved and reloaded; Use, Apply and Classic in Settings; the dial draws the theme',
	async run(testPage) {
		await freshProfile(testPage);

		// ----- custom themes stored by the background page -----
		await testPage.inHost(() => backgroundPage().app.Themes.save([{ name: 'Mine', description: 'test', style: { backgroundColor: '#112233', grid: { cells: { borderRadius: 9 } } } },
			{ name: 'Classic', style: {} }, { name: 'mine', style: {} }, { nameless: true }]));
		const storedThemes = await testPage.inHost(() => mockState.storage.themes);
		testPage.check('custom themes saved; built-in names, duplicates and broken entries dropped', storedThemes.length === 1 && storedThemes[0].name === 'Mine'
			&& storedThemes[0].style.grid.cells.borderRadius === 9 && storedThemes[0].style.grid.cells.margin === 4, storedThemes.map(theme => theme.name));
		await testPage.loadBg();
		const reloadedNames = await testPage.inHost(() => backgroundPage().app.Themes.list.map(theme => theme.name));
		testPage.check('custom themes are loaded after a restart', testPage.same(reloadedNames, ['Mine']), reloadedNames);
		await testPage.inHost(() => backgroundPage().app.Themes.save([]));
		testPage.check('an empty list removes the stored key', !(await testPage.inHost(() => 'themes' in mockState.storage)));
		await testPage.inHost(() => backgroundPage().app.Themes.save([{ name: 'Mine', style: { backgroundColor: '#112233' } }]));

		// ----- Settings › Themes: Use Anori, Apply, the dial follows; rows, columns and the background picture are kept -----
		await testPage.inHost(() => { backgroundPage().app.settings.backgroundImage = 'url(/img/back.svg)'; });
		const layout = () => testPage.inHost(() => {
			const settings = backgroundPage().app.settings;
			return { rows: settings.grid.rows, columns: settings.grid.columns, ratio: settings.grid.ratioX + ':' + settings.grid.ratioY, picture: settings.backgroundImage };
		});
		const layoutBefore = await layout();
		await testPage.loadSettings('themes');
		const themesTab = await testPage.inDial(themeCards);
		testPage.check('the Themes tab lists the built-in and custom themes, Classic in use', themesTab.tab && testPage.same(themesTab.cards, [...BUILTIN_THEMES, 'Mine']) && testPage.same(themesTab.current, ['Classic']), themesTab);
		await testPage.dial().locator('.qd-theme').nth(ANORI_INDEX).locator('button', { hasText: 'Use' }).click();
		const formWithAnori = await testPage.inDial(() => ({ accent: AccentColor.value, titlePosition: GridCellsTitlePosition.value, glass: GridCellsBackgroundOpacity.value, dirty: !BtnApply.disabled,
			current: [...document.querySelectorAll('.qd-theme.is-current .qd-theme-name')].map(heading => heading.firstChild.textContent),
			gradientRow: !BackgroundGradientRow.hidden, accented: document.documentElement.classList.contains('qd-accented') }));
		testPage.check('"Use" fills the form with Anori', formWithAnori.accent === ANORI.accent && formWithAnori.titlePosition === ANORI.titlePosition && formWithAnori.glass === ANORI.glass
			&& testPage.same(formWithAnori.current, ['Anori']) && formWithAnori.dirty && formWithAnori.gradientRow && formWithAnori.accented, formWithAnori);
		testPage.check('the dial is not changed before Apply', (await testPage.inHost(() => backgroundPage().app.settings.accentColor)) === null);
		await testPage.dial().locator('#BtnApply').click();
		await testPage.waitFor('the theme to be applied', () => backgroundPage().app.settings.accentColor);
		await testPage.idle();
		const applied = await testPage.inHost(anoriIndex => {
			const settings = backgroundPage().app.settings, Themes = backgroundPage().QDThemes;
			return { accent: settings.accentColor, gradient: !!settings.backgroundGradient, isAnori: Themes.equal(Themes.extract(settings), Themes.BUILTIN[anoriIndex].style) };
		}, ANORI_INDEX);
		const layoutAfter = await layout();
		testPage.check('Apply puts Anori on; layout and background picture are kept', applied.accent === ANORI.accent && applied.gradient && applied.isAnori
			&& testPage.same(layoutAfter, layoutBefore), [applied, layoutBefore, layoutAfter]);

		// ----- the dial draws the theme; Classic brings the original look back -----
		await testPage.loadDial();
		const drawn = await testPage.inDial(() => {
			const link = document.querySelector('table.qd-grid a:not(.is-empty)'), linkStyle = getComputedStyle(link), titleStyle = getComputedStyle(link.lastChild);
			return { background: getComputedStyle(document.body).backgroundImage.slice(0, 40), radius: linkStyle.borderTopLeftRadius, blur: linkStyle.backdropFilter, shadow: linkStyle.boxShadow !== 'none',
				titlePosition: titleStyle.position, panelHeight: link.firstChild.offsetHeight, linkHeight: link.clientHeight };
		});
		testPage.check('the dial draws Anori: picture over the gradient, glass, shadow, title over the picture', drawn.background.startsWith('url(') && drawn.background.includes('back.svg')
			&& drawn.radius === '14px' && drawn.blur === 'blur(14px)' && drawn.shadow && drawn.titlePosition === 'absolute' && drawn.panelHeight === drawn.linkHeight, drawn);
		const classicBack = await testPage.inHost(classicIndex => {
			const app = backgroundPage().app, Themes = backgroundPage().QDThemes, settings = JSON.parse(JSON.stringify(app.settings));
			Themes.apply(settings, Themes.BUILTIN[classicIndex].style);
			return app.Settings.update(settings).then(() => Themes.equal(Themes.extract(app.settings), Themes.CLASSIC));
		}, CLASSIC_INDEX);
		testPage.check('Classic brings the original look back', classicBack);
	}
};
