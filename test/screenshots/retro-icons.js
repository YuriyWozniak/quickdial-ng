// Icons and a dotted desktop pattern for the two retro screenshots (see README.md in this folder), from
// two open icon sets:
//   - colour: SerenityOS's 32×32 icons, in the style of late-1990s desktops. The ones used are copied
//     into retro-icons/ (BSD 2-Clause License, © the SerenityOS developers: see retro-icons/LICENSE).
//   - black and white: Pixelarticons by Gerrit Halfmann, 24×24 pixel icons (MIT License), a test dependency
//     (test/package.json). They get a white backing that fills them, like icons on early black-and-white desktops.
// Both are shown enlarged by whole pixels, so they stay sharp.
//
// Exports
//   RETRO_ICONS, MONO_ICONS     { key: html }  icon pages, keyed like the sites they stand for (see icons.js)
//   RETRO_TITLES                { key: title } tile titles that change with the colour icons (no icon fits the original one)
//   RETRO_FOLDER, MONO_FOLDER   html of the folder pictures
//   MONO_PATTERN(width, height) html of a dotted desktop pattern of that size, in device pixels
'use strict';
const fs = require('fs'), path = require('path');

const PAGE_SIZE = 256;                                                          // the page each icon is captured from
const SERENITY_FOLDER = path.join(__dirname, 'retro-icons');
const PIXELART_FOLDER = path.join(__dirname, '..', 'node_modules', 'pixelarticons', 'svg');
const SERENITY_SCALE = 5;                                                       // 32 px icons shown 160 px wide
const PIXELART_SCALE = 7;                                                       // 24 px icons shown 168 px wide
const SILHOUETTE_GROW = 3, SILHOUETTE_SHRINK = 2;                              // the white backing of the black icons: grown, then shrunk
                                                                                // (in icon pixels), so it fills the inside and leaves a 1 px edge

// The icon of each site: a SerenityOS file name, and a Pixelarticons name
const RETRO_FILES = {
	mail: 'app-mail', drive: 'hard-disk', translate: 'app-character-map', photos: 'app-image-viewer', video: 'app-video-player', music: 'app-sound-player',
	vault: 'key', cloud: 'downloads', server: 'app-system-monitor', router: 'network', addons: 'app-widget-gallery', repo: 'filetype-git',
	secureMail: 'certificate', assistant: 'app-assistant', calendar: 'app-calendar', maps: 'app-maps', news: 'app-browser', weather: 'app-weather',
	notes: 'app-text-editor', terminal: 'app-terminal', market: 'app-spreadsheet'
};
const RETRO_TITLES = { market: 'Budget' };
const MONO_FILES = {
	mail: 'mail', drive: 'save', translate: 'languages', photos: 'image', video: 'video', music: 'music', vault: 'lock', cloud: 'cloud',
	server: 'server', router: 'wifi', addons: 'blocks', repo: 'code', secureMail: 'mailbox', assistant: 'robot-face-happy', calendar: 'calendar',
	maps: 'map', news: 'article', weather: 'cloud-sun', notes: 'sticky-note-text', terminal: 'terminal', market: 'shopping-bag'
};

const page = body => `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}html,body{background:transparent;width:${PAGE_SIZE}px;height:${PAGE_SIZE}px;overflow:hidden;position:relative}</style></head><body>${body}</body></html>`;

/** A SerenityOS icon, enlarged without smoothing and centred. */
function serenityPage(name) {
	const data = fs.readFileSync(path.join(SERENITY_FOLDER, name + '.png')).toString('base64'), side = 32 * SERENITY_SCALE, offset = (PAGE_SIZE - side) / 2;
	return page(`<img src="data:image/png;base64,${data}" width="${side}" height="${side}" style="position:absolute;left:${offset}px;top:${offset}px;image-rendering:pixelated" alt="">`);
}

/** A Pixelarticons icon in black on a white silhouette, enlarged and centred. */
function pixelartPage(name) {
	const svg = fs.readFileSync(path.join(PIXELART_FOLDER, name + '.svg'), 'utf8');
	const shapes = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/currentColor/g, 'inherit');
	const side = 24 * PIXELART_SCALE, offset = (PAGE_SIZE - side) / 2;
	return page(`<svg width="${PAGE_SIZE}" height="${PAGE_SIZE}" viewBox="0 0 ${PAGE_SIZE} ${PAGE_SIZE}" shape-rendering="crispEdges">
		<defs><filter id="backing" x="-30%" y="-30%" width="160%" height="160%"><feMorphology operator="dilate" radius="${SILHOUETTE_GROW}" result="grown"/>
		<feMorphology in="grown" operator="erode" radius="${SILHOUETTE_SHRINK}"/></filter></defs>
		<g transform="translate(${offset} ${offset}) scale(${PIXELART_SCALE})"><g fill="#ffffff" filter="url(#backing)">${shapes}</g><g fill="#000000">${shapes}</g></g></svg>`);
}

const RETRO_ICONS = Object.fromEntries(Object.entries(RETRO_FILES).map(([key, name]) => [key, serenityPage(name)]));
const MONO_ICONS = Object.fromEntries(Object.entries(MONO_FILES).map(([key, name]) => [key, pixelartPage(name)]));
const RETRO_FOLDER = serenityPage('filetype-folder'), MONO_FOLDER = pixelartPage('folder');

/** A light dotted desktop pattern: a 2×2 black dot every 4 device pixels. */
const MONO_PATTERN = (width, height) => `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}body{width:${width}px;height:${height}px;overflow:hidden}</style></head><body>
	<svg width="${width}" height="${height}" shape-rendering="crispEdges"><defs><pattern id="p" width="4" height="4" patternUnits="userSpaceOnUse">
	<rect width="4" height="4" fill="#ffffff"/><rect width="2" height="2" fill="#000000"/></pattern></defs><rect width="${width}" height="${height}" fill="url(#p)"/></svg></body></html>`;

module.exports = { RETRO_ICONS, MONO_ICONS, RETRO_TITLES, RETRO_FOLDER, MONO_FOLDER, MONO_PATTERN };
