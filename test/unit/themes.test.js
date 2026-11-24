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

const { QDThemes: Themes } = load('js/themes.js');
// The tile style (grid.cells) a style comes out of normalize() with
const normalizedCells = style => plain(Themes.normalize(style)).grid.cells;
const CLASSIC = Themes.BUILTIN[0], ANORI = Themes.BUILTIN[1];
// Classic's values that the tests below expect a bad value to be replaced by
const CLASSIC_MARGIN = 4, CLASSIC_BORDER_COLOR = '#333333', CLASSIC_FONT = 'Arial, Verdana, Sans-serif', CLASSIC_PAGE_COLOR = '#3c4048';
// The largest blur a tile may have (normalize clamps to it)
const MAX_BLUR = 40;

test('the built-in themes: Classic first, as the normalized CLASSIC style; each valid and with its own id', () => {
	assert.deepEqual(plain(Themes.BUILTIN.map(theme => theme.name)), BUILTIN_THEMES);
	assert.equal(new Set(Themes.BUILTIN.map(theme => theme.id)).size, Themes.BUILTIN.length);
	for (const theme of Themes.BUILTIN) assert.deepEqual(plain(Themes.normalize(theme.style)), plain(theme.style), theme.name);
	assert.deepEqual(plain(CLASSIC.style), plain(Themes.normalize(Themes.CLASSIC)));
	assert.ok(Themes.equal(Themes.CLASSIC, {}), 'an empty style is Classic');
});

test('numbers are clamped to their range and rounded to their step', () => {
	const cells = normalizedCells({ grid: { cells: { blur: 999, margin: '7', opacity: 0.333, titleFontSize: 10.3, borderRadius: -5, shadow: 1.6 } } });
	assert.equal(cells.blur, MAX_BLUR);
	assert.equal(cells.margin, 7);
	assert.equal(cells.opacity, 0.33);
	assert.equal(cells.titleFontSize, 10.5);
	assert.equal(cells.borderRadius, 0);
	assert.equal(cells.shadow, 2);
	assert.equal(normalizedCells({ grid: { cells: { blur: 'x', margin: '', opacity: NaN } } }).margin, CLASSIC_MARGIN, 'not a number: the Classic value');
});

test('colours, switches and fonts: valid values kept, others replaced by Classic', () => {
	const cells = normalizedCells({ grid: { cells: { titleColor: '#AABBCC', borderColor: 'red', backgroundColor: null, titleBackgroundColor: 'nope', title: 'yes', titleBold: true,
		titleFont: 'Georgia, "Times New Roman", serif' } } });
	assert.equal(cells.titleColor, '#aabbcc');
	assert.equal(cells.borderColor, CLASSIC_BORDER_COLOR);
	assert.equal(cells.backgroundColor, null, 'null is allowed where a colour is optional');
	assert.equal(cells.titleBackgroundColor, null);
	assert.equal(cells.title, true);
	assert.equal(cells.titleBold, true);
	assert.equal(cells.titleFont, 'Georgia, "Times New Roman", serif');
	assert.equal(normalizedCells({ grid: { cells: { titleFont: 'x;} body{display:none' } } }).titleFont, CLASSIC_FONT);
	assert.equal(plain(Themes.normalize({ backgroundColor: null })).backgroundColor, CLASSIC_PAGE_COLOR, 'the page colour is required');
});

test('gradients only: no url(), nothing that ends a CSS declaration', () => {
	const normalizedGradient = value => Themes.normalize({ backgroundGradient: value }).backgroundGradient;
	assert.equal(normalizedGradient('linear-gradient(red, blue)'), 'linear-gradient(red, blue)');
	assert.equal(normalizedGradient(' repeating-radial-gradient(red, blue) '), 'repeating-radial-gradient(red, blue)');
	assert.equal(normalizedGradient(null), null);
	const TOO_LONG = 'linear-gradient(' + 'a'.repeat(2000) + ')';
	for (const bad of ['linear-gradient(red, blue), url(https://evil.example/x.png)', 'linear-gradient(red, blue); color: red', 'url(x.png)', 'red', 'linear-gradient(red, blue) }', TOO_LONG])
		assert.equal(normalizedGradient(bad), null, bad);
});

