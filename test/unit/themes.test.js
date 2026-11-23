// QDThemes (js/themes.js): the style rules, theme files and CSS helpers, shared by the background page,
// the dial and Settings.
//
// themes.js is loaded on its own into a sandbox (./load.js); it needs nothing else. A style is the part of
// the settings a theme sets (CLASSIC shows all its keys: colours, page margin, tile and title styles);
// normalize() is the gate every style passes: valid values are kept, others replaced by Classic's.
// Values made in the sandbox are compared through plain() (another realm's arrays and objects).
// Related: storing custom themes and putting one on the dial are integration tests (integration/themes.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./load');
const { BUILTIN_THEMES } = require('../lib/fixtures');

const { QDThemes: T } = load('js/themes.js');
const cells = style => plain(T.normalize(style)).grid.cells;

test('the built-in themes: Classic first, as the normalized CLASSIC style; each valid and with its own id', () => {
	assert.deepEqual(plain(T.BUILTIN.map(t => t.name)), BUILTIN_THEMES);
	assert.equal(new Set(T.BUILTIN.map(t => t.id)).size, T.BUILTIN.length);
	for (const theme of T.BUILTIN) assert.deepEqual(plain(T.normalize(theme.style)), plain(theme.style), theme.name);
	assert.deepEqual(plain(T.BUILTIN[0].style), plain(T.normalize(T.CLASSIC)));
	assert.ok(T.equal(T.CLASSIC, {}), 'an empty style is Classic');
});

test('numbers are clamped to their range and rounded to their step', () => {
	const c = cells({ grid: { cells: { blur: 999, margin: '7', opacity: 0.333, titleFontSize: 10.3, borderRadius: -5, shadow: 1.6 } } });
	assert.equal(c.blur, 40);
	assert.equal(c.margin, 7);
	assert.equal(c.opacity, 0.33);
	assert.equal(c.titleFontSize, 10.5);
	assert.equal(c.borderRadius, 0);
	assert.equal(c.shadow, 2);
	assert.equal(cells({ grid: { cells: { blur: 'x', margin: '', opacity: NaN } } }).margin, 4, 'not a number: the Classic value');
});

test('colours, switches and fonts: valid values kept, others replaced by Classic', () => {
	const c = cells({ grid: { cells: { titleColor: '#AABBCC', borderColor: 'red', backgroundColor: null, titleBackgroundColor: 'nope', title: 'yes', titleBold: true, titleFont: 'Georgia, "Times New Roman", serif' } } });
	assert.equal(c.titleColor, '#aabbcc');
	assert.equal(c.borderColor, '#333333');
	assert.equal(c.backgroundColor, null, 'null is allowed where a colour is optional');
	assert.equal(c.titleBackgroundColor, null);
	assert.equal(c.title, true);
	assert.equal(c.titleBold, true);
	assert.equal(c.titleFont, 'Georgia, "Times New Roman", serif');
	assert.equal(cells({ grid: { cells: { titleFont: 'x;} body{display:none' } } }).titleFont, 'Arial, Verdana, Sans-serif');
	assert.equal(plain(T.normalize({ backgroundColor: null })).backgroundColor, '#3c4048', 'the page colour is required');
});

test('gradients only: no url(), nothing that ends a CSS declaration', () => {
	const g = v => T.normalize({ backgroundGradient: v }).backgroundGradient;
	assert.equal(g('linear-gradient(red, blue)'), 'linear-gradient(red, blue)');
	assert.equal(g(' repeating-radial-gradient(red, blue) '), 'repeating-radial-gradient(red, blue)');
	assert.equal(g(null), null);
	for (const bad of ['linear-gradient(red, blue), url(https://evil.example/x.png)', 'linear-gradient(red, blue); color: red', 'url(x.png)', 'red', 'linear-gradient(red, blue) }', 'linear-gradient(' + 'a'.repeat(2000) + ')'])
		assert.equal(g(bad), null, bad);
});

test('extract and apply touch the style only; unknown keys are dropped', () => {
	const settings = { backgroundImage: 'url(x)', grid: { rows: 3, root: 'Dial', cells: { margin: 9, previewWidth: 1200 } }, backgroundColor: '#010203' };
	const style = plain(T.extract(settings));
	assert.equal(style.grid.rows, undefined);
	assert.equal(style.grid.cells.previewWidth, undefined);
	assert.equal(style.backgroundImage, undefined);
	assert.equal(style.grid.cells.margin, 9);
	T.apply(settings, T.BUILTIN[1].style);
	assert.equal(settings.grid.rows, 3);
	assert.equal(settings.grid.root, 'Dial');
	assert.equal(settings.backgroundImage, 'url(x)');
	assert.equal(settings.accentColor, '#00794a');
	assert.ok(T.equal(T.extract(settings), T.BUILTIN[1].style));
});

test('complete adds the style keys older settings lack, once', () => {
	const s = { backgroundColor: '#000000', grid: { cells: { margin: 2 } } };
	assert.equal(T.complete(s), true);
	assert.equal(s.grid.cells.margin, 2);
	assert.equal(s.grid.cells.hoverEffect, 0);
	assert.equal(s.grid.cells.clickEffect, 0, 'no click effect for settings from before 0.8.0');
	assert.equal(s.accentColor, null);
	assert.equal(T.complete(s), false);
});

