// Editing from the dial (js/dial.js, js/ui.js dialogs and popup frame): the commands of its context menu (new bookmark
// or folder, delete, refresh, capture, use site icon, properties), its dialogs by keyboard, and its Settings items.
// The menu itself lives in the background page (toolbar-menus.js); here its commands are sent to the
// dial as the background page does, after a mousedown on the tile, as a right-click would.
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js) and no pictures; drawing
// pages works (stubDrawWindow), so on opening, the dial fetches every site: the tiles then have pictures
// and are titled with their host ("site2.example", the test server's stub pages). A local page
// (/site/news.html) stands for a real site where its title matters.
// The steps build on each other: "News page" (cell 7) stays and is refreshed later; the other tiles and
// folders made here are deleted again. Capture is only checked up to the request (siteinfos.js tests it).
'use strict';
const { freshProfile, spyTabs, stubDrawWindow, sitePage } = require('../lib/fixtures');

// The titles of the tiles the dial shows
const shownTitles = testPage => testPage.inDial(() => [...document.querySelectorAll('table.qd-grid a:not(.is-empty)')].map(link => link.lastChild.innerText));
// What the context menu does: the dial remembers the tile under the mouse, the background page sends the command.
// Returns the tile's class right after the command (e.g. is-loading).
const menuCommand = (testPage, command, tileTitle) => testPage.inDial(([cmd, title]) => {
	const link = title && [...document.querySelectorAll('table.qd-grid a:not(.is-empty)')].find(tile => tile.lastChild.innerText === title);
	if (title && !link) throw new Error('no tile "' + title + '"');
	if (link) link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
	top.fireEvent('rt.onMessage.dial', { cmd }, {}, () => {});
	return link && link.className;
}, [command, tileTitle || null]);
// The commands of the tile menu, as the background page sends them to the dial (js/dial.js)
const MenuCommand = { createBookmark: 200, createFolder: 201, editProperties: 203, refresh: 204, capture: 206, delete: 207, useSiteIcon: 210 };
// Addresses New bookmark refuses: scripts (js/dial.js, app.BLOCKED_SCHEMES)
const SCRIPT_ADDRESSES = ['javascript:alert(1)', 'vbscript:msgbox(1)'];

