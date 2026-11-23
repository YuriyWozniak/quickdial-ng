// The dial page (dial.html, js/dial.js, js/grid.js, js/dialbg.js): how it draws the tiles and their pictures, the
// background colour it paints before the background page answers, folders and the Back tile, pages,
// and drag and drop. Editing from the dial (its context menu) is in dial-edit.js.
//
// Starts from: the standard bookmarks (lib/fixtures.js) with every tile holding a picture (makeVersion4),
// so tiles keep their titles ("Site 1"...) and nothing is downloaded.
// The steps build on each other:
//   1. tiles and pictures; the colour (changed to #123456, kept from then on)
//   2. the folder "Folder" (f1, holding Site 7) with and without the Back tile
//   3. pages: the grid set to 1 row of 3 cells (7 tiles: 3 pages at the top, 1 in the folder)
//   4. drag and drop: the grid set to 2 rows of 4; tiles swapped at the top and in the folder
// Drags are synthetic drag events: Playwright's mouse drag doesn't reach into the frame.
'use strict';
const { freshProfile, makeVersion4, changeSettings } = require('../lib/fixtures');

// The tiles the dial shows, in cell order: "bookmark:Site 1", "folder:Folder", "back:Back", "-" for an empty cell
const shown = t => t.inDial(() => [...document.querySelectorAll('table.qd-grid a')].map(a => a.className === 'is-empty' ? '-' : a.className.slice(3) + ':' + a.lastChild.innerText));
// The top folder's tiles in the background page, by bookmark id ('-' for a gap)
const ids = t => t.J(() => bg().app.node.children.map(c => c.id || '-'));
// A drag from one cell to another (or with the given drag data), as synthetic drag events.
// Returns the drop effect the target cell offers while dragging over it ('move' or 'none'): read
// from the dial's dragover handler, since synthetic events don't keep it.
const drag = (t, from, to, data) => t.inDial(([from, to, data]) => {
	const cells = document.querySelectorAll('table.qd-grid td'), dt = new DataTransfer();
	if (data) dt.setData('text/plain', JSON.stringify(data));
	else cells[from].firstChild.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true, cancelable: true }));
	const probe = { getData: k => dt.getData(k), dropEffect: '' };
	app._onDragOver({ target: cells[to].firstChild, dataTransfer: probe, preventDefault() {} });
	cells[to].firstChild.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
	cells[to].firstChild.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
	return probe.dropEffect;
}, [from, to, data || null]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = {
	title: 'Dial: pictures, early colour, pages, folders and Back, drag and drop',
	async run(t) {
		await freshProfile(t);
		await makeVersion4(t);
		await t.loadBg();
		let st;

		// ----- tiles and pictures -----
		await t.loadDial();
		await t.waitFor('the pictures', () => [...win('dial').document.querySelectorAll('table.qd-grid a.is-bookmark')].filter(a => a.firstChild.style.backgroundImage.includes('data:image/webp')).length === 6);
		t.check('the dial shows 6 tiles with their WebP pictures and the folder', t.same((await shown(t)).slice(0, 7), ['Site 1', 'Site 2', 'Site 3', 'Site 4', 'Site 5', 'Site 6'].map(s => 'bookmark:' + s).concat('folder:Folder')), await shown(t));
		const before = await t.inDial(() => document.querySelector('table.qd-grid a').firstChild.style.backgroundImage.length);
		await t.J(() => { const a = bg().app, c = document.createElement('canvas'); c.width = 40; c.height = 30;
			return a.Images.setNodeImage(a.node.children[0], c.toDataURL('image/webp')).then(() => a.Messages.broadcast(a.Messages.Commands.gridNodesLoaded)); });
		const after = await t.waitFor('the new picture', () => { const l = win('dial').document.querySelector('table.qd-grid a').firstChild.style.backgroundImage.length; return l < 1000 && l; });
		t.check('a changed picture (refresh, capture) shows up', before > 1000 && after > 0, [before, after]);
		st = await t.inDial(() => document.title);
		t.check('the page title is the folder\'s', st === 'Quick Dial', st);

		// ----- the background colour, painted before the background page answers -----
		let ls = await t.J(() => bg().localStorage.getItem('dialBackgroundColor'));
		t.check('the background colour is remembered for the dial', ls === (await t.J(() => bg().app.settings.backgroundColor)), ls);
		await changeSettings(t, { backgroundColor: '#123456' });
		ls = await t.J(() => bg().localStorage.getItem('dialBackgroundColor'));
		t.check('a changed colour is remembered', ls === '#123456', ls);
		await t.J(() => { bg().app.ready = new Promise(r => { window.releaseBg = r; }); }); // the background page is still loading
		await t.J(() => loadFrame('dial', 'dial.html'));
		await sleep(700); // past the dial's 500 ms safety net, which must not start a second load
		st = await t.J(() => { const w = win('dial'); return { html: w.document.documentElement.style.backgroundColor, drawn: !!w.app.settings, listeners: (S.listeners['rt.onMessage.dial'] || []).length }; });
		t.check('while the background page loads: its colour, nothing drawn, no retry', st.html === 'rgb(18, 52, 86)' && !st.drawn && st.listeners === 0, st);
		await t.J(() => window.releaseBg());
		st = await t.waitFor('the dial to draw', () => { const w = win('dial'); const tiles = w.document.querySelectorAll('table.qd-grid a:not(.Empty)').length;
			return tiles && { html: w.document.documentElement.style.backgroundColor, body: w.getComputedStyle(w.document.body).backgroundColor, tiles, listeners: (S.listeners['rt.onMessage.dial'] || []).length }; });
		t.check('the dial draws once the background page is ready, listening once', st.html === '' && st.body === 'rgb(18, 52, 86)' && st.listeners === 1, st);

		// ----- folders and Back -----
		st = await t.inDial(() => document.querySelector('table.qd-grid a.is-folder').getAttribute('href'));
		t.check('a folder tile opens the dial on that folder', st === '?bg=%23123456&path=%2FFolder', st);
		await t.loadDial('?path=%2FFolder');
		st = { tiles: (await shown(t)).filter(s => s !== '-'), title: await t.inDial(() => document.title) };
		t.check('a folder\'s dial: Back first, then its tiles', t.same(st.tiles, ['back:Back', 'bookmark:Site 7']) && st.title === 'Folder', st);
		await changeSettings(t, { grid: { backNode: false } });
		await t.waitFor('the dial to follow', () => !win('dial').document.querySelector('table.qd-grid a.is-back'));
		t.check('without the Back tile setting, no Back tile', t.same((await shown(t)).filter(s => s !== '-'), ['bookmark:Site 7']), await shown(t));
		await changeSettings(t, { grid: { backNode: true } });

		// ----- the click effect: on a left or middle mouse down on a tile, never on an empty cell or a right click -----
		const PULSE_RING = 5, RIGHT_BUTTON = 2;
		// Mouse down with a button on the cell's tile; whether the tile then plays the effect
		const pressTile = (t, cellIndex, button) => t.inDial(([cellIndex, button]) => {
			const link = document.querySelectorAll('table.qd-grid td')[cellIndex].firstChild;
			link.dispatchEvent(new MouseEvent('mousedown', { button, bubbles: true }));
			const playing = link.classList.contains('is-clicked');
			link.classList.remove('is-clicked'); // the tile list (shown) reads the class names
			return playing;
		}, [cellIndex, button]);
		t.check('no click effect by default', !(await pressTile(t, 1, 0)));
		await changeSettings(t, { grid: { cells: { clickEffect: PULSE_RING } } });
		await t.waitFor('the dial to follow', () => [...win('dial').document.styleSheets].some(s => [...s.cssRules].some(r => r.name === 'qd-click-ring')));
		st = [await pressTile(t, 0, 0), await pressTile(t, 1, 1), await pressTile(t, 1, RIGHT_BUTTON), await pressTile(t, 5, 0)];
		t.check('the click effect plays on Back and a tile, left or middle button only, not on an empty cell', t.same(st, [true, true, false, false]), st);
		await changeSettings(t, { grid: { cells: { clickEffect: 0 } } });

		// ----- reduced motion (Windows' "Show animations" off): a smooth hover still fades colours, nothing moves -----
		const SMOOTH_LIFT = 2;
		// What a tile and its title fade on hover (computed transition properties)
		const motionStyle = t => t.inDial(() => {
			const link = document.querySelector('table.qd-grid a.is-bookmark');
			return { link: getComputedStyle(link).transitionProperty, title: getComputedStyle(link.lastChild).transitionProperty };
		});
		await changeSettings(t, { grid: { cells: { hoverEffect: SMOOTH_LIFT } } });
		await t.waitFor('the dial to follow', () => win('dial').getComputedStyle(win('dial').document.querySelector('table.qd-grid a.is-bookmark')).transitionProperty.includes('transform'));
		await t.page.emulateMedia({ reducedMotion: 'reduce' });
		st = await motionStyle(t);
		t.check('with reduced motion the hover fades colours and borders, without lifting or resizing',
			st.link === 'border-color, opacity, box-shadow, backdrop-filter' && st.title === 'color, background-color, border-color'
			&& (await t.inDial(() => matchMedia('(prefers-reduced-motion: reduce)').matches)), st);
		await t.page.emulateMedia({ reducedMotion: 'no-preference' });
		await changeSettings(t, { grid: { cells: { hoverEffect: 0 } } });

		// ----- pages (mouse wheel, Page Down / Page Up) -----
		await t.loadDial();
		await changeSettings(t, { grid: { rows: 1, columns: 3 } });
		await t.waitFor('the 3-cell grid', () => win('dial').document.querySelectorAll('table.qd-grid td').length === 3);
		const page = () => t.inDial(() => [dial.page, dial.maxPage, ...[...document.querySelectorAll('table.qd-grid a')].map(a => a.className === 'is-empty' ? '-' : a.lastChild.innerText)]);
		st = [await page()];
		const pageDown = () => t.inDial(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'PageDown' })));
		await pageDown(); st.push(await page());
		await t.inDial(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }))); st.push(await page());
		await pageDown(); st.push(await page());
		await t.inDial(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }))); st.push(await page());
		t.check('Page Down and the wheel turn pages, and stop at the last one', t.same(st, [[1, 3, 'Site 1', 'Site 2', 'Site 3'], [2, 3, 'Site 4', 'Site 5', 'Site 6'], [3, 3, 'Folder', '-', '-'], [3, 3, 'Folder', '-', '-'], [2, 3, 'Site 4', 'Site 5', 'Site 6']]), st);
		await t.loadDial('?path=%2FFolder');
		st = await page();
		t.check('in a folder, Back takes a cell on every page', t.same(st, [1, 1, 'Back', 'Site 7', '-']), st);

		// ----- drag and drop: tiles swap places -----
		await changeSettings(t, { grid: { rows: 2, columns: 4 } });
		await t.loadDial();
		await drag(t, 0, 7);
		await t.waitFor('the swap', () => bg().app.node.children[7] && bg().app.node.children[7].id === 'b1');
		await t.idle();
		await t.waitFor('the dial to follow', () => win('dial').document.querySelectorAll('table.qd-grid a')[7].className === 'is-bookmark');
		st = { ids: await ids(t), stored: await t.J(() => S.storage.node.children.map(c => c.id || '-')), shown: await shown(t) };
		t.check('a tile dragged to an empty cell moves there, saved and shown', t.same(st.ids, ['-', 'b2', 'b3', 'b4', 'b5', 'b6', 'f1', 'b1']) && t.same(st.stored, st.ids) && st.shown[0] === '-' && st.shown[7] === 'bookmark:Site 1', st);
		st = await drag(t, 7, 0);
		await t.waitFor('the swap back', () => bg().app.node.children[0].id === 'b1');
		t.check('dragged back: the gap at the end is trimmed', t.same(await ids(t), ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'f1']) && st === 'move', [st, await ids(t)]);
		await drag(t, 1, 2);
		await t.waitFor('the swap', () => bg().app.node.children[1].id === 'b3');
		t.check('two tiles swap places', t.same((await ids(t)).slice(0, 3), ['b1', 'b3', 'b2']), await ids(t));
		st = await drag(t, null, 4, { parentId: 'other', index: 0 });
		await t.idle();
		t.check('a drag from another folder is refused', st === 'none' && t.same((await ids(t)).slice(0, 5), ['b1', 'b3', 'b2', 'b4', 'b5']), st);
		await t.loadDial('?path=%2FFolder');
		st = await drag(t, 1, 0);
		await t.idle();
		t.check('the Back cell takes no drop (and a drop there changes nothing)', st === 'none' && (await t.J(() => bg().app.node.children[6].children[0].id)) === 'b7', st);
		st = await drag(t, 1, 2);
		await t.waitFor('the move in the folder', () => bg().app.node.children[6].children[1] && bg().app.node.children[6].children[1].id === 'b7');
		t.check('in a folder, cells count after Back', t.same(await t.J(() => bg().app.node.children[6].children.map(c => c.id || '-')), ['-', 'b7']), st);
	}
};
