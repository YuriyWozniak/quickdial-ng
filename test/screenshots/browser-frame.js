// The browser window drawn around the pages in the screenshots (see README.md in this folder): a tab
// strip and a toolbar like Firefox's on Windows, without its logo, in the browser's light or dark colours
// (prefers-color-scheme follows the colour scheme of the Playwright context).
//
// Exports
//   FRAME_HEIGHT  height of the tab strip and toolbar, in CSS pixels; the page frame starts below it
//   frameHtml()   html put at the top of the test host page (test/index.html), with a function
//                 setBrowser({ tabs: [{ title, icon, active }], url, identity }) the script calls for each picture:
//                 icon is 'qd' (Quick Dial NG's icon) or a colour; url empty shows the search placeholder;
//                 identity names the extension in front of a moz-extension address
'use strict';

const TAB_STRIP_HEIGHT = 44, TOOLBAR_HEIGHT = 42;
const FRAME_HEIGHT = TAB_STRIP_HEIGHT + TOOLBAR_HEIGHT;

const STYLE = `
#qd-browser{--strip:#f0f0f4;--bar:#f9f9fb;--tab:#ffffff;--field:#f0f0f4;--text:#15141a;--muted:#5b5b66;--line:#e0e0e6;
	font:12px "Segoe UI",system-ui,sans-serif;color:var(--text);user-select:none}
@media (prefers-color-scheme: dark){#qd-browser{--strip:#1c1b22;--bar:#2b2a33;--tab:#42414d;--field:#1c1b22;--text:#fbfbfe;--muted:#bfbfc9;--line:#0c0c0d}}
#qd-browser .strip{height:${TAB_STRIP_HEIGHT}px;background:var(--strip);display:flex;align-items:center;padding:0 0 0 8px;gap:2px}
#qd-browser .tab{height:34px;width:226px;display:flex;align-items:center;gap:8px;padding:0 10px;border-radius:6px;color:var(--muted)}
#qd-browser .tab.on{background:var(--tab);color:var(--text);box-shadow:0 0 4px rgba(0,0,0,.18)}
#qd-browser .tab span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#qd-browser .tab i,#qd-browser .tab img{width:16px;height:16px;border-radius:4px;flex:none}
#qd-browser .x{width:16px;height:16px;opacity:.7}
#qd-browser .plus{width:30px;height:30px;display:grid;place-items:center;font-size:20px;color:var(--muted)}
#qd-browser .win{margin-left:auto;display:flex;height:100%}#qd-browser .win div{width:46px;display:grid;place-items:center}
#qd-browser .bar{height:${TOOLBAR_HEIGHT}px;background:var(--bar);display:flex;align-items:center;gap:4px;padding:0 6px;border-bottom:1px solid var(--line);box-sizing:border-box}
#qd-browser .btn{width:32px;height:32px;display:grid;place-items:center;border-radius:4px}
#qd-browser .url{flex:1;height:32px;margin:0 6px;border-radius:6px;background:var(--field);display:flex;align-items:center;gap:8px;padding:0 10px;font-size:14px}
#qd-browser .url .hint{color:var(--muted)}#qd-browser .url .id{background:var(--bar);border-radius:4px;padding:2px 8px;font-size:12px}
#qd-browser svg{stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}`;

// Toolbar and window drawings, 16×16
const DRAWINGS = {
	back: '<path d="M13 8H3.5M7.5 4 3.5 8l4 4"/>', forward: '<path d="M3 8h9.5M8.5 4l4 4-4 4"/>',
	reload: '<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/>', search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>',
	puzzle: '<path d="M3 6h2.5a1.5 1.5 0 0 1 3 0H11v2.5a1.5 1.5 0 0 1 0 3V14H3v-2.5a1.5 1.5 0 0 0 0-3z"/>', menu: '<path d="M2.5 4h11M2.5 8h11M2.5 12h11"/>',
	minimize: '<path d="M3 8h10"/>', maximize: '<rect x="3.5" y="3.5" width="9" height="9"/>', close: '<path d="m3.5 3.5 9 9M12.5 3.5l-9 9"/>',
	tabClose: '<path d="m5 5 6 6M11 5l-6 6"/>'
};
const draw = (name, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 16 16">${DRAWINGS[name]}</svg>`;

function frameHtml() {
	return `<style>${STYLE}</style><div id="qd-browser"><div class="strip" id="qd-tabs"></div>
		<div class="bar"><div class="btn">${draw('back')}</div><div class="btn" style="opacity:.45">${draw('forward')}</div><div class="btn">${draw('reload')}</div>
		<div class="url" id="qd-url"></div><div class="btn"><img src="img/icon.svg" width="18" height="18" alt=""></div><div class="btn">${draw('puzzle')}</div><div class="btn">${draw('menu')}</div></div></div>
		<script>
		function setBrowser({ tabs, url, identity }) {
			const icon = t => t.icon === 'qd' ? '<img src="img/icon.svg" alt="">' : '<i style="background:' + t.icon + '"></i>';
			document.getElementById('qd-tabs').innerHTML = tabs.map(t => '<div class="tab' + (t.active ? ' on' : '') + '">' + icon(t) + '<span>' + t.title + '</span>'
				+ (t.active ? '<svg class="x" viewBox="0 0 16 16">${DRAWINGS.tabClose}</svg>' : '') + '</div>').join('')
				+ '<div class="plus">+</div><div class="win"><div>${draw('minimize', 12)}</div><div>${draw('maximize', 12)}</div><div>${draw('close', 12)}</div></div>';
			document.getElementById('qd-url').innerHTML = '${draw('search')}' + (url
				? (identity ? '<span class="id">' + identity + '</span>' : '') + '<span>' + url + '</span>'
				: '<span class="hint">Search or enter address</span>');
		}
		</script>`;
}

module.exports = { FRAME_HEIGHT, frameHtml };
