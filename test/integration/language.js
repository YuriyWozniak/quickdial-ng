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
const fs = require('fs'), path = require('path');
const { freshProfile, englishText } = require('../lib/fixtures');

const texts = lang => {
	const file = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', '_locales', lang, 'messages.json'), 'utf8'));
	return Object.fromEntries(Object.entries(file).map(([k, v]) => [k, v.message]));
};
const UK = texts('uk');

// What the open Settings page shows
const page = t => t.inDial(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, title: PanelTitle.textContent,
	apply: BtnApply.textContent.trim(), language: Language.value, section: location.search }));
// Picks a language in the open Settings page, applies it (Ctrl+S) and waits for the page to come back in it
async function choose(t, value, lang) {
	await t.dial().locator('#Language').selectOption(value);
	await t.dial().locator('#Language').press('Control+s');
	await t.waitFor('the setting to be applied', v => bg().app.settings.language === v, value);
	await t.waitFor('Settings to come back in ' + lang, l => { // the page may be between two documents while it reloads
		const w = win('dial'), html = w && w.document && w.document.documentElement;
		return !!html && html.lang === l && !!w.app && !!w.app.settings;
	}, lang);
}

module.exports = {
	title: 'Language: Firefox\'s by default, or one chosen in Settings',
	async run(t) {
		await freshProfile(t);

		// ----- the list -----
		await t.loadSettings('page');
		let st = await t.inDial(() => [...Language.options].map(o => [o.value, o.text, o.lang]));
		t.check('the list starts with "Same as Firefox" and its language, which is chosen', st[0][0] === '' && st[0][1] === englishText('settingsLanguageBrowser') + ' (English)'
			&& (await t.inDial(() => Language.value)) === '', st[0]);
		t.check('then the 11 languages, each in its own name and language, in alphabetical order', st.length === 12
			&& t.same(st.slice(1).map(o => o[0]), ['de', 'en', 'es', 'fr', 'it', 'pl', 'pt_BR', 'ru', 'sr', 'uk', 'he_IL'])
			&& t.same(st.find(o => o[0] === 'he_IL'), ['he_IL', 'עברית', 'he-IL']) && t.same(st.find(o => o[0] === 'uk'), ['uk', 'Українська', 'uk']), st.slice(1));
		t.check('a new install uses Firefox\'s language', (await t.J(() => bg().app.settings.language)) === '' && (await page(t)).lang === 'en');

		// ----- Ukrainian -----
		await choose(t, 'uk', 'uk');
		st = await page(t);
		t.check('Ukrainian applied: Settings is built again in Ukrainian, on the same section', st.title === UK.settingsTabPage && st.apply === UK.buttonApply
			&& st.language === 'uk' && st.dir === 'ltr' && st.section === '?tab=page', st);
		st = await t.J(() => JSON.parse(localStorage.getItem('language')));
		t.check('the background page keeps the Ukrainian texts for the pages', st && st.language === 'uk' && st.messages.buttonApply === UK.buttonApply, st && st.language);
		st = await t.waitFor('the menus in Ukrainian', title => S.menus.includes(title) && S.menus, UK.menuProperties).catch(() => null);
		t.check('the menus are in Ukrainian', !!st && st.includes(UK.menuSettings) && !st.includes(englishText('menuSettings')), st);
		await t.loadDial();
		st = await t.inDial(() => { const C = window.QDCommon; return [C.language(), C.countText('countTiles', 5), C.countText('countTiles', 22)]; });
		t.check('the dial uses Ukrainian too, with its plural forms', t.same(st, ['uk', '5 плиток', '22 плитки']), st);
		await t.J(() => { S.menus = []; S.menuItems = []; });
		await t.loadBg();
		st = await t.J(() => [bg().QDCommon.language(), S.menus]);
		t.check('after a restart of the background page the menus are Ukrainian again', st[0] === 'uk' && st[1].includes(UK.menuSettings), st);

		// ----- Hebrew -----
		await t.loadSettings('page');
		await choose(t, 'he_IL', 'he-IL');
		st = await page(t);
		t.check('Hebrew: right to left', st.dir === 'rtl' && st.language === 'he_IL' && st.apply === texts('he_IL').buttonApply, st);

		// ----- back to Firefox's language -----
		await choose(t, '', 'en');
		st = await page(t);
		t.check('Same as Firefox: English again', st.dir === 'ltr' && st.language === '' && st.apply === englishText('buttonApply'), st);
		st = await t.waitFor('the menus in English', title => S.menus.includes(title) && S.menus, englishText('menuProperties')).catch(() => null);
		t.check('the menus are in English again, and nothing is kept for the pages', !!st && !st.includes(UK.menuSettings)
			&& (await t.J(() => localStorage.getItem('language'))) === null, st);
	}
};
