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
const shownTiles = testPage => testPage.inDial(() => [...document.querySelectorAll('table.qd-grid a')]
	.map(link => link.className === 'is-empty' ? '-' : link.className.slice('is-'.length) + ':' + link.lastChild.innerText));
// The top folder's tiles in the background page, by bookmark id ('-' for a gap)
const tileIds = testPage => testPage.inHost(() => backgroundPage().app.node.children.map(tile => tile.id || '-'));
// A drag from one cell to another (or with the given drag data), as synthetic drag events.
// Returns the drop effect the target cell offers while dragging over it ('move' or 'none'): read
// from the dial's dragover handler, since synthetic events don't keep it.
const drag = (testPage, fromCell, toCell, dragData) => testPage.inDial(([from, to, data]) => {
	const cells = document.querySelectorAll('table.qd-grid td'), dataTransfer = new DataTransfer();
	if (data) dataTransfer.setData('text/plain', JSON.stringify(data));
	else cells[from].firstChild.dispatchEvent(new DragEvent('dragstart', { dataTransfer, bubbles: true, cancelable: true }));
	const probe = { getData: format => dataTransfer.getData(format), dropEffect: '' };
	app._onDragOver({ target: cells[to].firstChild, dataTransfer: probe, preventDefault() {} });
	cells[to].firstChild.dispatchEvent(new DragEvent('dragover', { dataTransfer, bubbles: true, cancelable: true }));
	cells[to].firstChild.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }));
	return probe.dropEffect;
}, [fromCell, toCell, dragData || null]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Values of settings that are a choice from a list (QDThemes.ClickEffect, QDThemes.HoverEffect)
const ClickEffect = { none: 0, pulseRing: 5 }, HoverEffect = { none: 0, smoothLift: 2 };
// Mouse buttons (MouseEvent.button)
const MouseButton = { left: 0, middle: 1, right: 2 };
// The dial's safety net: it loads again if the background page hasn't answered after 500 ms (js/dial.js)
const PAST_SAFETY_NET = 700;
// A picture's data URL longer than this is one of the large test screenshots, shorter the small new one
const LARGE_PICTURE = 1000;

