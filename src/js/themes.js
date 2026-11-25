// Quick Dial NG — themes: the look of the dial in one object, separate from the layout.
// A theme holds the background colour (and an optional CSS gradient), the accent colour of the
// dialogs, the page margin and every tile and title style. It never holds the number of rows and
// columns, the tile shape, the background picture or any behaviour, so applying one keeps the grid.
// Loaded by the background page (defaults), the Settings page (theme gallery, import/export) and the Properties
// page (the tile drawn as on the dial).
/* exported QDThemes */
// eslint-disable-next-line no-var -- a window property: the background page, Settings and the tests use it
var QDThemes = (function(){
	'use strict';

	// The values of the style settings that are a choice from a list
	// What a tile does under the pointer (grid.cells.hoverEffect): its styles change at once or smoothly, and then may lift or grow
	const HoverEffect = Object.freeze({ instant: 0, smooth: 1, lift: 2, grow: 3 });
	// What a tile does when it is clicked (grid.cells.clickEffect); see clickEffectRules
	const ClickEffect = Object.freeze({ none: 0, press: 1, bounce: 2, ripple: 3, flash: 4, ring: 5 });
	// Where the title is (grid.cells.titlePosition): under the picture, or over its bottom edge
	const TitlePosition = Object.freeze({ below: 0, over: 1 });
	// The tile shadow (grid.cells.shadow, shadowHover); see shadow()
	const Shadow = Object.freeze({ none: 0, soft: 1, strong: 2 });
	const last = list => Math.max(...Object.values(list)); // the highest value of one of these lists

	// Every style key with its Classic value (the defaults of a new install).
	// The shape mirrors the settings object, so extract/apply can walk both together.
	const CLASSIC = {
		backgroundColor: '#3c4048',
		backgroundGradient: null,
		accentColor: null,
		grid: {
			margin: 10,
			cells: {
				margin: 4,
				marginHover: 4,
				opacity: 1,
				opacityHover: 1,
				backgroundColor: null,
				backgroundColorHover: null,
				backgroundOpacity: 1,
				backgroundOpacityHover: 1,
				blur: 0,
				blurHover: 0,
				shadow: Shadow.none,
				shadowHover: Shadow.none,
				hoverEffect: HoverEffect.instant,
				clickEffect: ClickEffect.none,
				borderColor: '#333333',
				borderColorHover: '#a9a9a9',
				borderRadius: 4,
				borderRadiusHover: 4,
				borderSize: 1,
				borderSizeHover: 1,
				title: true,
				titleHover: true,
				titleHeight: 16,
				titleHeightHover: 16,
				titleFontSize: 10,
				titleFontSizeHover: 10,
				titleFont: 'Arial, Verdana, Sans-serif',
				titleBold: false,
				titlePosition: TitlePosition.below,
				titleColor: '#ffffff',
				titleColorHover: '#33ccff',
				titleBackgroundColor: null,
				titleBackgroundColorHover: null,
				titleBackgroundOpacity: 1,
				titleBackgroundOpacityHover: 1,
				titleBorderSize: 1,
				titleBorderSizeHover: 1
			}
		}
	};

	// What each value may be. Imported themes go through these checks, because the values end up in CSS text.
	// [min, max, step]: number; 'color' / 'color?': #rrggbb (or null); 'bool'; 'font'; 'gradient'
	const RULES = {
		backgroundColor: 'color', backgroundGradient: 'gradient', accentColor: 'color?',
		'grid.margin': [0, 200, 1],
		margin: [0, 100, 1], marginHover: [0, 100, 1],
		opacity: [0, 1, .01], opacityHover: [0, 1, .01],
		'cells.backgroundColor': 'color?', 'cells.backgroundColorHover': 'color?',
		backgroundOpacity: [0, 1, .01], backgroundOpacityHover: [0, 1, .01],
		blur: [0, 40, 1], blurHover: [0, 40, 1],
		shadow: [0, last(Shadow), 1], shadowHover: [0, last(Shadow), 1], hoverEffect: [0, last(HoverEffect), 1], clickEffect: [0, last(ClickEffect), 1],
		borderColor: 'color', borderColorHover: 'color',
		borderRadius: [0, 200, 1], borderRadiusHover: [0, 200, 1],
		borderSize: [0, 20, 1], borderSizeHover: [0, 20, 1],
		title: 'bool', titleHover: 'bool',
		titleHeight: [0, 100, 1], titleHeightHover: [0, 100, 1],
		titleFontSize: [1, 72, .5], titleFontSizeHover: [1, 72, .5],
		titleFont: 'font', titleBold: 'bool', titlePosition: [0, last(TitlePosition), 1],
		titleColor: 'color', titleColorHover: 'color',
		titleBackgroundColor: 'color?', titleBackgroundColorHover: 'color?',
		titleBackgroundOpacity: [0, 1, .01], titleBackgroundOpacityHover: [0, 1, .01],
		titleBorderSize: [0, 20, 1], titleBorderSizeHover: [0, 20, 1]
	};
	function rule(path){ // most specific name first: "grid.cells.backgroundColor" -> "cells.backgroundColor" -> "backgroundColor"
		const parts = path.split('.');
		for(let i = 0; i < parts.length; i++){
			const found = RULES[parts.slice(i).join('.')];
			if(found !== undefined) return found;
		}
		return null;
	}

	const COLOR = /^#[0-9a-f]{6}$/i;
	const FONT = /^[\w\s,"'-]{1,200}$/;
	const GRADIENT = /^\s*(repeating-)?(linear|radial|conic)-gradient\(/i;
	function clean(valueRule, value, fallback){ // a valid value, or the fallback
		if(Array.isArray(valueRule)){
			value = typeof value == 'string' && value.trim() !== '' ? +value : value;
			if(typeof value != 'number' || !isFinite(value)) return fallback;
			value = Math.min(valueRule[1], Math.max(valueRule[0], value));
			return +(Math.round(value / valueRule[2]) * valueRule[2]).toFixed(2);
		}
		switch(valueRule){
			case 'color': return typeof value == 'string' && COLOR.test(value) ? value.toLowerCase() : fallback;
			case 'color?': return value === null ? null : (typeof value == 'string' && COLOR.test(value) ? value.toLowerCase() : fallback);
			case 'bool': return typeof value == 'boolean' ? value : fallback;
			case 'font': return typeof value == 'string' && FONT.test(value) ? value.trim() : fallback;
			case 'gradient': // gradients only: no url() (no outside requests), nothing that could end the CSS declaration
				if(value === null) return null;
				return typeof value == 'string' && value.length <= 2000 && GRADIENT.test(value) && !/url\s*\(|[;{}<>\\]/i.test(value) ? value.trim() : fallback;
		}
		return fallback;
	}

	// Calls visit(path, classicValue) for every style key ("grid.cells.margin", 4)
	function walk(shape, prefix, visit){
		for(const key in shape){
			const path = prefix ? prefix + '.' + key : key;
			if(shape[key] && typeof shape[key] == 'object') walk(shape[key], path, visit);
			else visit(path, shape[key]);
		}
	}
	function get(obj, path){
		const parts = path.split('.');
		for(let i = 0; i < parts.length; i++){
			if(!obj || typeof obj != 'object') return undefined;
			obj = obj[parts[i]];
		}
		return obj;
	}
	// Keys that would reach Object.prototype instead of a style value; set() and derive() skip them
	function isStyleKey(key){ return key !== '__proto__' && key !== 'constructor' && key !== 'prototype'; }
	function set(obj, path, value){
		const parts = path.split('.');
		for(let i = 0; i < parts.length - 1; i++){
			if(!isStyleKey(parts[i])) return;
			if(!obj[parts[i]] || typeof obj[parts[i]] != 'object') obj[parts[i]] = {};
			obj = obj[parts[i]];
		}
		const key = parts[parts.length - 1];
		if(isStyleKey(key)) obj[key] = value;
	}

	// A complete, valid style: values from `style` where they pass the checks, Classic values elsewhere
	function normalize(style){
		const out = {};
		walk(CLASSIC, '', (path, def) => { set(out, path, clean(rule(path), get(style, path), def)); });
		return out;
	}
	// The style part of a settings object
	function extract(settings){ return normalize(settings); }
	// Writes a style into a settings object (layout and behaviour stay as they are)
	function apply(settings, style){
		style = normalize(style);
		walk(CLASSIC, '', path => { set(settings, path, get(style, path)); });
		return settings;
	}
	function equal(first, second){ return JSON.stringify(normalize(first)) === JSON.stringify(normalize(second)); }
	// Fills in style keys a settings object doesn't have yet (settings from older versions); returns true if any was added
	function complete(settings){
		let added = false;
		walk(CLASSIC, '', (path, def) => { if(get(settings, path) === undefined){ set(settings, path, def); added = true; } });
		return added;
	}

	// ---------- built-in themes ----------
	// `name` is the theme's identity (saved themes can't take it, theme files carry it); what the user sees are the
	// texts under nameKey and descriptionKey in the language files. suggestsIcons: the theme is drawn for icon pictures,
	// so Settings offers site icons for new tiles when it is used (the tiles' pictures stay as they are).
	const BUILTIN = [
		{ id: 'classic', builtin: true, name: 'Classic', nameKey: 'themeClassicName',
			descriptionKey: 'themeClassicDescription',
			style: normalize(CLASSIC) },
		{ id: 'anori', builtin: true, name: 'Anori', nameKey: 'themeAnoriName',
			descriptionKey: 'themeAnoriDescription',
			style: normalize({
				backgroundColor: '#06140d',
				backgroundGradient: 'radial-gradient(ellipse at 18% 12%, rgba(22, 151, 101, .38), transparent 55%), radial-gradient(ellipse at 85% 95%, rgba(0, 121, 73, .30), transparent 55%), linear-gradient(160deg, #0b2a1c 0%, #04110b 100%)',
				accentColor: '#00794a',
				grid: {
					margin: 24,
					cells: {
						margin: 8, marginHover: 8,
						opacity: 1, opacityHover: 1,
						backgroundColor: '#ffffff', backgroundColorHover: '#ffffff',
						backgroundOpacity: .06, backgroundOpacityHover: .12,
						blur: 14, blurHover: 18,
						shadow: Shadow.soft, shadowHover: Shadow.strong, hoverEffect: HoverEffect.lift,
						borderColor: '#2c5a45', borderColorHover: '#56c792',
						borderRadius: 14, borderRadiusHover: 14,
						borderSize: 1, borderSizeHover: 1,
						title: true, titleHover: true,
						titleHeight: 26, titleHeightHover: 26,
						titleFontSize: 9.5, titleFontSizeHover: 9.5,
						titleFont: 'system-ui, "Segoe UI", sans-serif', titleBold: false, titlePosition: TitlePosition.over,
						titleColor: '#e3f1ea', titleColorHover: '#ffffff',
						titleBackgroundColor: '#04110b', titleBackgroundColorHover: '#00794a',
						titleBackgroundOpacity: .78, titleBackgroundOpacityHover: .9,
						titleBorderSize: 0, titleBorderSizeHover: 0
					}
				}
			}) }
	];
	// A style that changes some values of another one (deep, without touching it)
	function derive(base, changes){
		const out = JSON.parse(JSON.stringify(base));
		(function merge(target, values){
			for(const key in values){
				if(!isStyleKey(key)) continue;
				if(values[key] && typeof values[key] == 'object') merge(target[key] || (target[key] = {}), values[key]);
				else target[key] = values[key];
			}
		})(out, changes);
		return normalize(out);
	}
	// Icon looks: no tile background or border, the name under the picture. They suit square tiles
	// (Settings › Grid › Tile shape 1 : 1) and icon pictures shown with the "Contain" picture mode (Properties › Fit).
	const ICON_CELLS = {
		margin: 4, marginHover: 4, backgroundColor: null, backgroundColorHover: null, backgroundOpacity: 0, backgroundOpacityHover: 0,
		borderSize: 0, borderSizeHover: 0, borderRadius: 0, borderRadiusHover: 0, titlePosition: TitlePosition.below, titleBorderSize: 0, titleBorderSizeHover: 0
	};
	BUILTIN.push(
		{ id: 'plum', builtin: true, name: 'Plum', nameKey: 'themePlumName',
			descriptionKey: 'themePlumDescription',
			style: derive(CLASSIC, {
				backgroundColor: '#251721',
				grid: { margin: 10, cells: {
					margin: 8, marginHover: 8, borderColor: '#a9a9a9', borderColorHover: '#ffffff', borderSize: 2, borderSizeHover: 2,
					borderRadius: 6, borderRadiusHover: 6, titleHeight: 18, titleHeightHover: 18, titleColor: '#ffffff', titleColorHover: '#33ccff',
					titleBackgroundColor: null, titleBackgroundColorHover: null, titleBorderSize: 2, titleBorderSizeHover: 2 } }
			}) },
		{ id: 'desktop', builtin: true, suggestsIcons: true, name: 'Desktop', nameKey: 'themeDesktopName',
			descriptionKey: 'themeDesktopDescription',
			style: derive(CLASSIC, {
				backgroundColor: '#0f1b30',
				backgroundGradient: 'radial-gradient(ellipse at 55% 45%, #2c4f7a 0%, #172a4a 55%, #0b1426 100%)',
				accentColor: '#3a72c8',
				grid: { margin: 12, cells: Object.assign({}, ICON_CELLS, {
					backgroundColor: '#ffffff', backgroundColorHover: '#ffffff', backgroundOpacityHover: .16, borderRadius: 8, borderRadiusHover: 8, hoverEffect: HoverEffect.smooth,
					titleHeight: 30, titleHeightHover: 30, titleFontSize: 9.5, titleFontSizeHover: 9.5, titleFont: 'system-ui, "Segoe UI", sans-serif',
					titleColor: '#ffffff', titleColorHover: '#ffffff', titleBackgroundColor: null, titleBackgroundColorHover: '#ffffff', titleBackgroundOpacityHover: .16 }) }
			}) },
		{ id: 'dusk', builtin: true, name: 'Dusk', nameKey: 'themeDuskName',
			descriptionKey: 'themeDuskDescription',
			style: derive(BUILTIN[1].style, {
				backgroundColor: '#2a2350',
				backgroundGradient: 'linear-gradient(180deg, #1a2a6c 0%, #6d4a7a 40%, #b46a8f 62%, #fdbb6d 85%, #fdd9a0 100%)',
				accentColor: '#7e57c2',
				grid: { cells: { borderColor: '#ffffff', borderColorHover: '#ffffff', backgroundOpacity: .12, hoverEffect: HoverEffect.grow,
					titleBackgroundColor: '#1b1638', titleBackgroundColorHover: '#7e57c2', titleBackgroundOpacity: .55 } }
			}) },
		{ id: 'retro-pc', builtin: true, suggestsIcons: true, name: 'Retro PC', nameKey: 'themeRetroPcName',
			descriptionKey: 'themeRetroPcDescription',
			style: derive(CLASSIC, {
				backgroundColor: '#008080',
				accentColor: '#000080',
				grid: { margin: 12, cells: Object.assign({}, ICON_CELLS, {
					titleHeight: 20, titleHeightHover: 20, titleFontSize: 8, titleFontSizeHover: 8, titleFont: 'Tahoma, Verdana, sans-serif',
					titleColor: '#ffffff', titleColorHover: '#ffffff', titleBackgroundColor: null, titleBackgroundColorHover: '#000080', titleBackgroundOpacityHover: 1 }) }
			}) },
		{ id: 'retro-mono', builtin: true, suggestsIcons: true, name: 'Retro Mono', nameKey: 'themeRetroMonoName',
			descriptionKey: 'themeRetroMonoDescription',
			style: derive(CLASSIC, {
				backgroundColor: '#ffffff',
				backgroundGradient: 'repeating-linear-gradient(45deg, rgba(0, 0, 0, .3) 0px, rgba(0, 0, 0, .3) 1px, transparent 1px, transparent 4px), repeating-linear-gradient(-45deg, rgba(0, 0, 0, .3) 0px, rgba(0, 0, 0, .3) 1px, transparent 1px, transparent 4px)',
				accentColor: '#000000',
				grid: { margin: 12, cells: Object.assign({}, ICON_CELLS, {
					titleHeight: 20, titleHeightHover: 20, titleFontSize: 8, titleFontSizeHover: 8, titleFont: 'Verdana, Geneva, sans-serif',
					titleColor: '#000000', titleColorHover: '#ffffff', titleBackgroundColor: '#ffffff', titleBackgroundColorHover: '#000000',
					titleBackgroundOpacity: 1, titleBackgroundOpacityHover: 1 }) }
			}) }
	);

	// Fonts offered for tile titles (any other font stack from an imported theme is kept as "Custom")
	const FONTS = [
		{ label: 'Classic (Arial)', value: 'Arial, Verdana, Sans-serif' },
		{ label: 'System', value: 'system-ui, "Segoe UI", sans-serif' },
		{ label: 'Rounded', value: '"Arial Rounded MT Bold", "Varela Round", Nunito, system-ui, sans-serif' },
		{ label: 'Serif', value: 'Georgia, Cambria, "Times New Roman", serif' },
		{ label: 'Tahoma', value: 'Tahoma, Verdana, sans-serif' },
		{ label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
		{ label: 'Monospace', value: 'ui-monospace, Consolas, "Cascadia Mono", monospace' }
	];

	// ---------- theme files ----------
	const FILE_FORMAT = 'quickdial-ng-theme';
	const FILE_VERSION = 1; // the newest theme file version this code reads
	const BACKUP_FORMAT = 'quickdial-ng'; // QDCommon.BACKUP_FORMAT: themes.js loads without common.js (unit tests), so it keeps its own copy
	const NAME_MAX_LENGTH = 60;
	const DESCRIPTION_MAX_LENGTH = 300;
	// eslint-disable-next-line no-control-regex -- control characters are what it removes
	function cleanText(text, max){ return typeof text == 'string' ? text.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : ''; }
	// { name, description, style } -> the object saved as a .json file
	function toFile(theme){
		return { format: FILE_FORMAT, version: FILE_VERSION, name: cleanText(theme.name, NAME_MAX_LENGTH),
			description: cleanText(theme.description, DESCRIPTION_MAX_LENGTH), style: normalize(theme.style) };
	}
	// Parsed .json -> { name, description, style }. A file it can't take throws an Error whose message is the key
	// of the text that tells the user why (themes.js doesn't read the language files; Settings shows the text).
	function fromFile(data){
		if(!data || typeof data != 'object' || data.format != FILE_FORMAT || !data.style || typeof data.style != 'object'){
			throw new Error(data && data.format == BACKUP_FORMAT ? 'themeFileIsBackup' : 'themeFileInvalid');
		}
		if(data.version > FILE_VERSION) throw new Error('themeFileNewer');
		const name = cleanText(data.name, NAME_MAX_LENGTH);
		if(!name) throw new Error('themeFileNoName');
		return { name: name, description: cleanText(data.description, DESCRIPTION_MAX_LENGTH), style: normalize(data.style) };
	}
	// Saved custom themes: [{ name, description, style }], invalid entries dropped
	function cleanList(list){
		if(!Array.isArray(list)) return [];
		const out = [], seen = {};
		list.forEach(theme => {
			try { theme = fromFile({ format: FILE_FORMAT, version: FILE_VERSION, name: theme.name, description: theme.description, style: theme.style }); } catch(e){ return; }
			const key = theme.name.toLowerCase();
			if(seen[key] || isBuiltinName(theme.name)) return;
			seen[key] = true;
			out.push(theme);
		});
		return out;
	}
	function isBuiltinName(name){ return BUILTIN.some(t => t.name.toLowerCase() == String(name).trim().toLowerCase()); }
	function fileName(name){ return FILE_FORMAT + '-' + (String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom') + '.json'; }

	// ---------- CSS values ----------
	function rgba(hex, opacity){ // '#rrggbb' + 0..1 -> CSS colour; null -> transparent
		if(!hex) return 'transparent';
		if(opacity === undefined || opacity >= 1) return hex;
		const rgb = parseInt(hex.slice(1), 16);
		return 'rgba(' + (rgb >> 16 & 255) + ', ' + (rgb >> 8 & 255) + ', ' + (rgb & 255) + ', ' + Math.max(0, opacity) + ')';
	}
	function background(picture, gradient){ // the picture lies on top of the theme's gradient
		const layers = [picture, gradient].filter(v => v);
		return layers.length ? layers.join(', ') : 'none';
	}
	function shadow(level){ // level: Shadow; the CSS box-shadow of each, in their order
		return ['none', '0 2px 8px rgba(0, 0, 0, .28)', '0 10px 28px rgba(0, 0, 0, .45), 0 2px 6px rgba(0, 0, 0, .25)'][+level] || 'none';
	}

	// ---------- hover effect ----------
	// The CSS transform of a hovered tile, or '' (the dial and the Settings preview)
	function hoverTransform(effect){
		return { [HoverEffect.lift]: 'translateY(-4px)', [HoverEffect.grow]: 'scale(1.04)' }[+effect] || '';
	}

	// ---------- click effects ----------
	// What a tile does when it is clicked (grid.cells.clickEffect). The dial and the Settings preview use the same
	// rules: clickEffectRules gives the CSS for a tile selector, playClickEffect starts it on one tile. The effect
	// starts on mouse down, so it shows even when the click opens the site in the same tab right away. Unlike the hover
	// effect it is not switched off with reduced motion: it was asked for, and is then shown without movement.
	const CLICK_EFFECT_DURATION = 600; // ms; the longest animation below, plus a little
	// CSS rules (text) for `selector` (the tile: positioned, overflow hidden). color: the effect's colour (#rrggbb).
	function clickEffectRules(selector, effect, color){
		const clicked = selector + '.is-clicked';
		const overlay = clicked + '::after { content: ""; position: absolute; z-index: 2; pointer-events: none; background-color: ' + color + ';';
		const FLASH_KEYFRAMES = '@keyframes qd-click-flash { from { opacity: .5; } to { opacity: 0; } }';
		// With reduced motion (asked for by the system: on Windows, "Show animations" turned off) nothing moves or
		// grows: the ring fades where it is, and the effects that move flash the whole tile instead
		const reducedMotion = +effect == ClickEffect.flash ? [] : +effect == ClickEffect.ring ? [ // one rule per entry (insertRule takes one)
			'@keyframes qd-click-ring-fade { from { outline-color: ' + color + '; } to { outline-color: transparent; } }',
			'@media (prefers-reduced-motion: reduce) { ' + clicked + ' { outline-offset: 2px; animation: qd-click-ring-fade .45s ease-out !important; } }'
		] : [
			'@media (prefers-reduced-motion: reduce) { ' + clicked + ' { animation: none !important; } ' + overlay
				+ ' left: 0; top: 0; width: 100%; height: 100%; margin: 0; border-radius: 0; transform: none; opacity: 0; animation: qd-click-flash .35s ease-out !important; } }'
		];
		const rules = {
			[ClickEffect.press]: [
				'@keyframes qd-click-press { 0% { scale: 1; } 35% { scale: .93; } 100% { scale: 1; } }',
				clicked + ' { animation: qd-click-press .25s ease-out; }'],
			[ClickEffect.bounce]: [
				'@keyframes qd-click-bounce { 0% { scale: 1; } 30% { scale: .9; } 65% { scale: 1.05; } 100% { scale: 1; } }',
				clicked + ' { animation: qd-click-bounce .4s ease-out; }'],
			[ClickEffect.ripple]: [ // a circle from the pointer; JS sets where (--qd-click-x/y) and how big (--qd-click-size)
				'@keyframes qd-click-ripple { from { transform: scale(0); opacity: .45; } to { transform: scale(1); opacity: 0; } }',
				overlay + ' left: var(--qd-click-x, 50%); top: var(--qd-click-y, 50%); width: var(--qd-click-size, 200%); height: var(--qd-click-size, 200%);'
					+ ' margin: calc(var(--qd-click-size, 200%) / -2) 0 0 calc(var(--qd-click-size, 200%) / -2); border-radius: 50%; opacity: 0;'
					+ ' animation: qd-click-ripple .5s ease-out; }'],
			[ClickEffect.flash]: [
				overlay + ' inset: 0; opacity: 0; animation: qd-click-flash .35s ease-out; }'],
			[ClickEffect.ring]: [ // outside the tile: an outline is not clipped by the tile's overflow
				'@keyframes qd-click-ring { from { outline-offset: 0; outline-color: ' + color + '; } to { outline-offset: 10px; outline-color: transparent; } }',
				clicked + ' { outline: 3px solid transparent; animation: qd-click-ring .45s ease-out; }']
		}[+effect];
		if(!rules) return [];
		return [FLASH_KEYFRAMES].concat(rules, reducedMotion);
	}
	// Starts the effect on a tile, again from the start if it is still playing. pointerX, pointerY: the pointer in the viewport
	// (the ripple starts there); left out, the middle of the tile.
	function playClickEffect(tile, pointerX, pointerY){
		const box = tile.getBoundingClientRect();
		const left = pointerX === undefined ? box.width / 2 : pointerX - box.left, top = pointerY === undefined ? box.height / 2 : pointerY - box.top;
		const reach = Math.hypot(Math.max(left, box.width - left), Math.max(top, box.height - top)); // to the farthest corner
		tile.style.setProperty('--qd-click-x', left + 'px');
		tile.style.setProperty('--qd-click-y', top + 'px');
		tile.style.setProperty('--qd-click-size', 2 * reach + 'px');
		tile.classList.remove('is-clicked');
		void tile.offsetWidth; // a new style pass, so the animation starts over
		tile.classList.add('is-clicked');
		clearTimeout(tile._clickEffectTimer);
		tile._clickEffectTimer = setTimeout(() => { tile.classList.remove('is-clicked'); }, CLICK_EFFECT_DURATION);
	}

	// Draws a sample tile the way the dial would: Settings (the Tiles preview, the theme cards) and the tile in Properties.
	// The tile is a .qd-tile in a .qd-tile-slot (css/page.css) whose last child is its title; the slot is `width` px wide,
	// and gets the height of the tile in the shape `ratio` (height / width), at most `maxHeight` (taller shapes are cut off).
	function paintTile(tile, cells, hover, ratio, width, maxHeight){
		const suffix = hover ? 'Hover' : '';
		const num = function(name){ return Math.max(0, +cells[name + suffix] || 0); };
		const margin = num('margin'), border = num('borderSize'), showTitle = !!cells['title' + suffix], titleHeight = num('titleHeight');
		const titleOverlay = cells.titlePosition == TitlePosition.over;
		const height = Math.round((width - 2 * margin - 2 * border) * ratio) + 2 * border + (showTitle && !titleOverlay ? titleHeight : 0);
		tile.parentNode.style.width = width + 'px';
		tile.parentNode.style.height = (Math.min(height, maxHeight) + 2 * margin) + 'px';
		tile.classList.toggle('is-overlay', titleOverlay);
		const style = tile.style;
		style.margin = margin + 'px';
		style.opacity = Math.min(1, num('opacity'));
		style.border = border + 'px solid ' + cells['borderColor' + suffix];
		style.borderRadius = num('borderRadius') + 'px';
		style.backgroundColor = rgba(cells['backgroundColor' + suffix], num('backgroundOpacity'));
		style.boxShadow = shadow(cells['shadow' + suffix]);
		style.backdropFilter = num('blur') ? 'blur(' + num('blur') + 'px)' : 'none';
		const moves = hover && !window.matchMedia('(prefers-reduced-motion: reduce)').matches; // as on the dial: no lift or zoom then
		style.transform = (moves && hoverTransform(cells.hoverEffect)) || 'none';
		const title = tile.lastElementChild.style;
		title.display = showTitle ? '' : 'none';
		title.height = titleHeight + 'px';
		title.lineHeight = titleHeight + 'px';
		title.fontSize = num('titleFontSize') + 'pt';
		title.fontFamily = cells.titleFont;
		title.fontWeight = cells.titleBold ? '600' : 'normal';
		title.color = cells['titleColor' + suffix];
		title.backgroundColor = rgba(cells['titleBackgroundColor' + suffix], num('titleBackgroundOpacity'));
		title.borderTop = num('titleBorderSize') + 'px solid ' + cells['borderColor' + suffix];
	}

	return {
		CLASSIC: CLASSIC, BUILTIN: BUILTIN, FONTS: FONTS, HoverEffect: HoverEffect, ClickEffect: ClickEffect, TitlePosition: TitlePosition, Shadow: Shadow,
		FILE_FORMAT: FILE_FORMAT, NAME_MAX_LENGTH: NAME_MAX_LENGTH,
		normalize: normalize, extract: extract, apply: apply, equal: equal, complete: complete,
		toFile: toFile, fromFile: fromFile, cleanList: cleanList, isBuiltinName: isBuiltinName, fileName: fileName,
		rgba: rgba, background: background, shadow: shadow, hoverTransform: hoverTransform,
		clickEffectRules: clickEffectRules, playClickEffect: playClickEffect, paintTile: paintTile
	};
})();
