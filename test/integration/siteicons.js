// A site's own icon as a tile picture, and the letter tile (js/background/siteicons.js): which icons a page
// offers (its links, its web app manifest, /favicon.ico) and which it doesn't, what isn't an icon, how an icon is
// drawn on its tile picture, and "Use site icon" on a tile. Called on the background page directly.
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js). The icons are PNGs made in the
// browser and SVG, served by the test server next to the pages; other sites are the stub page (no icons).
// The steps build on each other only through the tiles: b1 ends as a site icon tile, b2 as a letter tile.
// Related: Refresh, Capture page and Properties' changes of the picture's source are unit/tilepictures.test.js;
// choosing an icon in Properties is properties.js; the menu item is dial-edit.js and toolbar-menus.js.
'use strict';
const { freshProfile, sitePage } = require('../lib/fixtures');

// The sizes of the PNG icons served with the page (pixels)
const SMALL_ICON = 16, TOUCH_ICON = 180, LARGE_ICON = 512;
// The tile pictures SiteIcons makes: half the 1200-pixel width pages are drawn at, in the tiles' 4:3 shape, with
// the icon on 56% of the shorter side. A 16-pixel icon is enlarged 15 times (by whole pixels): 240 pixels.
const PICTURE_SIZE = { width: 600, height: 450 }, ICON_SIDE = 252, SMALL_ICON_SIDE = 240;
// How far a drawn edge may be from where it should be (WebP blurs the edges a little), in pixels; a pixel counts as
// drawn from this alpha on (half opaque, of 255)
const EDGE_TOLERANCE = 2, OPAQUE_FROM = 128;
// The picture source of a site icon tile (QDCommon.ImageSource)
const ImageSource = { siteIcon: 1 };

// A square PNG of one colour, made in the browser, as a Buffer for the test server
const pngIcon = async (testPage, side, color) => Buffer.from(await testPage.inHost(([size, fill]) => {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = fill;
	ctx.fillRect(0, 0, size, size);
	return canvas.toDataURL('image/png').split(',')[1];
}, [side, color]), 'base64');
// SiteIcons.find(url) on the background page, with each icon's picture replaced by where it is drawn on it
const findIcons = (testPage, url) => testPage.inHost(address => backgroundPage().app.SiteIcons.find(address).then(async found => ({
	title: found.title, icons: await Promise.all(found.icons.map(async icon => ({ width: icon.width, isVector: icon.isVector, drawn: await window.qdDrawnBox(icon.picture) })))
})), url);
// Where a picture is opaque: { width, height } of the picture and the box around its opaque pixels
const defineDrawnBox = testPage => testPage.inHost(opaqueFrom => {
	window.qdDrawnBox = async dataUrl => {
		const image = new Image();
		image.src = dataUrl;
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(image, 0, 0);
		const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
		for (let row = 0; row < canvas.height; row++) for (let column = 0; column < canvas.width; column++) {
			if (pixels[(row * canvas.width + column) * 4 + 3] < opaqueFrom) continue;
			left = Math.min(left, column); right = Math.max(right, column); top = Math.min(top, row); bottom = Math.max(bottom, row);
		}
		return { width: canvas.width, height: canvas.height, left, top, boxWidth: right - left + 1, boxHeight: bottom - top + 1 };
	};
}, OPAQUE_FROM);
// Whether a drawn box is a centred square of the given side on a picture of PICTURE_SIZE
const isCentredSquare = (drawn, side) => drawn.width === PICTURE_SIZE.width && drawn.height === PICTURE_SIZE.height
	&& [drawn.boxWidth, drawn.boxHeight].every(length => Math.abs(length - side) <= EDGE_TOLERANCE)
	&& Math.abs(drawn.left - (PICTURE_SIZE.width - side) / 2) <= EDGE_TOLERANCE && Math.abs(drawn.top - (PICTURE_SIZE.height - side) / 2) <= EDGE_TOLERANCE;
// A node of the background page by id
const nodeById = (testPage, id) => testPage.inHost(nodeId => backgroundPage().app.GridNodes.getNodeById(nodeId), id);
// "Use site icon" on a tile, at an address of the test; resolves with the tile and where its picture is drawn
const useSiteIcon = (testPage, id, url) => testPage.inHost(async ([nodeId, address]) => {
	const page = backgroundPage(), tile = page.app.GridNodes.getNodeById(nodeId);
	tile.url = address;
	await page.app.TilePictures.useSiteIcon(tile);
	return { tile: JSON.parse(JSON.stringify(tile)), drawn: await window.qdDrawnBox((await page.app.Images.get([nodeId]))[nodeId]) };
}, [id, url]);