module.exports = {
	title: 'Dial: pictures, early colour, pages, folders and Back, drag and drop',
	async run(testPage) {
		await freshProfile(testPage);
		await makeVersion4(testPage);
		await testPage.loadBg();

		// ----- tiles and pictures -----
		await testPage.loadDial();
		await testPage.waitFor('the pictures', () => [...frameWindow('dial').document.querySelectorAll('table.qd-grid a.is-bookmark')].filter(link => link.firstChild.style.backgroundImage.includes('data:image/webp')).length === 6);
		const tilesShown = await shownTiles(testPage);
		testPage.check('the dial shows 6 tiles with their WebP pictures and the folder', testPage.same(tilesShown.slice(0, 7), ['Site 1', 'Site 2', 'Site 3', 'Site 4', 'Site 5', 'Site 6'].map(title => 'bookmark:' + title).concat('folder:Folder')), tilesShown);
		const pictureSizeBefore = await testPage.inDial(() => document.querySelector('table.qd-grid a').firstChild.style.backgroundImage.length);
		await testPage.inHost(() => {
			const app = backgroundPage().app, canvas = document.createElement('canvas');
			canvas.width = 40; canvas.height = 30;
			return app.Images.setNodeImage(app.node.children[0], canvas.toDataURL('image/webp')).then(() => app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded));
		});
		const pictureSizeAfter = await testPage.waitFor('the new picture', maxSize => { const size = frameWindow('dial').document.querySelector('table.qd-grid a').firstChild.style.backgroundImage.length; return size < maxSize && size; }, LARGE_PICTURE);
		testPage.check('a changed picture (refresh, capture) shows up', pictureSizeBefore > LARGE_PICTURE && pictureSizeAfter > 0, [pictureSizeBefore, pictureSizeAfter]);
		const pageTitle = await testPage.inDial(() => document.title);
		testPage.check('the page title is the folder\'s', pageTitle === 'Quick Dial', pageTitle);

		// ----- the background colour, painted before the background page answers -----
		const rememberedColor = () => testPage.inHost(() => backgroundPage().localStorage.getItem('dialBackgroundColor'));
		const initialColor = await rememberedColor();
		testPage.check('the background colour is remembered for the dial', initialColor === (await testPage.inHost(() => backgroundPage().app.settings.backgroundColor)), initialColor);
		await changeSettings(testPage, { backgroundColor: '#123456' });
		const changedColor = await rememberedColor();
		testPage.check('a changed colour is remembered', changedColor === '#123456', changedColor);
		await testPage.inHost(() => { backgroundPage().app.ready = new Promise(resolve => { window.releaseBackgroundPage = resolve; }); }); // the background page is still loading
		await testPage.inHost(() => loadFrame('dial', 'dial.html'));
		await sleep(PAST_SAFETY_NET); // past the dial's safety net, which must not start a second load
		const whileLoading = await testPage.inHost(() => {
			const dialWindow = frameWindow('dial');
			return { html: dialWindow.document.documentElement.style.backgroundColor, drawn: !!dialWindow.app.settings, listeners: (mockState.listeners['rt.onMessage.dial'] || []).length };
		});
		testPage.check('while the background page loads: its colour, nothing drawn, no retry', whileLoading.html === 'rgb(18, 52, 86)' && !whileLoading.drawn && whileLoading.listeners === 0, whileLoading);
		await testPage.inHost(() => window.releaseBackgroundPage());
		const onceReady = await testPage.waitFor('the dial to draw', () => {
			const dialWindow = frameWindow('dial'), tiles = dialWindow.document.querySelectorAll('table.qd-grid a:not(.is-empty)').length;
			return tiles && { html: dialWindow.document.documentElement.style.backgroundColor, body: dialWindow.getComputedStyle(dialWindow.document.body).backgroundColor,
				tiles, listeners: (mockState.listeners['rt.onMessage.dial'] || []).length };
		});
		testPage.check('the dial draws once the background page is ready, listening once', onceReady.html === '' && onceReady.body === 'rgb(18, 52, 86)' && onceReady.listeners === 1, onceReady);

		// ----- folders and Back -----
		const folderLink = await testPage.inDial(() => document.querySelector('table.qd-grid a.is-folder').getAttribute('href'));
		testPage.check('a folder tile opens the dial on that folder', folderLink === '?bg=%23123456&path=%2FFolder', folderLink);
		await testPage.loadDial('?path=%2FFolder');
		const folderDial = { tiles: (await shownTiles(testPage)).filter(tile => tile !== '-'), title: await testPage.inDial(() => document.title) };
		testPage.check('a folder\'s dial: Back first, then its tiles', testPage.same(folderDial.tiles, ['back:Back', 'bookmark:Site 7']) && folderDial.title === 'Folder', folderDial);
		await changeSettings(testPage, { grid: { backNode: false } });
		await testPage.waitFor('the dial to follow', () => !frameWindow('dial').document.querySelector('table.qd-grid a.is-back'));
		const tilesWithoutBack = (await shownTiles(testPage)).filter(tile => tile !== '-');
		testPage.check('without the Back tile setting, no Back tile', testPage.same(tilesWithoutBack, ['bookmark:Site 7']), tilesWithoutBack);
		await changeSettings(testPage, { grid: { backNode: true } });

		// ----- the click effect: on a left or middle mouse down on a tile, never on an empty cell or a right click -----
		// Mouse down with a button on the cell's tile; whether the tile then plays the effect
		const pressTile = (cellIndex, button) => testPage.inDial(([cell, pressedButton]) => {
			const link = document.querySelectorAll('table.qd-grid td')[cell].firstChild;
			link.dispatchEvent(new MouseEvent('mousedown', { button: pressedButton, bubbles: true }));
			const playing = link.classList.contains('is-clicked');
			link.classList.remove('is-clicked'); // the tile list (shownTiles) reads the class names
			return playing;
		}, [cellIndex, button]);
		testPage.check('no click effect by default', !(await pressTile(1, MouseButton.left)));
		await changeSettings(testPage, { grid: { cells: { clickEffect: ClickEffect.pulseRing } } });
		await testPage.waitFor('the dial to follow', () => [...frameWindow('dial').document.styleSheets].some(sheet => [...sheet.cssRules].some(rule => rule.name === 'qd-click-ring')));
		const effectPlayed = [await pressTile(0, MouseButton.left), await pressTile(1, MouseButton.middle), await pressTile(1, MouseButton.right), await pressTile(5, MouseButton.left)];
		testPage.check('the click effect plays on Back and a tile, left or middle button only, not on an empty cell', testPage.same(effectPlayed, [true, true, false, false]), effectPlayed);
		await changeSettings(testPage, { grid: { cells: { clickEffect: ClickEffect.none } } });

		// ----- reduced motion (Windows' "Show animations" off): a smooth hover still fades colours, nothing moves -----
		// What a tile and its title fade on hover (computed transition properties)
		const hoverTransitions = () => testPage.inDial(() => {
			const link = document.querySelector('table.qd-grid a.is-bookmark');
			return { link: getComputedStyle(link).transitionProperty, title: getComputedStyle(link.lastChild).transitionProperty };
		});
		await changeSettings(testPage, { grid: { cells: { hoverEffect: HoverEffect.smoothLift } } });
		await testPage.waitFor('the dial to follow', () => frameWindow('dial').getComputedStyle(frameWindow('dial').document.querySelector('table.qd-grid a.is-bookmark')).transitionProperty.includes('transform'));
		await testPage.page.emulateMedia({ reducedMotion: 'reduce' });
		const reducedTransitions = await hoverTransitions();
		testPage.check('with reduced motion the hover fades colours and borders, without lifting or resizing',
			reducedTransitions.link === 'border-color, opacity, box-shadow, backdrop-filter' && reducedTransitions.title === 'color, background-color, border-color'
			&& (await testPage.inDial(() => matchMedia('(prefers-reduced-motion: reduce)').matches)), reducedTransitions);
		await testPage.page.emulateMedia({ reducedMotion: 'no-preference' });
		await changeSettings(testPage, { grid: { cells: { hoverEffect: HoverEffect.none } } });

		// ----- pages (mouse wheel, Page Down / Page Up) -----
		await testPage.loadDial();
		await changeSettings(testPage, { grid: { rows: 1, columns: 3 } });
		await testPage.waitFor('the 3-cell grid', () => frameWindow('dial').document.querySelectorAll('table.qd-grid td').length === 3);
		// [page, last page, then the titles on the page ('-' for an empty cell)]
		const currentPage = () => testPage.inDial(() => [dial.page, dial.maxPage, ...[...document.querySelectorAll('table.qd-grid a')].map(link => link.className === 'is-empty' ? '-' : link.lastChild.innerText)]);
		const pageDown = () => testPage.inDial(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'PageDown' })));
		const wheel = deltaY => testPage.inDial(delta => window.dispatchEvent(new WheelEvent('wheel', { deltaY: delta })), deltaY);
		const WHEEL_STEP = 100;
		const pagesSeen = [await currentPage()];
		await pageDown(); pagesSeen.push(await currentPage());
		await wheel(WHEEL_STEP); pagesSeen.push(await currentPage());
		await pageDown(); pagesSeen.push(await currentPage());
		await wheel(-WHEEL_STEP); pagesSeen.push(await currentPage());
		testPage.check('Page Down and the wheel turn pages, and stop at the last one', testPage.same(pagesSeen, [[1, 3, 'Site 1', 'Site 2', 'Site 3'], [2, 3, 'Site 4', 'Site 5', 'Site 6'],
			[3, 3, 'Folder', '-', '-'], [3, 3, 'Folder', '-', '-'], [2, 3, 'Site 4', 'Site 5', 'Site 6']]), pagesSeen);
		await testPage.loadDial('?path=%2FFolder');
		const folderPage = await currentPage();
		testPage.check('in a folder, Back takes a cell on every page', testPage.same(folderPage, [1, 1, 'Back', 'Site 7', '-']), folderPage);

		// ----- drag and drop: tiles swap places -----
		const folderTileIds = () => testPage.inHost(() => backgroundPage().app.node.children[6].children.map(tile => tile.id || '-'));
		await changeSettings(testPage, { grid: { rows: 2, columns: 4 } });
		await testPage.loadDial();
		await drag(testPage, 0, 7);
		await testPage.waitFor('the swap', () => backgroundPage().app.node.children[7] && backgroundPage().app.node.children[7].id === 'b1');
		await testPage.idle();
		await testPage.waitFor('the dial to follow', () => frameWindow('dial').document.querySelectorAll('table.qd-grid a')[7].className === 'is-bookmark');
		const afterMove = { ids: await tileIds(testPage), stored: await testPage.inHost(() => mockState.storage.node.children.map(tile => tile.id || '-')), shown: await shownTiles(testPage) };
		testPage.check('a tile dragged to an empty cell moves there, saved and shown', testPage.same(afterMove.ids, ['-', 'b2', 'b3', 'b4', 'b5', 'b6', 'f1', 'b1'])
			&& testPage.same(afterMove.stored, afterMove.ids) && afterMove.shown[0] === '-' && afterMove.shown[7] === 'bookmark:Site 1', afterMove);
		const dropEffectBack = await drag(testPage, 7, 0);
		await testPage.waitFor('the swap back', () => backgroundPage().app.node.children[0].id === 'b1');
		const idsAfterMoveBack = await tileIds(testPage);
		testPage.check('dragged back: the gap at the end is trimmed', testPage.same(idsAfterMoveBack, ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'f1']) && dropEffectBack === 'move', [dropEffectBack, idsAfterMoveBack]);
		await drag(testPage, 1, 2);
		await testPage.waitFor('the swap', () => backgroundPage().app.node.children[1].id === 'b3');
		const idsAfterSwap = await tileIds(testPage);
		testPage.check('two tiles swap places', testPage.same(idsAfterSwap.slice(0, 3), ['b1', 'b3', 'b2']), idsAfterSwap);
		const dropEffectOtherFolder = await drag(testPage, null, 4, { parentId: 'other', index: 0 });
		await testPage.idle();
		testPage.check('a drag from another folder is refused', dropEffectOtherFolder === 'none' && testPage.same((await tileIds(testPage)).slice(0, 5), ['b1', 'b3', 'b2', 'b4', 'b5']), dropEffectOtherFolder);
		await testPage.loadDial('?path=%2FFolder');
		const dropEffectOnBack = await drag(testPage, 1, 0);
		await testPage.idle();
		testPage.check('the Back cell takes no drop (and a drop there changes nothing)', dropEffectOnBack === 'none' && (await folderTileIds())[0] === 'b7', dropEffectOnBack);
		const dropEffectInFolder = await drag(testPage, 1, 2);
		await testPage.waitFor('the move in the folder', () => backgroundPage().app.node.children[6].children[1] && backgroundPage().app.node.children[6].children[1].id === 'b7');
		const idsInFolder = await folderTileIds();
		testPage.check('in a folder, cells count after Back', testPage.same(idsInFolder, ['-', 'b7']), [dropEffectInFolder, idsInFolder]);
	}
};
