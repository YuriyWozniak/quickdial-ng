// The Language setting (Settings › Page › Interface; js/common.js, js/background/language.js): Firefox's
// language by default, or one picked from the list. The simulated Firefox is in English.
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js). The steps build on each other:
//   1. the list: "Same as Firefox (English)", then the 11 languages in their own names
//   2. Ukrainian applied: Settings is built again in it, the menus and the dial follow, and it is still
//      Ukrainian after the background page restarts
//   3. Hebrew: right to left
//   4. back to Firefox's language: English again, nothing kept for the pages
// Related: the texts of every language are checked in unit/locales.test.js, the language logic in unit/language.test.js.
'use strict';
const { freshProfile, messagesOf, englishText } = require('../lib/fixtures');

const UKRAINIAN = messagesOf('uk');

// What the open Settings page shows
const settingsPageState = testPage => testPage.inDial(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, title: PanelTitle.textContent,
	apply: BtnApply.textContent.trim(), language: Language.value, section: location.search }));
// Picks a language in the open Settings page (value: its Language setting), applies it (Ctrl+S) and
// waits for the page to come back in it (lang: the page's language tag)
async function chooseLanguage(testPage, value, lang) {
	await testPage.dial().locator('#Language').selectOption(value);
	await testPage.dial().locator('#Language').press('Control+s');
	await testPage.waitFor('the setting to be applied', language => backgroundPage().app.settings.language === language, value);
	await testPage.waitFor('Settings to come back in ' + lang, languageTag => { // the page may be between two documents while it reloads
		const settingsWindow = frameWindow('dial'), html = settingsWindow && settingsWindow.document && settingsWindow.document.documentElement;
		return !!html && html.lang === languageTag && !!settingsWindow.app && !!settingsWindow.app.settings;
	}, lang);
}
// Waits until the context menus include a title; the menu titles, or null if they never do
const menusWith = (testPage, what, title) => testPage.waitFor(what, menuTitle => mockState.menus.includes(menuTitle) && mockState.menus, title).catch(() => null);

module.exports = {
	title: 'Language: Firefox\'s by default, or one chosen in Settings',
	async run(testPage) {
		await freshProfile(testPage);

		// ----- the list -----
		await testPage.loadSettings('page');
		const options = await testPage.inDial(() => [...Language.options].map(option => [option.value, option.text, option.lang]));
		const [firefoxOption, ...languageOptions] = options;
		testPage.check('the list starts with "Same as Firefox" and its language, which is chosen', firefoxOption[0] === '' && firefoxOption[1] === englishText('settingsLanguageBrowser') + ' (English)'
			&& (await testPage.inDial(() => Language.value)) === '', firefoxOption);
		const optionFor = value => languageOptions.find(option => option[0] === value);
		testPage.check('then the 11 languages, each in its own name and language, in alphabetical order', options.length === 12
			&& testPage.same(languageOptions.map(option => option[0]), ['de', 'en', 'es', 'fr', 'it', 'pl', 'pt_BR', 'ru', 'sr', 'uk', 'he_IL'])
			&& testPage.same(optionFor('he_IL'), ['he_IL', 'עברית', 'he-IL']) && testPage.same(optionFor('uk'), ['uk', 'Українська', 'uk']), languageOptions);
		testPage.check('a new install uses Firefox\'s language', (await testPage.inHost(() => backgroundPage().app.settings.language)) === '' && (await settingsPageState(testPage)).lang === 'en');

		// ----- Ukrainian -----
		await chooseLanguage(testPage, 'uk', 'uk');
		const inUkrainian = await settingsPageState(testPage);
		testPage.check('Ukrainian applied: Settings is built again in Ukrainian, on the same section', inUkrainian.title === UKRAINIAN.settingsTabPage && inUkrainian.apply === UKRAINIAN.buttonApply
			&& inUkrainian.language === 'uk' && inUkrainian.dir === 'ltr' && inUkrainian.section === '?tab=page', inUkrainian);
		const keptForPages = await testPage.inHost(() => JSON.parse(localStorage.getItem('language')));
		testPage.check('the background page keeps the Ukrainian texts for the pages', keptForPages && keptForPages.language === 'uk' && keptForPages.messages.buttonApply === UKRAINIAN.buttonApply, keptForPages && keptForPages.language);
		const ukrainianMenus = await menusWith(testPage, 'the menus in Ukrainian', UKRAINIAN.menuProperties);
		testPage.check('the menus are in Ukrainian', !!ukrainianMenus && ukrainianMenus.includes(UKRAINIAN.menuSettings) && !ukrainianMenus.includes(englishText('menuSettings')), ukrainianMenus);
		await testPage.loadDial();
		const dialTexts = await testPage.inDial(() => { const Common = window.QDCommon; return [Common.language(), Common.countText('countTiles', 5), Common.countText('countTiles', 22)]; });
		testPage.check('the dial uses Ukrainian too, with its plural forms', testPage.same(dialTexts, ['uk', '5 плиток', '22 плитки']), dialTexts);
		await testPage.inHost(() => { mockState.menus = []; mockState.menuItems = []; });
		await testPage.loadBg();
		const afterRestart = await testPage.inHost(() => ({ language: backgroundPage().QDCommon.language(), menus: mockState.menus }));
		testPage.check('after a restart of the background page the menus are Ukrainian again', afterRestart.language === 'uk' && afterRestart.menus.includes(UKRAINIAN.menuSettings), afterRestart);

		// ----- Hebrew -----
		await testPage.loadSettings('page');
		await chooseLanguage(testPage, 'he_IL', 'he-IL');
		const inHebrew = await settingsPageState(testPage);
		testPage.check('Hebrew: right to left', inHebrew.dir === 'rtl' && inHebrew.language === 'he_IL' && inHebrew.apply === messagesOf('he_IL').buttonApply, inHebrew);

		// ----- back to Firefox's language -----
		await chooseLanguage(testPage, '', 'en');
		const inEnglish = await settingsPageState(testPage);
		testPage.check('Same as Firefox: English again', inEnglish.dir === 'ltr' && inEnglish.language === '' && inEnglish.apply === englishText('buttonApply'), inEnglish);
		const englishMenus = await menusWith(testPage, 'the menus in English', englishText('menuProperties'));
		testPage.check('the menus are in English again, and nothing is kept for the pages', !!englishMenus && !englishMenus.includes(UKRAINIAN.menuSettings)
			&& (await testPage.inHost(() => localStorage.getItem('language'))) === null, englishMenus);
	}
};
