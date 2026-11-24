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
const { messagesOf } = require('../lib/fixtures');

const LOCALES = path.join(__dirname, '..', '..', 'src', '_locales');
// A language's messages.json as it is on disk ({ key: { message } })
const messagesFile = lang => JSON.parse(fs.readFileSync(path.join(LOCALES, lang, 'messages.json'), 'utf8'));

// A background sandbox whose fetch reads the language files; sandbox.reads lists the files read
function background() {
	const sandbox = loadBackground();
	sandbox.reads = [];
	sandbox.browser.runtime.getURL = extensionPath => '/' + extensionPath;
	sandbox.fetch = url => {
		sandbox.reads.push(url);
		const match = /^\/_locales\/(\w+)\/messages\.json$/.exec(url);
		return match && fs.existsSync(path.join(LOCALES, match[1])) ? Promise.resolve({ json: () => Promise.resolve(messagesFile(match[1])) }) : Promise.reject(new Error('not found: ' + url));
	};
	sandbox.app.settings = sandbox.app.Settings.defaults();
	return sandbox;
}
// The copy of the chosen language's texts the background page keeps for the pages, or null
const storedCopy = sandbox => JSON.parse(sandbox.localStorage.getItem(sandbox.QDCommon.LANGUAGE_KEY));

test('LANGUAGES: one name for every folder of _locales', () => {
	const sandbox = load('js/common.js');
	assert.deepEqual(Object.keys(sandbox.QDCommon.LANGUAGES).sort(), fs.readdirSync(LOCALES).sort());
});

test('texts: Firefox\'s language until another one is chosen, then that one', () => {
	const Common = load('js/common.js').QDCommon;
	assert.deepEqual([Common.text('settingsVersion', '1.2'), Common.language(), Common.direction()], ['Version 1.2', 'en', 'ltr']);
	Common.useLanguage({ language: 'uk', messages: messagesOf('uk') });
	assert.deepEqual([Common.text('settingsVersion', '1.2'), Common.language(), Common.direction()], ['Версія 1.2', 'uk', 'ltr']);
	assert.deepEqual([1, 3, 5, 21, 1.5].map(count => Common.countText('countTiles', count)), ['1 плитка', '3 плитки', '5 плиток', '21 плитка', '1.5 плитки']);
	Common.useLanguage({ language: 'he_IL', messages: messagesOf('he_IL') });
	assert.deepEqual([Common.language(), Common.direction(), Common.countText('countFolders', 2), Common.countText('countFolders', 7)], ['he-IL', 'rtl', 'שתי תיקיות', '7 תיקיות']);
	Common.useLanguage(null);
	assert.deepEqual([Common.text('settingsVersion', '1.2'), Common.language()], ['Version 1.2', 'en']);
});

test('texts: a language that isn\'t one of LANGUAGES, or has no texts, is Firefox\'s', () => {
	const Common = load('js/common.js').QDCommon;
	for (const chosen of [{ language: 'xx', messages: { settingsVersion: 'X $1' } }, { language: 'toString', messages: {} }, { language: 'uk' }, 'uk']) {
		Common.useLanguage(chosen);
		assert.deepEqual([Common.text('settingsVersion', '1'), Common.language()], ['Version 1', 'en'], JSON.stringify(chosen));
	}
});

test('texts: a page starts in the language the background page stored, and follows it when told', () => {
	const sandbox = load('js/common.js');
	assert.equal(sandbox.QDCommon.language(), 'en', 'nothing stored: Firefox\'s');
	sandbox.localStorage.setItem('language', JSON.stringify({ language: 'de', messages: messagesOf('de') }));
	sandbox.QDCommon.useLanguage();
	assert.equal(sandbox.QDCommon.text('buttonApply'), 'Übernehmen');
	sandbox.localStorage.setItem('language', '{not json');
	sandbox.QDCommon.useLanguage();
	assert.equal(sandbox.QDCommon.text('buttonApply'), 'Apply', 'a damaged copy: Firefox\'s language');
});

test('app.Language: the chosen language is read once and stored for the pages; Firefox\'s removes the copy', async () => {
	const sandbox = background();
	await sandbox.app.Language.apply();
	assert.deepEqual([sandbox.reads, storedCopy(sandbox)], [[], null], 'Firefox\'s language: nothing to read');
	sandbox.app.settings.language = 'uk';
	await sandbox.app.Language.apply();
	assert.deepEqual(sandbox.reads, ['/_locales/uk/messages.json']);
	assert.equal(storedCopy(sandbox).language, 'uk');
	assert.equal(storedCopy(sandbox).messages.buttonApply, 'Застосувати');
	assert.equal(sandbox.QDCommon.text('buttonApply'), 'Застосувати');
	await sandbox.app.Language.apply();
	assert.equal(sandbox.reads.length, 1, 'the same language again: not read again');
	sandbox.app.settings.language = '';
	await sandbox.app.Language.apply();
	assert.deepEqual([storedCopy(sandbox), sandbox.QDCommon.text('buttonApply')], [null, 'Apply']);
});

test('app.Language: a language that can\'t be read, or isn\'t known, leaves Firefox\'s', async () => {
	const sandbox = background();
	sandbox.app.settings.language = 'uk';
	await sandbox.app.Language.apply();
	const errors = [];
	sandbox.console = { error: (...messageParts) => errors.push(messageParts[0]) };
	sandbox.fetch = () => Promise.reject(new Error('gone'));
	sandbox.app.settings.language = 'de';
	await sandbox.app.Language.apply();
	assert.deepEqual([storedCopy(sandbox), sandbox.QDCommon.text('buttonApply'), errors.length], [null, 'Apply', 1]);
	sandbox.app.settings.language = 'xx';
	await sandbox.app.Language.apply();
	assert.deepEqual([storedCopy(sandbox), sandbox.QDCommon.language()], [null, 'en']);
});

test('app.Language: when two languages are applied quickly, the last one wins', async () => {
	const sandbox = background();
	const readFromDisk = sandbox.fetch, GERMAN_DELAY = 50;
	sandbox.fetch = url => url.includes('/de/') ? settle(GERMAN_DELAY).then(() => readFromDisk(url)) : readFromDisk(url);
	sandbox.app.settings.language = 'de';
	const first = sandbox.app.Language.apply();
	sandbox.app.settings.language = 'uk';
	await Promise.all([first, sandbox.app.Language.apply()]);
	assert.equal(storedCopy(sandbox).language, 'uk');
	assert.equal(sandbox.QDCommon.language(), 'uk');
});

test('app.Language: after a failed load the defaults are not the user\'s, so the stored copy stays', async () => {
	const sandbox = background();
	sandbox.localStorage.setItem('language', JSON.stringify({ language: 'uk', messages: messagesOf('uk') }));
	sandbox.app.Settings._loadFailed = true;
	await sandbox.app.Language.apply();
	assert.deepEqual([sandbox.reads, storedCopy(sandbox).language], [[], 'uk']);
	assert.equal(plain(sandbox.app.settings).language, '', 'the default: Firefox\'s language');
});