module.exports = {
	title: 'Site icons: found on the page, its manifest and /favicon.ico, drawn on tile pictures; letter tiles',
	async run(testPage) {
		await freshProfile(testPage);
		await defineDrawnBox(testPage);
		sitePage(testPage, 'small.png', await pngIcon(testPage, SMALL_ICON, '#3366cc'));
		sitePage(testPage, 'touch.png', await pngIcon(testPage, TOUCH_ICON, '#cc6633'));
		sitePage(testPage, 'large.png', await pngIcon(testPage, LARGE_ICON, '#33aa66'));
		sitePage(testPage, 'app.json', JSON.stringify({ icons: [{ src: 'large.png', sizes: LARGE_ICON + 'x' + LARGE_ICON, type: 'image/png' },
			{ src: 'touch.png', sizes: '1024x1024', purpose: 'monochrome' }] }));
		sitePage(testPage, 'logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#663399"/></svg>');
		sitePage(testPage, 'not-an-icon.png', '<!doctype html><html><head><title>Not found</title></head><body></body></html>');
		const iconPage = sitePage(testPage, 'icons.html', '<!doctype html><html><head><title>Icon page</title>'
			+ '<link rel="shortcut icon" href="small.png" sizes="16x16"><link rel="apple-touch-icon" href="touch.png">'
			+ '<link rel="icon" href="not-an-icon.png" sizes="64x64"><link rel="mask-icon" href="logo.svg"><link rel="manifest" href="app.json">'
			+ '</head><body></body></html>');
		const vectorPage = sitePage(testPage, 'vector.html', '<!doctype html><html><head><title>Vector</title><base href="sub/">'
			+ '<link rel="icon" href="../logo.svg"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 2 1\'/%3E" sizes="any">'
			+ '</head><body></body></html>');

		// ----- which icons a page offers, best first -----
		const found = await findIcons(testPage, iconPage);
		testPage.check('the page\'s icons, its manifest\'s (not the one-colour ones) and nothing else, largest first, with the page\'s title',
			found.title === 'Icon page' && testPage.same(found.icons.map(icon => icon.width), [LARGE_ICON, TOUCH_ICON, SMALL_ICON]) && found.icons.every(icon => !icon.isVector), found);
		testPage.check('a large icon is drawn centred on a transparent tile picture, on 56% of its height', isCentredSquare(found.icons[0].drawn, ICON_SIDE), found.icons[0].drawn);
		testPage.check('a small one is enlarged by whole pixels', isCentredSquare(found.icons[2].drawn, SMALL_ICON_SIDE), found.icons[2].drawn);
		const vector = await findIcons(testPage, vectorPage);
		testPage.check('an SVG icon comes first, found through the page\'s <base>, and is drawn at the full icon size',
			vector.icons.length === 2 && vector.icons.every(icon => icon.isVector && icon.width === 0) && isCentredSquare(vector.icons[0].drawn, ICON_SIDE), vector);

		// ----- no icons -----
		const stubSite = await findIcons(testPage, 'https://site1.example/');
		testPage.check('a site without icons has none: its /favicon.ico answer is a web page', stubSite.title === 'site1.example' && stubSite.icons.length === 0, stubSite);
		const notWeb = await testPage.inHost(() => Promise.all(['javascript:alert(1)', 'place:sort=8', 'file:///C:/x.html', '']
			.map(address => backgroundPage().app.SiteIcons.find(address).then(result => result.title === null && result.icons.length === 0))));
		testPage.check('addresses that aren\'t web pages are not downloaded', notWeb.every(Boolean), notWeb);

		// ----- letter tiles -----
		const letters = await testPage.inHost(async () => {
			const SiteIcons = backgroundPage().app.SiteIcons;
			const [wwwSite, sameSite, otherSite] = [SiteIcons.letter('https://www.example.org/a'), SiteIcons.letter('https://example.org/b'), SiteIcons.letter('https://other.example/')];
			return { sameForTheSite: wwwSite === sameSite, otherDiffers: otherSite !== sameSite, drawn: await window.qdDrawnBox(sameSite) };
		});
		testPage.check('a letter tile is the same for a site (www. aside), another for another site, drawn as an icon',
			letters.sameForTheSite && letters.otherDiffers && isCentredSquare(letters.drawn, ICON_SIDE), letters);

		// ----- Use site icon on a tile -----
		const iconTile = await useSiteIcon(testPage, 'b1', iconPage);
		testPage.check('Use site icon: the tile gets the best icon, the page\'s title, and stays a site icon tile', iconTile.tile.imageSource === ImageSource.siteIcon
			&& iconTile.tile.image === '1' && iconTile.tile.title === 'Icon page' && isCentredSquare(iconTile.drawn, ICON_SIDE), iconTile);
		await testPage.inHost(() => { const app = backgroundPage().app; return app.TilePictures.refresh(app.GridNodes.getNodeById('b1')); });
		const refreshedTile = await nodeById(testPage, 'b1');
		testPage.check('...and Refresh keeps it one, without drawing the page', refreshedTile.imageSource === ImageSource.siteIcon && refreshedTile.image === '1', refreshedTile);
		const letterTile = await useSiteIcon(testPage, 'b2', 'https://site2.example/');
		testPage.check('a site without icons gets a letter tile', letterTile.tile.imageSource === ImageSource.siteIcon && letterTile.tile.image === '1'
			&& isCentredSquare(letterTile.drawn, ICON_SIDE), letterTile);
	}
};
