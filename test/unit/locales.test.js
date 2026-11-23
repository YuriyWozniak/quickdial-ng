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
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

const read = file => fs.readFileSync(path.join(SRC, file), 'utf8');
const files = dir => fs.readdirSync(path.join(SRC, dir), { recursive: true }).map(f => path.join(dir, f)).filter(f => /\.(js|html)$/.test(f));
const messages = lang => JSON.parse(fs.readFileSync(path.join(LOCALES, lang, 'messages.json'), 'utf8'));
const languages = fs.readdirSync(LOCALES).filter(d => d !== 'en');
const en = messages('en');
const all = (text, re) => [...text.matchAll(re)].map(m => m[1]);

// The first argument of each call to `name` in js, e.g. "cond ? 'a' : 'b'" for text(cond ? 'a' : 'b', x).
function firstArguments(js, name) {
	const found = [];
	for (const m of js.matchAll(new RegExp('\\b' + name + '\\(', 'g'))) {
		let depth = 0, i = m.index + m[0].length;
		for (; i < js.length; i++) {
			const c = js[i];
			if (c === '(' || c === '[' || c === '{') depth++;
			else if ((c === ')' || c === ']' || c === '}') && depth-- === 0) break;
			else if (c === ',' && depth === 0) break;
		}
		found.push(js.slice(m.index + m[0].length, i));
	}
	return found;
}
const literals = code => all(code, /'([a-z]\w*)'/g);

// The keys the code names, and the countText bases among them.
function usedKeys() {
	const keys = new Set(), plurals = new Set();
	all(read('manifest.json'), /__MSG_(\w+)__/g).forEach(k => keys.add(k));
	for (const file of files('html')) all(read(file), /data-i18n(?:-[\w-]+)?="(\w+)"/g).forEach(k => keys.add(k));
	for (const file of files('js')) {
		const js = read(file);
		for (const name of ['text', 'getMessage', 'new Error']) firstArguments(js, name).forEach(arg => literals(arg).forEach(k => keys.add(k)));
		all(js, /\b(?:nameKey|descriptionKey):\s*'(\w+)'/g).forEach(k => keys.add(k));
		firstArguments(js, 'countText').forEach(arg => literals(arg).forEach(k => plurals.add(k)));
	}
	return { keys, plurals };
}

test('locales: every text the code uses is in English', () => {
	const { keys, plurals } = usedKeys();
	assert.ok(keys.size > 200, 'found the texts in the code');
	assert.deepEqual([...keys].filter(k => !(k in en)), []);
	assert.deepEqual([...plurals].filter(k => !(k + 'Other' in en) || !(k + 'One' in en)), []);
});

test('locales: every English text is used', () => {
	const { keys, plurals } = usedKeys();
	const unused = Object.keys(en).filter(k => {
		if (keys.has(k)) return false;
		const plural = PLURAL_KEY.exec(k);
		return !(plural && plurals.has(plural[1]));
	});
	assert.deepEqual(unused, []);
});

test('locales: every language has every English text with the same placeholders and markup', () => {
	const markup = s => (s.match(/<\/?(?:b|code)>|<br>/g) || []).join('');
	const placeholders = s => (s.match(/\$\d/g) || []).sort().join(',');
	for (const lang of languages) {
		const m = messages(lang);
		assert.deepEqual(Object.keys(en).filter(k => !(k in m)), [], `${lang}: missing`);
		for (const [key, { message }] of Object.entries(m)) {
			const plural = PLURAL_KEY.exec(key);
			if (!(key in en)) {
				assert.ok(plural && plural[1] + 'Other' in en, `${lang}: ${key} is not an English text`);
				continue;
			}
			assert.equal(markup(message), markup(en[key].message), `${lang}: ${key} markup`);
			if (!plural) assert.equal(placeholders(message), placeholders(en[key].message), `${lang}: ${key} placeholders`);
		}
	}
});

test('locales: every plural form a language needs is there', () => {
	const { plurals } = usedKeys();
	for (const lang of ['en', ...languages]) {
		const m = messages(lang), forms = new Intl.PluralRules(lang.replace('_', '-')).resolvedOptions().pluralCategories;
		for (const base of plurals) for (const form of forms) {
			assert.ok(PLURAL_FORMS.includes(capitalize(form)), form);
			assert.ok(base + capitalize(form) in m, `${lang}: ${base}${capitalize(form)}`);
		}
	}
});