module.exports = {
	title: 'Dial menu: new bookmark and folder, delete, refresh, capture, properties, Settings',
	async run(testPage) {
		await freshProfile(testPage);
		await stubDrawWindow(testPage);
		await testPage.loadDial();
		await testPage.waitFor('the tiles to fetch their sites (titled with their host)', () => backgroundPage().app.node.children.filter(tile => tile.image === '1').length === 6);
		const newsPage = sitePage(testPage, 'news.html', '<!doctype html><html><head><title>News page</title></head><body><h1>News</h1></body></html>');

		// ----- New bookmark: the address is checked; the new tile fetches its title and picture -----
		for (const scriptAddress of SCRIPT_ADDRESSES) {
			await menuCommand(testPage, MenuCommand.createBookmark);
			const refused = await testPage.answer({ values: [scriptAddress] });
			testPage.check(`New bookmark refuses a script address (${scriptAddress})`, /web address/.test(refused.error), refused);
			await testPage.answer({ ok: false });
		}
		await menuCommand(testPage, MenuCommand.createBookmark);
		await testPage.answer({ values: [newsPage] });
		await testPage.waitFor('the new tile with its picture', () => { const tile = backgroundPage().app.node.children.find(child => child.url && child.url.includes('news.html')); return tile && tile.image === '1'; });
		await testPage.waitFor('the dial to show it', () => [...frameWindow('dial').document.querySelectorAll('table.qd-grid a.is-bookmark')].some(link => link.lastChild.innerText === 'News page' && link.firstChild.style.backgroundImage));
		const newBookmark = await testPage.inHost(() => ({ tile: backgroundPage().app.node.children[7],
			bookmark: dialFolderBookmarks().find(child => child.url && child.url.includes('news.html')) }));
		testPage.check('New bookmark adds a tile at the end and fetches its title and picture', newBookmark.tile && newBookmark.tile.title === 'News page' && newBookmark.bookmark && newBookmark.bookmark.title === 'News page', newBookmark);
		await menuCommand(testPage, MenuCommand.createBookmark);
		await testPage.answer({ values: ['example.org'] });
		const schemelessAddress = await testPage.waitFor('the tile', () => { const tile = backgroundPage().app.node.children[8]; return tile && tile.url; });
		testPage.check('an address without a scheme gets https://', schemelessAddress === 'https://example.org', schemelessAddress);
		await testPage.inHost(() => backgroundPage().browser.bookmarks.removeTree(backgroundPage().app.node.children[8].id));
		await testPage.idle();

		// ----- New folder, Delete -----
		await menuCommand(testPage, MenuCommand.createFolder);
		const newFolderDialog = await testPage.answer();
		await testPage.waitFor('the new folder', () => backgroundPage().app.node.children.some(tile => tile.title === 'New Folder'));
		await testPage.waitFor('the dial to show it', () => frameWindow('dial').document.querySelectorAll('table.qd-grid a.is-folder').length === 2);
		const folderBookmarked = await testPage.inHost(() => dialFolderBookmarks().some(child => child.title === 'New Folder' && !child.url));
		testPage.check('New folder adds a folder tile and its bookmarks folder', folderBookmarked && newFolderDialog.error === null);

		await menuCommand(testPage, MenuCommand.delete, 'New Folder');
		const deleteDialog = await testPage.answer({ ok: false });
		await testPage.idle();
		testPage.check('Delete asks first; Cancel keeps the tile', deleteDialog.title === 'Delete New Folder?' && (await shownTitles(testPage)).includes('New Folder'), deleteDialog);
		await menuCommand(testPage, MenuCommand.delete, 'New Folder');
		await testPage.answer();
		await testPage.waitFor('the tile to go', () => !backgroundPage().app.node.children.some(tile => tile.title === 'New Folder'));
		await testPage.waitFor('the dial to follow', () => ![...frameWindow('dial').document.querySelectorAll('table.qd-grid a:not(.is-empty)')].some(link => link.lastChild.innerText === 'New Folder'));
		const folderStillBookmarked = await testPage.inHost(() => dialFolderBookmarks().some(child => child.title === 'New Folder'));
		testPage.check('Delete removes the tile and its bookmark', !folderStillBookmarked);

		// ----- the dialogs by keyboard: Enter accepts, Escape cancels -----
		await menuCommand(testPage, MenuCommand.createFolder);
		await testPage.dial().locator('.qd-dialog input').fill('Keyboard');
		await testPage.dial().locator('.qd-dialog input').press('Enter');
		await testPage.waitFor('the folder', () => backgroundPage().app.node.children.some(tile => tile.title === 'Keyboard'));
		await testPage.waitFor('the dial to show it', () => [...frameWindow('dial').document.querySelectorAll('table.qd-grid a.is-folder')].some(link => link.lastChild.innerText === 'Keyboard'));
		await menuCommand(testPage, MenuCommand.delete, 'Keyboard');
		await testPage.dial().locator('.qd-overlay:not(.is-closing) .qd-dialog').waitFor();
		const focusedButton = await testPage.inDial(() => document.activeElement.textContent);
		await testPage.dial().locator('.qd-dialog .qd-btn').first().press('Escape');
		await testPage.waitFor('the dialog to close', () => !frameWindow('dial').document.querySelector('.qd-overlay:not(.is-closing)'));
		await testPage.idle();
		const keyboardFolderKept = await testPage.inHost(() => backgroundPage().app.node.children.some(tile => tile.title === 'Keyboard'));
		testPage.check('dialogs: Enter accepts, Escape cancels; a delete has Cancel focused', keyboardFolderKept && focusedButton === 'Cancel', focusedButton);

		// ----- Refresh: the page is fetched again (here with a new title); the tile shows the loading picture meanwhile -----
		sitePage(testPage, 'news.html', '<!doctype html><html><head><title>News, updated</title></head><body></body></html>');
		const classWhileRefreshing = await menuCommand(testPage, MenuCommand.refresh, 'News page');
		await testPage.waitFor('the new title', () => [...frameWindow('dial').document.querySelectorAll('table.qd-grid a')].some(link => link.lastChild.innerText === 'News, updated'));
		testPage.check('Refresh shows the loading picture, then the new title', classWhileRefreshing === 'is-loading', classWhileRefreshing);
		const loadingPicture = await testPage.inDial(() => dial.styles.grid.linkLoading.backgroundImage);
		testPage.check('the loading picture is the built-in spinner', loadingPicture.includes('/img/loading.svg'), loadingPicture);

		// ----- Capture page, Use site icon and Properties: the dial asks the background page / opens the popup for the tile under the mouse -----
		await testPage.inHost(() => {
			const page = backgroundPage();
			page.qdCaptured = [];
			page.qdSiteIcons = [];
			page.app.TilePictures.capturePage = node => { page.qdCaptured.push(node.id); return Promise.resolve(null); };
			page.app.TilePictures.useSiteIcon = node => { page.qdSiteIcons.push(node.id); return Promise.resolve(null); };
		});
		await menuCommand(testPage, MenuCommand.capture, 'site2.example');
		const capturedIds = await testPage.waitFor('the capture request', () => backgroundPage().qdCaptured.length && backgroundPage().qdCaptured);
		testPage.check('Capture page asks for the tile under the mouse', testPage.same(capturedIds, ['b2']), capturedIds);
		const classForSiteIcon = await menuCommand(testPage, MenuCommand.useSiteIcon, 'site4.example');
		const siteIconIds = await testPage.waitFor('the site icon request', () => backgroundPage().qdSiteIcons.length && backgroundPage().qdSiteIcons);
		testPage.check('Use site icon asks for the tile under the mouse, which shows the loading picture', testPage.same(siteIconIds, ['b4']) && classForSiteIcon === 'is-loading', [siteIconIds, classForSiteIcon]);
		await menuCommand(testPage, MenuCommand.editProperties, 'site3.example');
		const popupAddress = await testPage.waitFor('the Properties popup', () => { const popup = frameWindow('dial').document.querySelector('.qd-frame iframe'); return popup && popup.getAttribute('src'); });
		testPage.check('Properties opens in a popup for that tile', popupAddress === '/html/properties.html?id=b3', popupAddress);
		await testPage.waitFor('the popup to load', () => { const popup = frameWindow('dial').document.querySelector('.qd-frame iframe'); return popup && popup.contentWindow.app && popup.contentWindow.app.node; });
		await testPage.dial().locator('body').press('Escape');
		await testPage.waitFor('the popup to close', () => !frameWindow('dial').document.querySelector('.qd-overlay'));
		testPage.check('Escape closes the popup', true);

		// ----- the dial's Settings items open the Settings tab (0.5.0) -----
		await spyTabs(testPage);
		await testPage.inDial(() => { app.editSettings('backup'); app.editSettings(new MouseEvent('click')); });
		const openedTabs = await testPage.waitFor('the tabs', () => backgroundPage().qdTabs.length === 2 && backgroundPage().qdTabs);
		testPage.check('the dial\'s Settings items open the Settings tab', testPage.same(openedTabs, [['create', { url: 'html/settings.html?tab=backup' }], ['create', { url: 'html/settings.html' }]]), openedTabs);

		// ----- the tile menu also opens on a folder's Back tile: its items do nothing there -----
		await testPage.loadDial('?path=%2FFolder');
		await testPage.inHost(() => { backgroundPage().qdCaptured = []; });
		const classesAfterCommands = [];
		for (const command of [MenuCommand.refresh, MenuCommand.capture, MenuCommand.editProperties, MenuCommand.delete]) classesAfterCommands.push(await menuCommand(testPage, command, 'Back'));
		await testPage.idle();
		const backTile = await testPage.inDial(() => ({ className: document.querySelector('table.qd-grid a').className, popup: !!document.querySelector('.qd-overlay') }));
		backTile.classesAfterCommands = classesAfterCommands;
		backTile.captured = await testPage.inHost(() => backgroundPage().qdCaptured.length);
		testPage.check('Refresh, Capture, Properties and Delete on the Back tile change nothing', testPage.same(classesAfterCommands, ['is-back', 'is-back', 'is-back', 'is-back'])
			&& backTile.className === 'is-back' && !backTile.popup && backTile.captured === 0, backTile);
	}
};