test('click effects: one of the listed ones, with CSS for each and none for None', () => {
	const TILE_SELECTOR = '.qd-tile';
	const EFFECT_COLOR = '#33ccff';
	assert.equal(cells({ grid: { cells: { clickEffect: 9 } } }).clickEffect, T.ClickEffect.ring, 'above the range: the last one');
	assert.equal(cells({ grid: { cells: { clickEffect: 'ripple' } } }).clickEffect, T.ClickEffect.none, 'not a number: none');
	assert.deepEqual(plain(T.clickEffectRules(TILE_SELECTOR, T.ClickEffect.none, EFFECT_COLOR)), []);
	for (const [name, effect] of Object.entries(T.ClickEffect)) {
		if (effect === T.ClickEffect.none) continue;
		const css = plain(T.clickEffectRules(TILE_SELECTOR, effect, EFFECT_COLOR)).join('\n');
		assert.match(css, /@keyframes qd-click-/, name);
		assert.ok(css.includes(TILE_SELECTOR + '.is-clicked'), name);
		assert.match(css, /prefers-reduced-motion: reduce/, name + ': still with reduced motion');
	}
	assert.ok(plain(T.clickEffectRules(TILE_SELECTOR, T.ClickEffect.ripple, EFFECT_COLOR)).join('').includes(EFFECT_COLOR), 'the ripple has the given colour');
});

test('theme files round-trip; descriptions and names are cleaned', () => {
	for (const theme of T.BUILTIN) {
		const back = T.fromFile(JSON.parse(JSON.stringify(T.toFile(theme))));
		assert.equal(back.name, theme.name);
		assert.ok(T.equal(back.style, theme.style), theme.name);
	}
	const f = T.toFile({ name: ' Line\nbreak ' + 'x'.repeat(80), description: 'a\tb', style: {} });
	assert.equal(f.format, 'quickdial-ng-theme');
	assert.equal(f.version, 1);
	assert.equal(f.name.length, 60);
	assert.ok(f.name.startsWith('Line break'));
	assert.equal(f.description, 'a b');
});

test('fromFile explains what is wrong with a file', () => {
	const err = data => { try { T.fromFile(data); return 'no error'; } catch (e) { return e.message; } };
	assert.match(err({ format: 'quickdial-ng', settings: {} }), /full Quick Dial NG backup/);
	assert.match(err({ hello: 1 }), /not a Quick Dial NG theme/);
	assert.match(err(null), /not a Quick Dial NG theme/);
	assert.match(err({ format: 'quickdial-ng-theme', version: 2, name: 'x', style: {} }), /newer version/);
	assert.match(err({ format: 'quickdial-ng-theme', version: 1, name: '  ', style: {} }), /no name/);
	assert.match(err({ format: 'quickdial-ng-theme', version: 1, name: 'x', style: 'red' }), /not a Quick Dial NG theme/);
});

test('cleanList keeps valid custom themes once; built-in names and broken entries go', () => {
	assert.deepEqual(plain(T.cleanList('nope')), []);
	const list = T.cleanList([{ name: 'Mine', style: {} }, { name: ' mine ', style: {} }, { name: 'classic', style: {} }, { name: 'ANORI', style: {} }, { nameless: true }, null, { name: 'Other', style: { grid: { cells: { blur: 5 } } } }]);
	assert.deepEqual(plain(list.map(t => t.name)), ['Mine', 'Other']);
	assert.equal(list[1].style.grid.cells.blur, 5);
	assert.ok(T.isBuiltinName(' anori '));
	assert.ok(!T.isBuiltinName('Mine'));
});

test('file names', () => {
	assert.equal(T.fileName('My Theme!'), 'quickdial-ng-theme-my-theme.json');
	assert.equal(T.fileName('!!!'), 'quickdial-ng-theme-custom.json');
	assert.equal(T.fileName(''), 'quickdial-ng-theme-custom.json');
});

test('CSS helpers: rgba, background layers, shadows', () => {
	assert.equal(T.rgba('#ff8000', 0.5), 'rgba(255, 128, 0, 0.5)');
	assert.equal(T.rgba('#ff8000', 1), '#ff8000');
	assert.equal(T.rgba('#ff8000'), '#ff8000');
	assert.equal(T.rgba(null, 0.5), 'transparent');
	assert.equal(T.rgba('#000000', -1), 'rgba(0, 0, 0, 0)');
	assert.equal(T.background(null, null), 'none');
	assert.equal(T.background('url(a.png)', 'linear-gradient(red, blue)'), 'url(a.png), linear-gradient(red, blue)', 'the picture lies on top');
	assert.equal(T.background(null, 'linear-gradient(red, blue)'), 'linear-gradient(red, blue)');
	assert.equal(T.shadow(0), 'none');
	assert.match(T.shadow(1), /^0 2px 8px/);
	assert.match(T.shadow('2'), /^0 10px 28px/);
	assert.equal(T.shadow(9), 'none');
});
