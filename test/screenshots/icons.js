// App-style icons and the desktop wallpaper for the "desktop icons" screenshot (see README.md in this folder).
//
// Each icon is a 256×256 page with a transparent background: a rounded square in two colours with a
// white line drawing on it, and empty space around it, so the tile shows it at icon size with the
// "Fit inside" picture mode. All drawings are made here; none copies a real app's icon.
//
// Exports
//   ICONS              { key: html }  the icons, keyed like the sites they stand for
//   DESKTOP_WALLPAPER  html of a 2560×1600 picture: soft waves at night
//   DAY_WALLPAPER      the same in daylight colours
'use strict';

const ICON_SIZE = 256;
const ICON_MARGIN = 44; // empty space around the rounded square, so the icon doesn't fill the tile

// Line drawings in a 24×24 box, drawn with a white 1.8 px line
const GLYPHS = {
	mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
	drive: '<path d="M9 4h6l6.5 11-3 5h-13l-3-5z"/><path d="M2.5 15h19M9 4l6.5 11"/>',
	translate: '<path d="M3 6h9M7.5 4v2M5 6c.8 3 2.6 5.3 5 6.5M10 6c-.8 3-2.8 5.6-5.5 7"/><path d="M12.5 20l4-10 4 10M14 16.5h5"/>',
	photos: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M3.5 17l5-5 4 4 3-3 5 5"/>',
	video: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M10 9v6l5-3z" fill="#fff"/>',
	music: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
	vault: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.4"/>',
	cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .3-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 18.5z"/>',
	server: '<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M7.5 7.5h.1M7.5 16.5h.1M11 7.5h5M11 16.5h5"/>',
	router: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.1M10.5 16.5h.1M8.5 10a5 5 0 0 1 7 0M6 7.5a8.5 8.5 0 0 1 12 0"/>',
	addons: '<path d="M5 9h3.5a2.5 2.5 0 0 1 5 0H17v3.5a2.5 2.5 0 0 1 0 5V21H5v-3.5a2.5 2.5 0 0 0 0-5z"/>',
	repo: '<path d="M8.5 8l-5 4 5 4M15.5 8l5 4-5 4M13.5 5l-3 14"/>',
	secureMail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/><path d="M17 13.5l3 1v2.2c0 1.6-1.3 2.8-3 3.3-1.7-.5-3-1.7-3-3.3v-2.2z" fill="#fff"/>',
	assistant: '<path d="M4 5h16v11H10l-5 4v-4H4z"/><path d="M12 7.5v6M9 10.5h6M9.9 8.4l4.2 4.2M14.1 8.4l-4.2 4.2"/>',
	calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M12 14h2M16 14h.1M8 17h2M12 17h2"/>',
	maps: '<path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
	news: '<rect x="3" y="4" width="14" height="16" rx="1.5"/><path d="M17 8h3.5v10a2 2 0 0 1-2 2H17M6 8h8M6 12h8M6 16h5"/>',
	weather: '<circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2.5v1.2M3.7 4.2l.9.9M2.5 9h1.2"/><path d="M9 20h8.5a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.5 1.6A2.8 2.8 0 0 0 9 20z"/>',
	notes: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
	terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7 10l3 2.2L7 14.4M12.5 15h4.5"/>',
	market: '<path d="M5.5 8h13l-1.2 12.5H6.7z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>'
};

// Each icon: its drawing and the two colours of the square (top left to bottom right)
const ICON_COLORS = {
	mail: ['#e2705f', '#b8423a'], drive: ['#4f9be0', '#2a6db8'], translate: ['#5b8def', '#3557c4'], photos: ['#f0a54a', '#d0683a'],
	video: ['#e35d5d', '#a8323a'], music: ['#b071e0', '#6e3fb8'], vault: ['#3fb391', '#1f7a62'], cloud: ['#62a8f0', '#3a72c8'],
	server: ['#6f7d93', '#46526a'], router: ['#6ab36a', '#3f7f46'], addons: ['#3fa3e0', '#2a6fc0'], repo: ['#5a5f6a', '#30343c'],
	secureMail: ['#8b6dff', '#5a3fd0'], assistant: ['#d98c5f', '#b0603a'], calendar: ['#f07a6a', '#c74a52'], maps: ['#4fc08f', '#2a8a7a'],
	news: ['#8a94a6', '#5c6678'], weather: ['#5fb6e8', '#3a7fc8'], notes: ['#f2c94c', '#d39a2a'], terminal: ['#3a3f4a', '#1f2228'], market: ['#e8845a', '#c45a3a']
};

