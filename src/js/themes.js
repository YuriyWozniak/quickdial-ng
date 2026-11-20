// Quick Dial NG — themes: the look of the dial in one object, separate from the layout.
// A theme holds the background colour (and an optional CSS gradient), the accent colour of the
// dialogs, the page margin and every tile and title style. It never holds the number of rows and
// columns, the tile shape, the background picture or any behaviour, so applying one keeps the grid.
// Loaded by the background page (defaults) and the Settings page (theme gallery, import/export).
/* exported QDThemes */
// eslint-disable-next-line no-var -- a window property: the background page, Settings and the tests use it
var QDThemes = (function(){
	'use strict';

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
				shadow: 0,
				shadowHover: 0,
				hoverEffect: 0,
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
				titlePosition: 0,
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
		shadow: [0, 2, 1], shadowHover: [0, 2, 1], hoverEffect: [0, 3, 1],
		borderColor: 'color', borderColorHover: 'color',
		borderRadius: [0, 200, 1], borderRadiusHover: [0, 200, 1],
		borderSize: [0, 20, 1], borderSizeHover: [0, 20, 1],
		title: 'bool', titleHover: 'bool',
		titleHeight: [0, 100, 1], titleHeightHover: [0, 100, 1],
		titleFontSize: [1, 72, .5], titleFontSizeHover: [1, 72, .5],
		titleFont: 'font', titleBold: 'bool', titlePosition: [0, 1, 1],
		titleColor: 'color', titleColorHover: 'color',
		titleBackgroundColor: 'color?', titleBackgroundColorHover: 'color?',
		titleBackgroundOpacity: [0, 1, .01], titleBackgroundOpacityHover: [0, 1, .01],
		titleBorderSize: [0, 20, 1], titleBorderSizeHover: [0, 20, 1]
	};
	function rule(path){ // most specific name first: "grid.cells.backgroundColor" -> "cells.backgroundColor" -> "backgroundColor"
		const parts = path.split('.');
		for(let i = 0; i < parts.length; i++){
			const r = RULES[parts.slice(i).join('.')];
			if(r !== undefined) return r;
		}
		return null;
	}

	const COLOR = /^#[0-9a-f]{6}$/i;
	const FONT = /^[\w\s,"'-]{1,200}$/;
	const GRADIENT = /^\s*(repeating-)?(linear|radial|conic)-gradient\(/i;
	function clean(r, v, fallback){ // a valid value, or the fallback
		if(Array.isArray(r)){
			v = typeof v == 'string' && v.trim() !== '' ? +v : v;
			if(typeof v != 'number' || !isFinite(v)) return fallback;
			v = Math.min(r[1], Math.max(r[0], v));
			return +(Math.round(v / r[2]) * r[2]).toFixed(2);
		}
		switch(r){
			case 'color': return typeof v == 'string' && COLOR.test(v) ? v.toLowerCase() : fallback;
			case 'color?': return v === null ? null : (typeof v == 'string' && COLOR.test(v) ? v.toLowerCase() : fallback);
			case 'bool': return typeof v == 'boolean' ? v : fallback;
			case 'font': return typeof v == 'string' && FONT.test(v) ? v.trim() : fallback;
			case 'gradient': // gradients only: no url() (no outside requests), nothing that could end the CSS declaration
				if(v === null) return null;
				return typeof v == 'string' && v.length <= 2000 && GRADIENT.test(v) && !/url\s*\(|[;{}<>\\]/i.test(v) ? v.trim() : fallback;
		}
		return fallback;
	}

	// Calls fn(path, classicValue) for every style key ("grid.cells.margin", 4)
	function walk(shape, prefix, fn){
		for(const k in shape){
			const path = prefix ? prefix + '.' + k : k;
			if(shape[k] && typeof shape[k] == 'object') walk(shape[k], path, fn);
			else fn(path, shape[k]);
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
	function set(obj, path, value){
		const parts = path.split('.');
		for(let i = 0; i < parts.length - 1; i++){
			if(!obj[parts[i]] || typeof obj[parts[i]] != 'object') obj[parts[i]] = {};
			obj = obj[parts[i]];
		}
		obj[parts[parts.length - 1]] = value;
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
	function equal(a, b){ return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b)); }
	// Fills in style keys a settings object doesn't have yet (settings from older versions); returns true if any was added
	function complete(settings){
		let added = false;
		walk(CLASSIC, '', (path, def) => { if(get(settings, path) === undefined){ set(settings, path, def); added = true; } });
		return added;
	}

	// ---------- built-in themes ----------
	const BUILTIN = [
		{ id: 'classic', builtin: true, name: 'Classic',
			description: 'The original Quick Dial look: dark grey page, thin borders, titles under the pictures.',
			style: normalize(CLASSIC) },
		{ id: 'anori', builtin: true, name: 'Anori',
			description: 'Inspired by the Anori browser extension (anori.app): a deep-green page, frosted-glass tiles with large rounded corners and titles over the pictures.',
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
						shadow: 1, shadowHover: 2, hoverEffect: 2,
						borderColor: '#2c5a45', borderColorHover: '#56c792',
						borderRadius: 14, borderRadiusHover: 14,
						borderSize: 1, borderSizeHover: 1,
						title: true, titleHover: true,
						titleHeight: 26, titleHeightHover: 26,
						titleFontSize: 9.5, titleFontSizeHover: 9.5,
						titleFont: 'system-ui, "Segoe UI", sans-serif', titleBold: false, titlePosition: 1,
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
			for(const k in values){
				if(values[k] && typeof values[k] == 'object') merge(target[k] || (target[k] = {}), values[k]);
				else target[k] = values[k];
			}
		})(out, changes);
		return normalize(out);
	}
	// Icon looks: no tile background or border, the name under the picture. They suit square tiles
	// (Settings › Grid › Tile shape 1 : 1) and icon pictures shown with the "Contain" picture mode (Properties › Fit).
	const ICON_CELLS = {
		margin: 4, marginHover: 4, backgroundColor: null, backgroundColorHover: null, backgroundOpacity: 0, backgroundOpacityHover: 0,
		borderSize: 0, borderSizeHover: 0, borderRadius: 0, borderRadiusHover: 0, titlePosition: 0, titleBorderSize: 0, titleBorderSizeHover: 0
	};
	BUILTIN.push(
		{ id: 'plum', builtin: true, name: 'Plum',
			description: 'A dark plum page with light grey rounded borders and titles under the pictures. Made for a large grid with groups of sites and room between them.',
			style: derive(CLASSIC, {
				backgroundColor: '#251721',
				grid: { margin: 10, cells: {
					margin: 8, marginHover: 8, borderColor: '#a9a9a9', borderColorHover: '#ffffff', borderSize: 2, borderSizeHover: 2,
					borderRadius: 6, borderRadiusHover: 6, titleHeight: 18, titleHeightHover: 18, titleColor: '#ffffff', titleColorHover: '#33ccff',
					titleBackgroundColor: null, titleBackgroundColorHover: null, titleBorderSize: 2, titleBorderSizeHover: 2 } }
			}) },
		{ id: 'desktop', builtin: true, name: 'Desktop',
			description: 'Icons with their names under them on a night-blue page or your wallpaper, like a computer desktop, with a soft highlight under the pointer. For square tiles and icon pictures.',
			style: derive(CLASSIC, {
				backgroundColor: '#0f1b30',
				backgroundGradient: 'radial-gradient(ellipse at 55% 45%, #2c4f7a 0%, #172a4a 55%, #0b1426 100%)',
				accentColor: '#3a72c8',
				grid: { margin: 12, cells: Object.assign({}, ICON_CELLS, {
					backgroundColor: '#ffffff', backgroundColorHover: '#ffffff', backgroundOpacityHover: .16, borderRadius: 8, borderRadiusHover: 8, hoverEffect: 1,
					titleHeight: 30, titleHeightHover: 30, titleFontSize: 9.5, titleFontSizeHover: 9.5, titleFont: 'system-ui, "Segoe UI", sans-serif',
					titleColor: '#ffffff', titleColorHover: '#ffffff', titleBackgroundColor: null, titleBackgroundColorHover: '#ffffff', titleBackgroundOpacityHover: .16 }) }
			}) },
		{ id: 'dusk', builtin: true, name: 'Dusk',
			description: 'Violet glass tiles that grow on hover, over a sunset sky.',
			style: derive(BUILTIN[1].style, {
				backgroundColor: '#2a2350',
				backgroundGradient: 'linear-gradient(180deg, #1a2a6c 0%, #6d4a7a 40%, #b46a8f 62%, #fdbb6d 85%, #fdd9a0 100%)',
				accentColor: '#7e57c2',
				grid: { cells: { borderColor: '#ffffff', borderColorHover: '#ffffff', backgroundOpacity: .12, hoverEffect: 3,
					titleBackgroundColor: '#1b1638', titleBackgroundColorHover: '#7e57c2', titleBackgroundOpacity: .55 } }
			}) },
		{ id: 'retro-pc', builtin: true, name: 'Retro PC',
			description: 'A late-1990s PC desktop: a teal page, icons with white names, and a navy highlight on the name under the pointer. For square tiles and icon pictures.',
			style: derive(CLASSIC, {
				backgroundColor: '#008080',
				accentColor: '#000080',
				grid: { margin: 12, cells: Object.assign({}, ICON_CELLS, {
					titleHeight: 20, titleHeightHover: 20, titleFontSize: 8, titleFontSizeHover: 8, titleFont: 'Tahoma, Verdana, sans-serif',
					titleColor: '#ffffff', titleColorHover: '#ffffff', titleBackgroundColor: null, titleBackgroundColorHover: '#000080', titleBackgroundOpacityHover: 1 }) }
			}) },
		{ id: 'retro-mono', builtin: true, name: 'Retro Mono',
			description: 'An early black-and-white desktop: a fine grey pattern, black names on white labels, inverted under the pointer. For square tiles and black-and-white icon pictures.',
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
	const FORMAT = 'quickdial-ng-theme';
	// eslint-disable-next-line no-control-regex -- control characters are what it removes
	function cleanText(v, max){ return typeof v == 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : ''; }
	// { name, description, style } -> the object saved as a .json file
	function toFile(theme){
		return { format: FORMAT, version: 1, name: cleanText(theme.name, 60), description: cleanText(theme.description, 300), style: normalize(theme.style) };
	}
	// Parsed .json -> { name, description, style }; throws an Error with a message for the user
	function fromFile(data){
		if(!data || typeof data != 'object' || data.format != FORMAT || !data.style || typeof data.style != 'object'){
			throw new Error(data && data.format == 'quickdial-ng' ? 'This is a full Quick Dial NG backup. Import it on the Backup tab.' : 'This file is not a Quick Dial NG theme.');
		}
		if(data.version > 1) throw new Error('This theme was made by a newer version of Quick Dial NG. Update the extension to import it.');
		const name = cleanText(data.name, 60);
		if(!name) throw new Error('This theme has no name.');
		return { name: name, description: cleanText(data.description, 300), style: normalize(data.style) };
	}
	// Saved custom themes: [{ name, description, style }], invalid entries dropped
	function cleanList(list){
		if(!Array.isArray(list)) return [];
		const out = [], seen = {};
		list.forEach(t => {
			try { t = fromFile({ format: FORMAT, version: 1, name: t.name, description: t.description, style: t.style }); } catch(e){ return; }
			const key = t.name.toLowerCase();
			if(seen[key] || isBuiltinName(t.name)) return;
			seen[key] = true;
			out.push(t);
		});
		return out;
	}
	function isBuiltinName(name){ return BUILTIN.some(t => { return t.name.toLowerCase() == String(name).trim().toLowerCase(); }); }
	function fileName(name){ return 'quickdial-ng-theme-' + (String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom') + '.json'; }

	// ---------- CSS values ----------
	function rgba(hex, opacity){ // '#rrggbb' + 0..1 -> CSS colour; null -> transparent
		if(!hex) return 'transparent';
		if(opacity === undefined || opacity >= 1) return hex;
		const n = parseInt(hex.slice(1), 16);
		return 'rgba(' + (n >> 16 & 255) + ', ' + (n >> 8 & 255) + ', ' + (n & 255) + ', ' + Math.max(0, opacity) + ')';
	}
	function background(picture, gradient){ // the picture lies on top of the theme's gradient
		const layers = [picture, gradient].filter(v => { return v; });
		return layers.length ? layers.join(', ') : 'none';
	}
	function shadow(level){
		return ['none', '0 2px 8px rgba(0, 0, 0, .28)', '0 10px 28px rgba(0, 0, 0, .45), 0 2px 6px rgba(0, 0, 0, .25)'][+level] || 'none';
	}

	return {
		CLASSIC: CLASSIC, BUILTIN: BUILTIN, FONTS: FONTS,
		normalize: normalize, extract: extract, apply: apply, equal: equal, complete: complete,
		toFile: toFile, fromFile: fromFile, cleanList: cleanList, isBuiltinName: isBuiltinName, fileName: fileName,
		rgba: rgba, background: background, shadow: shadow
	};
})();