test('extract and apply touch the style only; unknown keys are dropped', () => {
	const settings = { backgroundImage: 'url(x)', grid: { rows: 3, root: 'Dial', cells: { margin: 9, previewWidth: 1200 } }, backgroundColor: '#010203' };
	const style = plain(Themes.extract(settings));
	assert.equal(style.grid.rows, undefined);
	assert.equal(style.grid.cells.previewWidth, undefined);
	assert.equal(style.backgroundImage, undefined);
	assert.equal(style.grid.cells.margin, 9);
	Themes.apply(settings, ANORI.style);
	assert.equal(settings.grid.rows, 3);
	assert.equal(settings.grid.root, 'Dial');
	assert.equal(settings.backgroundImage, 'url(x)');
	assert.equal(settings.accentColor, '#00794a');
	assert.ok(Themes.equal(Themes.extract(settings), ANORI.style));
});

test('complete adds the style keys older settings lack, once', () => {
	const settings = { backgroundColor: '#000000', grid: { cells: { margin: 2 } } };
	assert.equal(Themes.complete(settings), true);
	assert.equal(settings.grid.cells.margin, 2);
	assert.equal(settings.grid.cells.hoverEffect, Themes.HoverEffect.instant);
	assert.equal(settings.grid.cells.clickEffect, Themes.ClickEffect.none, 'no click effect for settings from before 0.8.0');
	assert.equal(settings.accentColor, null);
	assert.equal(Themes.complete(settings), false);
});

test('choices from a list (hover effect, click effect, title position, shadow) accept just the listed values', () => {
	const choices = { hoverEffect: Themes.HoverEffect, clickEffect: Themes.ClickEffect, titlePosition: Themes.TitlePosition, shadow: Themes.Shadow };
	for (const [key, list] of Object.entries(choices)) {
		const values = Object.values(list), highest = Math.max(...values);
		for (const value of values) assert.equal(normalizedCells({ grid: { cells: { [key]: value } } })[key], value, key + ' ' + value);
		assert.equal(normalizedCells({ grid: { cells: { [key]: highest + 1 } } })[key], highest, key + ': above the list, its last value');
	}
});

test('the hover transform: lift and grow move the tile, the others don\'t', () => {
	const HoverEffect = Themes.HoverEffect;
	assert.match(Themes.hoverTransform(HoverEffect.lift), /translateY\(-\d+px\)/);
	assert.match(Themes.hoverTransform(HoverEffect.grow), /scale\(1\.\d+\)/);
	assert.equal(Themes.hoverTransform(HoverEffect.smooth), '');
	assert.equal(Themes.hoverTransform(HoverEffect.instant), '');
	assert.equal(Themes.hoverTransform(String(HoverEffect.grow)), Themes.hoverTransform(HoverEffect.grow), 'a form value works too');
});

test('click effects: one of the listed ones, with CSS for each and none for None', () => {
	const ClickEffect = Themes.ClickEffect;
	const TILE_SELECTOR = '.qd-tile';
	const EFFECT_COLOR = '#33ccff';
	assert.equal(normalizedCells({ grid: { cells: { clickEffect: 9 } } }).clickEffect, ClickEffect.ring, 'above the range: the last one');
	assert.equal(normalizedCells({ grid: { cells: { clickEffect: 'ripple' } } }).clickEffect, ClickEffect.none, 'not a number: none');
	assert.deepEqual(plain(Themes.clickEffectRules(TILE_SELECTOR, ClickEffect.none, EFFECT_COLOR)), []);
	for (const [name, effect] of Object.entries(ClickEffect)) {
		if (effect === ClickEffect.none) continue;
		const css = plain(Themes.clickEffectRules(TILE_SELECTOR, effect, EFFECT_COLOR)).join('\n');
		assert.match(css, /@keyframes qd-click-/, name);
		assert.ok(css.includes(TILE_SELECTOR + '.is-clicked'), name);
		const reducedMotionRule = (css.match(/@media \(prefers-reduced-motion: reduce\).*/) || [''])[0];
		if (effect === ClickEffect.flash) assert.equal(reducedMotionRule, '', 'flash: nothing moves, the same with reduced motion');
		else assert.match(reducedMotionRule, /qd-click-flash|qd-click-ring-fade/, name + ': with reduced motion, a flash or a fade instead');
	}
	assert.ok(plain(Themes.clickEffectRules(TILE_SELECTOR, ClickEffect.ripple, EFFECT_COLOR)).join('').includes(EFFECT_COLOR), 'the ripple has the given colour');
});

