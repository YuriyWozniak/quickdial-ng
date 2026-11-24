// The language files (src/_locales/<lang>/messages.json) against the code and against English.
//
// The code names its texts in a few ways: data-i18n, data-i18n-title, -placeholder and -aria-label in the
// pages, __MSG_key__ in manifest.json, and QDCommon.text('key'), QDCommon.countText('key', n) (key + One,
// Few, ... Other, by the language's plural rules), getMessage('key'), a built-in theme's nameKey and
// descriptionKey and the keys themes.js throws as Error messages. Every one of them must be in English,
// every English text must be used, and every other language must have the same texts with the same
// $1..$9 placeholders and <b>/<code>/<br> markup, plus every plural form its language needs.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', 'src');
const LOCALES = path.join(SRC, '_locales');
const PLURAL_FORMS = ['Zero', 'One', 'Two', 'Few', 'Many', 'Other'];
const PLURAL_KEY = /^(\w+?)(Zero|One|Two|Few|Many|Other)$/;
// The texts the code is expected to name at least (a sign the search found them)
const MIN_USED_KEYS = 200;
const capitalize = word => word.charAt(0).toUpperCase() + word.slice(1);

const readSource = file => fs.readFileSync(path.join(SRC, file), 'utf8');
// The .js and .html files under a folder of src
const sourceFiles = dir => fs.readdirSync(path.join(SRC, dir), { recursive: true }).map(file => path.join(dir, file)).filter(file => /\.(js|html)$/.test(file));
const messagesOf = lang => JSON.parse(fs.readFileSync(path.join(LOCALES, lang, 'messages.json'), 'utf8'));
const otherLanguages = fs.readdirSync(LOCALES).filter(lang => lang !== 'en');
const english = messagesOf('en');
// The first group of every match of a regular expression
const allMatches = (text, pattern) => [...text.matchAll(pattern)].map(match => match[1]);

// The first argument of each call to `name` in a script, e.g. "cond ? 'a' : 'b'" for text(cond ? 'a' : 'b', x).
function firstArguments(script, name) {
	const found = [];
	for (const call of script.matchAll(new RegExp('\\b' + name + '\\(', 'g'))) {
		const start = call.index + call[0].length;
		let depth = 0, end = start;
		for (; end < script.length; end++) {
			const character = script[end];
			if (character === '(' || character === '[' || character === '{') depth++;
			else if ((character === ')' || character === ']' || character === '}') && depth-- === 0) break;
			else if (character === ',' && depth === 0) break;
		}
		found.push(script.slice(start, end));
	}
	return found;
}
// The string literals in code that look like message keys ('settingsVersion')
const keyLiterals = code => allMatches(code, /'([a-z]\w*)'/g);

// The keys the code names, and the countText bases among them.
function usedKeys() {
	const keys = new Set(), plurals = new Set();
	allMatches(readSource('manifest.json'), /__MSG_(\w+)__/g).forEach(key => keys.add(key));
	for (const file of sourceFiles('html')) allMatches(readSource(file), /data-i18n(?:-[\w-]+)?="(\w+)"/g).forEach(key => keys.add(key));
	for (const file of sourceFiles('js')) {
		const script = readSource(file);
		for (const name of ['text', 'getMessage', 'new Error']) firstArguments(script, name).forEach(arg => keyLiterals(arg).forEach(key => keys.add(key)));
		allMatches(script, /\b(?:nameKey|descriptionKey):\s*'(\w+)'/g).forEach(key => keys.add(key));
		firstArguments(script, 'countText').forEach(arg => keyLiterals(arg).forEach(key => plurals.add(key)));
	}
	return { keys, plurals };
}

test('locales: every text the code uses is in English', () => {
	const { keys, plurals } = usedKeys();
	assert.ok(keys.size > MIN_USED_KEYS, 'found the texts in the code');
	assert.deepEqual([...keys].filter(key => !(key in english)), []);
	assert.deepEqual([...plurals].filter(base => !(base + 'Other' in english) || !(base + 'One' in english)), []);
});

test('locales: every English text is used', () => {
	const { keys, plurals } = usedKeys();
	const unused = Object.keys(english).filter(key => {
		if (keys.has(key)) return false;
		const plural = PLURAL_KEY.exec(key);
		return !(plural && plurals.has(plural[1]));
	});
	assert.deepEqual(unused, []);
});

test('locales: every language has every English text with the same placeholders and markup', () => {
	const markup = message => (message.match(/<\/?(?:b|code)>|<br>/g) || []).join('');
	const placeholders = message => (message.match(/\$\d/g) || []).sort().join(',');
	for (const lang of otherLanguages) {
		const translated = messagesOf(lang);
		assert.deepEqual(Object.keys(english).filter(key => !(key in translated)), [], `${lang}: missing`);
		for (const [key, { message }] of Object.entries(translated)) {
			const plural = PLURAL_KEY.exec(key);
			if (!(key in english)) {
				assert.ok(plural && plural[1] + 'Other' in english, `${lang}: ${key} is not an English text`);
				continue;
			}
			assert.equal(markup(message), markup(english[key].message), `${lang}: ${key} markup`);
			if (!plural) assert.equal(placeholders(message), placeholders(english[key].message), `${lang}: ${key} placeholders`);
		}
	}
});

test('locales: every plural form a language needs is there', () => {
	const { plurals } = usedKeys();
	for (const lang of ['en', ...otherLanguages]) {
		const translated = messagesOf(lang), forms = new Intl.PluralRules(lang.replace('_', '-')).resolvedOptions().pluralCategories;
		for (const base of plurals) for (const form of forms) {
			assert.ok(PLURAL_FORMS.includes(capitalize(form)), form);
			assert.ok(base + capitalize(form) in translated, `${lang}: ${base}${capitalize(form)}`);
		}
	}
});
