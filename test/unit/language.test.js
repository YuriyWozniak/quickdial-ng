// The Language setting: QDCommon's texts in the chosen language (js/common.js: useLanguage, text, countText,
// language, direction) and app.Language (js/background/language.js), which reads the chosen language's
// messages.json and keeps the copy the pages read in localStorage.
//
// Each test loads the scripts into a fresh sandbox (./load.js) whose Firefox is in English. fetch is replaced
// by one that reads src/_locales from disk and counts the reads.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, loadBackground, plain, settle } = require('./load');

const LOCALES = path.join(__dirname, '..', '..', 'src', '_locales');
const file = lang => JSON.parse(fs.readFileSync(path.join(LOCALES, lang, 'messages.json'), 'utf8'));
const texts = lang => Object.fromEntries(Object.entries(file(lang)).map(([k, v]) => [k, v.message]));

// A background sandbox whose fetch reads the language files; w.reads lists the files read
function background() {
	const w = loadBackground();
	w.reads = [];
	w.browser.runtime.getURL = p => '/' + p;
	w.fetch = url => {
		w.reads.push(url);
		const m = /^\/_locales\/(\w+)\/messages\.json$/.exec(url);
		return m && fs.existsSync(path.join(LOCALES, m[1])) ? Promise.resolve({ json: () => Promise.resolve(file(m[1])) }) : Promise.reject(new Error('not found: ' + url));
	};
	w.app.settings = w.app.Settings.defaults();
	return w;
}
const stored = w => JSON.parse(w.localStorage.getItem(w.QDCommon.LANGUAGE_KEY));

test('LANGUAGES: one name for every folder of _locales', () => {
	const w = load('js/common.js');
	assert.deepEqual(Object.keys(w.QDCommon.LANGUAGES).sort(), fs.readdirSync(LOCALES).sort());
});

test('texts: Firefox\'s language until another one is chosen, then that one', () => {
	const C = load('js/common.js').QDCommon;
	assert.deepEqual([C.text('settingsVersion', '1.2'), C.language(), C.direction()], ['Version 1.2', 'en', 'ltr']);
	C.useLanguage({ language: 'uk', messages: texts('uk') });
	assert.deepEqual([C.text('settingsVersion', '1.2'), C.language(), C.direction()], ['Версія 1.2', 'uk', 'ltr']);
	assert.deepEqual([1, 3, 5, 21, 1.5].map(n => C.countText('countTiles', n)), ['1 плитка', '3 плитки', '5 плиток', '21 плитка', '1.5 плитки']);
	C.useLanguage({ language: 'he_IL', messages: texts('he_IL') });
	assert.deepEqual([C.language(), C.direction(), C.countText('countFolders', 2), C.countText('countFolders', 7)], ['he-IL', 'rtl', 'שתי תיקיות', '7 תיקיות']);
	C.useLanguage(null);
	assert.deepEqual([C.text('settingsVersion', '1.2'), C.language()], ['Version 1.2', 'en']);
});

test('texts: a language that isn\'t one of LANGUAGES, or has no texts, is Firefox\'s', () => {
	const C = load('js/common.js').QDCommon;
	for (const chosen of [{ language: 'xx', messages: { settingsVersion: 'X $1' } }, { language: 'toString', messages: {} }, { language: 'uk' }, 'uk']) {
		C.useLanguage(chosen);
		assert.deepEqual([C.text('settingsVersion', '1'), C.language()], ['Version 1', 'en'], JSON.stringify(chosen));
	}
});

test('texts: a page starts in the language the background page stored, and follows it when told', () => {
	const w = load('js/common.js');
	assert.equal(w.QDCommon.language(), 'en', 'nothing stored: Firefox\'s');
	w.localStorage.setItem('language', JSON.stringify({ language: 'de', messages: texts('de') }));
	w.QDCommon.useLanguage();
	assert.equal(w.QDCommon.text('buttonApply'), 'Übernehmen');
	w.localStorage.setItem('language', '{not json');
	w.QDCommon.useLanguage();
	assert.equal(w.QDCommon.text('buttonApply'), 'Apply', 'a damaged copy: Firefox\'s language');
});

test('app.Language: the chosen language is read once and stored for the pages; Firefox\'s removes the copy', async () => {
	const w = background();
	await w.app.Language.apply();
	assert.deepEqual([w.reads, stored(w)], [[], null], 'Firefox\'s language: nothing to read');
	w.app.settings.language = 'uk';
	await w.app.Language.apply();
	assert.deepEqual(w.reads, ['/_locales/uk/messages.json']);
	assert.equal(stored(w).language, 'uk');
	assert.equal(stored(w).messages.buttonApply, 'Застосувати');
	assert.equal(w.QDCommon.text('buttonApply'), 'Застосувати');
	await w.app.Language.apply();
	assert.equal(w.reads.length, 1, 'the same language again: not read again');
	w.app.settings.language = '';
	await w.app.Language.apply();
	assert.deepEqual([stored(w), w.QDCommon.text('buttonApply')], [null, 'Apply']);
});

test('app.Language: a language that can\'t be read, or isn\'t known, leaves Firefox\'s', async () => {
	const w = background();
	w.app.settings.language = 'uk';
	await w.app.Language.apply();
	const errors = [];
	w.console = { error: (...a) => errors.push(a[0]) };
	w.fetch = () => Promise.reject(new Error('gone'));
	w.app.settings.language = 'de';
	await w.app.Language.apply();
	assert.deepEqual([stored(w), w.QDCommon.text('buttonApply'), errors.length], [null, 'Apply', 1]);
	w.app.settings.language = 'xx';
	await w.app.Language.apply();
	assert.deepEqual([stored(w), w.QDCommon.language()], [null, 'en']);
});

test('app.Language: when two languages are applied quickly, the last one wins', async () => {
	const w = background();
	const slow = w.fetch;
	w.fetch = url => url.includes('/de/') ? settle(50).then(() => slow(url)) : slow(url);
	w.app.settings.language = 'de';
	const first = w.app.Language.apply();
	w.app.settings.language = 'uk';
	await Promise.all([first, w.app.Language.apply()]);
	assert.equal(stored(w).language, 'uk');
	assert.equal(w.QDCommon.language(), 'uk');
});

test('app.Language: after a failed load the defaults are not the user\'s, so the stored copy stays', async () => {
	const w = background();
	w.localStorage.setItem('language', JSON.stringify({ language: 'uk', messages: texts('uk') }));
	w.app.Settings._loadFailed = true;
	await w.app.Language.apply();
	assert.deepEqual([w.reads, stored(w).language], [[], 'uk']);
	assert.equal(plain(w.app.settings).language, '', 'the default: Firefox\'s language');
});