test('theme files round-trip; descriptions and names are cleaned', () => {
	const MAX_NAME_LENGTH = 60;
	for (const theme of Themes.BUILTIN) {
		const readBack = Themes.fromFile(JSON.parse(JSON.stringify(Themes.toFile(theme))));
		assert.equal(readBack.name, theme.name);
		assert.ok(Themes.equal(readBack.style, theme.style), theme.name);
	}
	const themeFile = Themes.toFile({ name: ' Line\nbreak ' + 'x'.repeat(80), description: 'a\tb', style: {} });
	assert.equal(themeFile.format, 'quickdial-ng-theme');
	assert.equal(themeFile.version, 1);
	assert.equal(themeFile.name.length, MAX_NAME_LENGTH);
	assert.ok(themeFile.name.startsWith('Line break'));
	assert.equal(themeFile.description, 'a b');
});

test('fromFile says what is wrong with a file (the key of the text Settings shows)', () => {
	const errorKeyFor = data => { try { Themes.fromFile(data); return 'no error'; } catch (e) { return e.message; } };
	assert.equal(errorKeyFor({ format: 'quickdial-ng', settings: {} }), 'themeFileIsBackup');
	assert.equal(errorKeyFor({ hello: 1 }), 'themeFileInvalid');
	assert.equal(errorKeyFor(null), 'themeFileInvalid');
	assert.equal(errorKeyFor({ format: 'quickdial-ng-theme', version: 2, name: 'x', style: {} }), 'themeFileNewer');
	assert.equal(errorKeyFor({ format: 'quickdial-ng-theme', version: 1, name: '  ', style: {} }), 'themeFileNoName');
	assert.equal(errorKeyFor({ format: 'quickdial-ng-theme', version: 1, name: 'x', style: 'red' }), 'themeFileInvalid');
});

test('cleanList keeps valid custom themes once; built-in names and broken entries go', () => {
	assert.deepEqual(plain(Themes.cleanList('nope')), []);
	const list = Themes.cleanList([{ name: 'Mine', style: {} }, { name: ' mine ', style: {} }, { name: 'classic', style: {} }, { name: 'ANORI', style: {} }, { nameless: true }, null,
		{ name: 'Other', style: { grid: { cells: { blur: 5 } } } }]);
	assert.deepEqual(plain(list.map(theme => theme.name)), ['Mine', 'Other']);
	assert.equal(list[1].style.grid.cells.blur, 5);
	assert.ok(Themes.isBuiltinName(' anori '));
	assert.ok(!Themes.isBuiltinName('Mine'));
});

test('file names', () => {
	assert.equal(Themes.fileName('My Theme!'), 'quickdial-ng-theme-my-theme.json');
	assert.equal(Themes.fileName('!!!'), 'quickdial-ng-theme-custom.json');
	assert.equal(Themes.fileName(''), 'quickdial-ng-theme-custom.json');
});

test('CSS helpers: rgba, background layers, shadows', () => {
	assert.equal(Themes.rgba('#ff8000', 0.5), 'rgba(255, 128, 0, 0.5)');
	assert.equal(Themes.rgba('#ff8000', 1), '#ff8000');
	assert.equal(Themes.rgba('#ff8000'), '#ff8000');
	assert.equal(Themes.rgba(null, 0.5), 'transparent');
	assert.equal(Themes.rgba('#000000', -1), 'rgba(0, 0, 0, 0)');
	assert.equal(Themes.background(null, null), 'none');
	assert.equal(Themes.background('url(a.png)', 'linear-gradient(red, blue)'), 'url(a.png), linear-gradient(red, blue)', 'the picture lies on top');
	assert.equal(Themes.background(null, 'linear-gradient(red, blue)'), 'linear-gradient(red, blue)');
	assert.equal(Themes.shadow(0), 'none');
	assert.match(Themes.shadow(1), /^0 2px 8px/);
	assert.match(Themes.shadow('2'), /^0 10px 28px/);
	assert.equal(Themes.shadow(9), 'none');
});