/** The page of one icon. */
function icon(key) {
	const [from, to] = ICON_COLORS[key], side = ICON_SIZE - 2 * ICON_MARGIN;
	return `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}html,body{background:transparent;width:${ICON_SIZE}px;height:${ICON_SIZE}px;overflow:hidden}</style></head><body>
		<svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
		<filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-opacity=".35"/></filter></defs>
		<rect x="${ICON_MARGIN}" y="${ICON_MARGIN}" width="${side}" height="${side}" rx="${side * .23}" fill="url(#g)" filter="url(#s)"/>
		<rect x="${ICON_MARGIN}" y="${ICON_MARGIN}" width="${side}" height="${side / 2}" rx="${side * .23}" fill="#fff" opacity=".08"/>
		<g transform="translate(${ICON_MARGIN + side * .2} ${ICON_MARGIN + side * .2}) scale(${side * .6 / 24})" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[key]}</g></svg></body></html>`;
}
const ICONS = Object.fromEntries(Object.keys(GLYPHS).map(key => [key, icon(key)]));

// The wallpapers: a sky gradient with soft light waves across it, darker (or lighter) at the edges where the icons are.
// colors: sky (centre, middle, edge) and the five waves; the night one goes with white titles, the day one with dark titles.
function wallpaper({ sky, waves }) {
	const WIDTH = 2560, HEIGHT = 1600;
	const wave = (y, amplitude, length, phase, thickness, color, opacity) => {
		let top = '', bottom = '';
		for (let x = 0; x <= WIDTH; x += 40) {
			const center = y + Math.sin(x / length + phase) * amplitude + Math.sin(x / (length * .37) + phase * 2) * amplitude * .18;
			const width = thickness * (.55 + .45 * Math.sin(x / (length * .8) + phase));
			top += `${x ? 'L' : 'M'}${x} ${(center - width).toFixed(1)} `;
			bottom = `L${x} ${(center + width).toFixed(1)} ` + bottom;
		}
		return `<path d="${top}${bottom}Z" fill="${color}" opacity="${opacity}" filter="url(#soft)"/>`;
	};
	return `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}</style></head><body>
		<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><defs>
		<radialGradient id="sky" cx=".55" cy=".45" r=".85"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".55" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></radialGradient>
		<filter id="soft"><feGaussianBlur stdDeviation="18"/></filter></defs>
		<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>
		${wave(760, 170, 520, .4, 120, waves[0], .45)}${wave(860, 140, 610, 1.9, 70, waves[1], .35)}${wave(940, 200, 470, 3.1, 50, waves[2], .3)}
		${wave(700, 120, 700, 5.2, 34, waves[3], .28)}${wave(1050, 160, 560, 2.4, 90, waves[4], .5)}</svg></body></html>`;
}
const DESKTOP_WALLPAPER = wallpaper({ sky: ['#2c4f7a', '#172a4a', '#0b1426'], waves: ['#3f7fbf', '#6fb3e0', '#b48fd9', '#d9eaff', '#2a5d8f'] });
const DAY_WALLPAPER = wallpaper({ sky: ['#ffffff', '#e3eef8', '#c9dbec'], waves: ['#8fc1e8', '#f2c7a0', '#c3b3ea', '#ffffff', '#a8d4d0'] });

module.exports = { ICONS, DESKTOP_WALLPAPER, DAY_WALLPAPER };
