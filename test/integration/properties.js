// The Properties popup of a tile (html/properties.html, js/properties.js), opened from the dial in a frame
// on it, and used as the user would: typing, the lock switches, the fit list, a picture from a file, by
// drop or by paste, Revert, "Use default", and OK / Apply / Cancel / Enter / Escape.
//
// Starts from: a fresh profile with the standard bookmarks (lib/fixtures.js) and the dial open; drawing
// pages works (stubDrawWindow), so the tiles first fetch their sites: they get pictures and are titled
// with their host ("site1.example").
// The steps build on each other:
//   b1: renamed "My site" (title locked, fit Contain), a picture from a file (locked), then a new address
//   b2: a dropped and a pasted picture, then Cancel and Escape: nothing is saved
//   b5: at a local page with an SVG icon: its letter tile chosen (Site icon), then Page (Capture page stood in for)
//   b6: a picture through the File source; then an icon (test sets in place of the real ones): nothing downloaded until
//       Download, the search, an outline icon, the retro set, a download refused, OK; reopened, Remove (the tile keeps its icon)
//   f1: a folder's form; renamed "Work", its picture back to the folder icon
//   b3: its bookmark deleted while the window is open, then opened again while gone
//   b4: taken out of the tree without the window being told, then OK
// Related: the updateNode message the popup sends is tested on its own in messages.js.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { freshProfile, stubDrawWindow, pictures, sitePage } = require('../lib/fixtures');

// How a picture fills its tile (QDCommon.ImageMode), as values of the fit list (the ImageMode field)
const ImageFit = { inherit: '-1', contain: '2' };
// Where a tile's picture comes from (QDCommon.ImageSource)
const ImageSource = { letter: 2, file: 3, icon: 4 };

// The icon picker's sets for this suite, in place of the real ones (src/iconsets.json, js/background/iconsets.js): two
// outline icons; a retro set of two icons in a picture made in the page; a pixel set whose file doesn't match its fingerprint.
// Served from the test server's site/ folder. Returns a function that puts the real iconsets.json back.
const TEST_OUTLINE = { source: 'Test outline 1', license: 'MIT', icons: [['home', 'house', '<path d="M3 12l9-9 9 9"/>'], ['star', 'favourite', '<path d="M12 3l3 7h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z"/>']] };
const TEST_PIXEL = { source: 'Test pixel 1', license: 'MIT', icons: [['heart', '', '<path d="M2 2h4v4H2z"/>']] };
async function useTestIconSets(testPage) {
	const retroPicture = await testPage.inHost(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 32;
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#cc3366';
		ctx.fillRect(0, 0, 32, 32);
		ctx.fillStyle = '#3366cc';
		ctx.fillRect(32, 0, 16, 16);
		return canvas.toDataURL('image/png');
	});
	const retro = { source: 'Test retro 1', license: 'BSD', cell: 32, picture: retroPicture, icons: [['big', '', 0, 0, 32], ['small', '', 32, 0, 16]] };
	const catalog = { release: 'icons-test', base: testPage.base + 'site/icon-sets/', sets: {} };
	fs.mkdirSync(path.join(testPage.dir, 'site', 'icon-sets'), { recursive: true });
	for (const [name, data] of Object.entries({ outline: TEST_OUTLINE, pixel: TEST_PIXEL, retro })) {
		const bytes = Buffer.from(JSON.stringify(data) + '\n');
		sitePage(testPage, 'icon-sets/' + name + '.json', bytes);
		catalog.sets[name] = { file: name + '.json', bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), count: data.icons.length,
			source: data.source, homepage: testPage.base + 'site/', license: data.license, licenseUrl: testPage.base + 'site/LICENSE' };
	}
	catalog.sets.pixel.sha256 = '0'.repeat(64); // not the file's
	const catalogFile = path.join(testPage.dir, 'iconsets.json'), realCatalog = fs.readFileSync(catalogFile);
	fs.writeFileSync(catalogFile, JSON.stringify(catalog));
	return () => fs.writeFileSync(catalogFile, realCatalog);
}

// Opens Properties for a tile, as its context menu item does, and waits until the form is filled in.
// Returns a locator for the popup's frame.
async function openProperties(testPage, id) {
	await testPage.inDial(nodeId => app.editProperties({ gridNode: { id: nodeId } }), id);
	await testPage.waitFor('Properties to load', () => {
		const popup = frameWindow('dial').document.querySelector('.qd-frame iframe');
		return popup && popup.contentWindow.app && popup.contentWindow.app.node && popup.contentWindow.document.getElementById('Title').value;
	});
	return testPage.dial().frameLocator('.qd-frame iframe');
}
// Runs pageFunction(arg) in the popup
const inPopup = async (testPage, pageFunction, arg) => (await testPage.frame()).childFrames().find(frame => frame.url().includes('properties.html')).evaluate(pageFunction, arg);
// Waits until the popup has closed
const popupClosed = testPage => testPage.waitFor('the popup to close', () => !frameWindow('dial').document.querySelector('.qd-overlay'));
// Whether a popup is open on the dial
const popupOpen = testPage => testPage.inHost(() => !!frameWindow('dial').document.querySelector('.qd-overlay'));
// A node of the background page by id
const nodeById = (testPage, id) => testPage.inHost(nodeId => backgroundPage().app.GridNodes.getNodeById(nodeId), id);
// A PNG data URL as a file for the file picker
const pngFile = dataUrl => ({ name: 'pic.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });

module.exports = {
	title: 'Properties: title, address, locks, picture (file, fit, revert, default), OK / Apply / Cancel',
	async run(testPage) {
		await freshProfile(testPage);
		await stubDrawWindow(testPage);
		await testPage.loadDial();
		await testPage.waitFor('the tiles to fetch their sites', () => backgroundPage().app.node.children.filter(tile => tile.image === '1').length === 6);

		// ----- a bookmark: the form, Apply -----
		let popup = await openProperties(testPage, 'b1');
		const bookmarkForm = await inPopup(testPage, () => ({ header: HeaderTitle.textContent, sub: HeaderSubtitle.textContent, title: Title.value, url: Url.value, urlShown: !UrlRow.hidden,
			locks: [TitleLocked.checked, ImageLocked.checked], mode: ImageMode.value, picture: ImagePreview.style.backgroundImage.slice(0, 16), apply: BtnApply.disabled, focused: document.activeElement.id }));
		testPage.check('a bookmark\'s Properties: header, address, its picture, nothing to apply', bookmarkForm.header === 'Bookmark properties' && bookmarkForm.sub === 'site1.example'
			&& bookmarkForm.title === 'site1.example' && bookmarkForm.url === 'https://site1.example/' && bookmarkForm.urlShown && testPage.same(bookmarkForm.locks, [false, false])
			&& bookmarkForm.mode === ImageFit.inherit && bookmarkForm.picture === 'url("data:image/' && bookmarkForm.apply && bookmarkForm.focused === 'Title', bookmarkForm);
		await popup.locator('#Title').fill('My site');
		await popup.locator('#TitleLocked').check({ force: true });
		await popup.locator('#ImageMode').selectOption(ImageFit.contain);
		const edited = await inPopup(testPage, () => ({ apply: BtnApply.disabled, status: Status.textContent, size: ImagePreview.style.backgroundSize }));
		testPage.check('edits enable Apply and preview the fit', !edited.apply && edited.status === 'Unsaved changes' && edited.size === 'contain', edited);
		await popup.locator('#BtnApply').click();
		await testPage.idle();
		const applied = { node: await nodeById(testPage, 'b1'), bookmark: await testPage.inHost(() => dialFolderBookmarks()[0].title), open: await popupOpen(testPage) };
		testPage.check('Apply saves title, lock and fit, renames the bookmark, and stays open', applied.node.title === 'My site' && applied.node.titleLocked
			&& applied.node.imageMode === +ImageFit.contain && applied.bookmark === 'My site' && applied.open, applied);
		await testPage.waitFor('the dial to follow', () => [...frameWindow('dial').document.querySelectorAll('table.qd-grid a')].some(link => link.lastChild.innerText === 'My site'));

		// ----- a picture from a file: re-encoded as WebP; Revert brings the old one back; OK -----
		const [png] = await pictures(testPage, 1);
		const previewIsWebp = () => testPage.waitFor('the picture to load', () => frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.ImagePreview.style.backgroundImage.includes('image/webp'));
		await popup.locator('#ImageFile').setInputFiles(pngFile(png));
		await testPage.waitFor('the picture to load', () => {
			const popupWindow = frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow;
			return popupWindow.ImagePreview.style.backgroundImage.includes('image/webp') && !popupWindow.BtnApply.disabled;
		});
		await popup.locator('#ImageReset').click();
		const revertedPicture = await inPopup(testPage, () => ImagePreview.style.backgroundImage.slice(0, 16));
		testPage.check('a chosen file is shown as WebP; Revert brings back the tile\'s picture', revertedPicture === 'url("data:image/', revertedPicture);
		await popup.locator('#ImageFile').setInputFiles(pngFile(png));
		await previewIsWebp();
		await popup.locator('#ImageLocked').check({ force: true });
		await popup.locator('#BtnOk').click();
		await popupClosed(testPage);
		await testPage.idle();
		const savedPicture = { node: await nodeById(testPage, 'b1'), stored: await testPage.inHost(() => mockState.storage.img_b1.slice(0, 15)) };
		testPage.check('OK saves the new picture (WebP), keeps it locked, and closes', savedPicture.node.imageLocked && savedPicture.node.image === '1' && savedPicture.stored === 'data:image/webp', savedPicture);

		// ----- the address: required; a new one is fetched (the locked title and picture stay) -----
		popup = await openProperties(testPage, 'b1');
		await popup.locator('#Url').fill('  ');
		await popup.locator('#BtnOk').click();
		const emptyAddress = await inPopup(testPage, () => ({ invalid: Url.classList.contains('is-invalid'), focused: document.activeElement.id }));
		testPage.check('an empty address is refused and the popup stays open', emptyAddress.invalid && emptyAddress.focused === 'Url' && (await popupOpen(testPage)), emptyAddress);
		await popup.locator('#Url').fill('https://elsewhere.example/');
		await popup.locator('#Url').press('Enter');
		await popupClosed(testPage);
		await testPage.waitFor('the new address', () => dialFolderBookmarks()[0].url === 'https://elsewhere.example/');
		await testPage.idle();
		const newAddress = await nodeById(testPage, 'b1');
		testPage.check('Enter saves the new address; the locked title and picture stay', newAddress.url === 'https://elsewhere.example/' && newAddress.title === 'My site' && newAddress.image === '1', newAddress);

		// ----- a picture dropped on the preview, or pasted; then Cancel and Escape change nothing -----
		popup = await openProperties(testPage, 'b2');
		// Drops or pastes the PNG in the popup (after Revert); for a drop, whether the zone was highlighted while dragging over it
		const giveImage = how => inPopup(testPage, ([pngDataUrl, kind]) => {
			const bytes = Uint8Array.from(atob(pngDataUrl.split(',')[1]), character => character.charCodeAt(0));
			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(new File([bytes], 'p.png', { type: 'image/png' }));
			ImageReset.click();
			if (kind === 'paste') { document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true })); return true; }
			for (const type of ['dragenter', 'dragover']) ImageZone.dispatchEvent(new DragEvent(type, { dataTransfer, bubbles: true, cancelable: true }));
			const highlighted = ImageZone.classList.contains('is-dragover');
			ImageZone.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }));
			return highlighted && !ImageZone.classList.contains('is-dragover');
		}, [png, how]);
		const highlightedWhileDragging = await giveImage('drop');
		await previewIsWebp();
		testPage.check('an image file dropped on the preview is used (highlighted while dragging)', highlightedWhileDragging);
		await giveImage('paste');
		await previewIsWebp();
		testPage.check('an image pasted with Ctrl+V is used', true);
		await popup.locator('#Title').fill('Not saved');
		await popup.locator('#BtnCancel').click();
		await popupClosed(testPage);
		popup = await openProperties(testPage, 'b2');
		await popup.locator('#Title').fill('Not saved either');
		await popup.locator('#Title').press('Escape');
		await popupClosed(testPage);
		await testPage.idle();
		const unchanged = await nodeById(testPage, 'b2');
		testPage.check('Cancel and Escape close without saving', unchanged.title === 'site2.example', unchanged);

		// ----- where the picture comes from: Site icon (the site's icons and a letter tile), then Page (a capture once saved), File -----
		sitePage(testPage, 'icon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#cc3366"/></svg>');
		const iconSite = sitePage(testPage, 'icon-site.html', '<!doctype html><html><head><title>Icon site</title><link rel="icon" href="icon.svg"></head><body></body></html>');
		await testPage.inHost(address => { backgroundPage().app.GridNodes.getNodeById('b5').url = address; }, iconSite);
		popup = await openProperties(testPage, 'b5');
		const pressedSources = () => inPopup(testPage, () => [...document.querySelectorAll('.qd-segment')].map(option => option.getAttribute('aria-pressed') === 'true'));
		const sourceForm = { pressed: await pressedSources(), ...await inPopup(testPage, () => ({ chooseHidden: ImageChooseRow.hidden, choicesHidden: IconList.hidden })) };
		testPage.check('a screenshot tile: Page pressed; File is a source, so no separate Choose button', testPage.same(sourceForm.pressed, [true, false, false, false])
			&& sourceForm.chooseHidden && sourceForm.choicesHidden, sourceForm);
		await popup.locator('#SourceSiteIconOption').click();
		await testPage.waitFor('the site\'s icons', () => frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.document.querySelectorAll('.qd-icon-choice').length === 2);
		const iconChoices = { pressed: await pressedSources(), ...await inPopup(testPage, () => {
			const buttons = [...IconList.querySelectorAll('.qd-icon-choice')];
			return { labels: buttons.map(button => button.textContent), chosen: buttons.map(button => button.getAttribute('aria-pressed') === 'true'), hint: SourceHint.textContent,
				shown: ImagePreview.style.backgroundImage === buttons[0].firstChild.style.backgroundImage, apply: BtnApply.disabled };
		}) };
		testPage.check('Site icon: the site\'s icon and a letter tile to choose from; the best is chosen and shown at once', testPage.same(iconChoices.pressed, [false, true, false, false])
			&& testPage.same(iconChoices.labels, ['SVG', 'Letter']) && testPage.same(iconChoices.chosen, [true, false]) && iconChoices.hint === '' && iconChoices.shown && !iconChoices.apply, iconChoices);
		await popup.locator('.qd-icon-choice').nth(1).click();
		await popup.locator('#BtnOk').click();
		await popupClosed(testPage);
		await testPage.idle();
		const letterTile = await nodeById(testPage, 'b5');
		testPage.check('OK saves the letter tile and where it comes from', letterTile.imageSource === ImageSource.letter && letterTile.image === '1', letterTile);
		await testPage.inHost(() => {
			const page = backgroundPage();
			page.qdCaptured = [];
			page.app.GridNodes.capturePage = node => { page.qdCaptured.push(node.id); return Promise.resolve(null); };
		});
		popup = await openProperties(testPage, 'b5');
		const reopened = await pressedSources();
		await popup.locator('#SourcePageOption').click();
		const pageChosen = { pressed: await pressedSources(), hint: await inPopup(testPage, () => SourceHint.textContent) };
		await popup.locator('#BtnOk').click();
		await popupClosed(testPage);
		const capturedIds = await testPage.waitFor('the capture', () => backgroundPage().qdCaptured.length && backgroundPage().qdCaptured);
		const screenshotTile = await nodeById(testPage, 'b5');
		testPage.check('a letter tile shows Site icon pressed; Page says a screenshot comes once saved, and OK asks for it', testPage.same(reopened, [false, true, false, false])
			&& testPage.same(pageChosen.pressed, [true, false, false, false]) && /screenshot/.test(pageChosen.hint) && testPage.same(capturedIds, ['b5'])
			&& screenshotTile.imageSource === undefined, [reopened, pageChosen, capturedIds, screenshotTile]);
		popup = await openProperties(testPage, 'b6');
		const [fileChooser] = await Promise.all([testPage.page.waitForEvent('filechooser'), popup.locator('#SourceFileOption').click()]);
		const sourcesWhileChoosing = await pressedSources();
		await fileChooser.setFiles(pngFile(png));
		await testPage.waitFor('the chosen picture', () => frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.SourceFileOption.getAttribute('aria-pressed') === 'true');
		const fileChosen = await pressedSources();
		await popup.locator('#BtnOk').click();
		await popupClosed(testPage);
		await testPage.idle();
		const fileTile = await nodeById(testPage, 'b6');
		testPage.check('File opens the file chooser; the source is File once a picture is chosen, and saved with it', testPage.same(sourcesWhileChoosing, [true, false, false, false])
			&& testPage.same(fileChosen, [false, false, false, true]) && fileTile.imageSource === ImageSource.file, [sourcesWhileChoosing, fileChosen, fileTile]);

		// ----- Icon: a set is downloaded only when asked for; search, choose, colours; the retro set; a refused download; Remove -----
		const restoreIconSets = await useTestIconSets(testPage);
		const storedSets = () => testPage.inHost(() => Object.keys(mockState.storage).filter(key => key.startsWith('iconSet')).sort());
		const pickerState = () => inPopup(testPage, () => ({ about: IconSetAbout.textContent, download: IconSetDownload.hidden ? null : IconSetDownload.textContent, remove: !IconSetRemove.hidden,
			gridShown: !IconGrid.hidden, search: !IconSearch.disabled, cells: [...IconGrid.querySelectorAll('.qd-icon-cell')].map(cell => cell.title), hint: SourceHint.textContent }));
		popup = await openProperties(testPage, 'b6');
		await popup.locator('#SourceIconOption').click();
		await testPage.waitFor('the sets', () => frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.IconSetAbout.textContent);
		const notDownloaded = { ...await pickerState(), stored: await storedSets() };
		testPage.check('Icon: a set not downloaded shows where it comes from and Download; nothing is downloaded yet', notDownloaded.about.startsWith('Test outline 1 · 2 icons')
			&& notDownloaded.about.endsWith('MIT license') && notDownloaded.download === 'Download' && !notDownloaded.remove && !notDownloaded.gridShown && !notDownloaded.search
			&& /isn’t downloaded/.test(notDownloaded.hint) && notDownloaded.stored.length === 0, notDownloaded);
		await popup.locator('#IconSetDownload').click();
		await testPage.waitFor('the icons', () => frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.IconGrid.querySelectorAll('.qd-icon-cell').length === 2);
		const downloaded = { ...await pickerState(), stored: await storedSets() };
		testPage.check('Download keeps the set and shows its icons; Remove is offered', downloaded.download === null && downloaded.remove && downloaded.search
			&& testPage.same(downloaded.cells, ['home', 'star']) && /^Choose an icon/.test(downloaded.hint)
			&& testPage.same(downloaded.stored, ['iconSetIcons.outline', 'iconSetInfo.outline']), downloaded);
		await popup.locator('#IconSearch').fill('favourite');
		await testPage.waitFor('the search', () => frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.IconGrid.querySelectorAll('.qd-icon-cell').length === 1);
		await popup.locator('.qd-icon-cell').first().click();
		await testPage.waitFor('the icon as the picture', () => frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.SourceIconOption.getAttribute('aria-pressed') === 'true');
		const outlineChosen = { pressed: await pressedSources(), ...await inPopup(testPage, () => ({ cells: [...IconGrid.querySelectorAll('.qd-icon-cell')].map(cell => [cell.title, cell.getAttribute('aria-pressed')]),
			picture: ImagePreview.style.backgroundImage.slice(0, 20), apply: BtnApply.disabled })) };
		testPage.check('the search finds an icon by its words; chosen, it is the picture (WebP) and Icon is pressed', testPage.same(outlineChosen.pressed, [false, false, true, false])
			&& testPage.same(outlineChosen.cells, [['star', 'true']]) && outlineChosen.picture === 'url("data:image/webp' && !outlineChosen.apply, outlineChosen);
		await popup.locator('#IconSearch').fill('');
		await popup.locator('#IconSet').selectOption('pixel');
		await testPage.waitFor('the pixel set', () => frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.IconSetAbout.textContent.startsWith('Test pixel 1'));
		await popup.locator('#IconSetDownload').click();
		await testPage.waitFor('the refusal', () => /couldn’t be downloaded/.test(frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.SourceHint.textContent));
		const refused = { ...await pickerState(), stored: await storedSets() };
		testPage.check('a file that doesn\'t match its fingerprint is refused and says so; Download can be tried again', /the file isn’t the expected one/.test(refused.hint)
			&& refused.download === 'Download' && !refused.gridShown && !refused.stored.some(key => key.endsWith('.pixel')), refused);
		await popup.locator('#IconSet').selectOption('retro');
		await testPage.waitFor('the retro set', () => frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.IconSetAbout.textContent.startsWith('Test retro 1'));
		await popup.locator('#IconSetDownload').click();
		await testPage.waitFor('the retro icons', () => frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.IconGrid.querySelectorAll('.qd-icon-cell').length === 2);
		const retroCells = await inPopup(testPage, () => ({ colorDisabled: IconColor.disabled, cells: [...IconGrid.querySelectorAll('.qd-icon-cell-img')].map(image => [image.style.backgroundImage.slice(0, 10), image.style.backgroundPosition]) }));
		testPage.check('the retro set: each icon is its part of the set\'s picture, the small one twice as large; no icon colour', retroCells.colorDisabled
			&& testPage.same(retroCells.cells, [['url("blob:', '0px 0px'], ['url("blob:', '-64px 0px']]), retroCells);
		await popup.locator('.qd-icon-cell').nth(1).click();
		await testPage.waitFor('the retro icon as the picture', () => frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.IconGrid.querySelector('[aria-pressed="true"]'));
		await popup.locator('#BtnOk').click();
		await popupClosed(testPage);
		await testPage.idle();
		const iconTile = await nodeById(testPage, 'b6');
		testPage.check('OK saves the icon and where it comes from', iconTile.imageSource === ImageSource.icon && iconTile.image === '1', iconTile);
		popup = await openProperties(testPage, 'b6');
		const iconReopened = await pressedSources();
		await popup.locator('#SourceIconOption').click();
		await testPage.waitFor('the retro set again', () => !frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.IconSetRemove.hidden);
		await popup.locator('#IconSetRemove').click();
		await testPage.waitFor('the set removed', () => !frameWindow('dial').document.querySelector('.qd-frame iframe').contentWindow.IconSetDownload.hidden);
		const removed = { ...await pickerState(), stored: await storedSets() };
		await popup.locator('#BtnCancel').click();
		await popupClosed(testPage);
		const keptIcon = await nodeById(testPage, 'b6');
		testPage.check('an icon tile shows Icon pressed; Remove forgets the set, and the tile keeps its icon', testPage.same(iconReopened, [false, false, true, false])
			&& removed.download === 'Download' && !removed.gridShown && testPage.same(removed.stored, ['iconSetIcons.outline', 'iconSetInfo.outline'])
			&& keptIcon.imageSource === ImageSource.icon && keptIcon.image === '1', [iconReopened, removed, keptIcon]);
		restoreIconSets();

		// ----- a folder: no address or locks; its picture can go back to the folder icon -----
		await testPage.inHost(() => { const app = backgroundPage().app; return app.Images.setNodeImage(app.GridNodes.getNodeById('f1'), document.createElement('canvas').toDataURL('image/webp')); });
		popup = await openProperties(testPage, 'f1');
		const folderForm = await inPopup(testPage, () => ({ header: HeaderTitle.textContent, urlHidden: UrlRow.hidden, locksHidden: [TitleLockBox.hidden, ImageLockRow.hidden],
			useDefault: [ImageDefault.hidden, ImageDefault.disabled],
			sources: [SourceRow, SourcePageOption, SourceSiteIconOption, SourceIconOption, SourceFileOption, ImageChooseRow].map(element => element.hidden) }));
		testPage.check('a folder\'s Properties: no address, no locks, Icon and File as picture sources, "Use default" available', folderForm.header === 'Folder properties' && folderForm.urlHidden
			&& testPage.same(folderForm.locksHidden, [true, true]) && testPage.same(folderForm.useDefault, [false, false])
			&& testPage.same(folderForm.sources, [false, true, true, false, false, true]), folderForm);
		await popup.locator('#ImageDefault').click();
		const defaultPicture = await inPopup(testPage, () => ({ picture: ImagePreview.style.backgroundImage, disabled: ImageDefault.disabled }));
		await popup.locator('#Title').fill('Work');
		await popup.locator('#BtnOk').click();
		await popupClosed(testPage);
		await testPage.idle();
		const folder = await nodeById(testPage, 'f1');
		const folderBookmarkTitle = await testPage.inHost(() => dialFolderBookmarks().find(bookmark => bookmark.id === 'f1').title);
		testPage.check('"Use default" shows the folder icon; OK renames the folder and drops its picture', defaultPicture.picture.includes('folder.svg') && defaultPicture.disabled
			&& folder.title === 'Work' && !folder.image && folderBookmarkTitle === 'Work', [defaultPicture, folder, folderBookmarkTitle]);

		// ----- the tile deleted while its window is open, or before it opens: only Close is left -----
		const deletedState = () => inPopup(testPage, () => ({ sub: HeaderSubtitle.textContent, formHidden: document.querySelector('main').hidden,
			buttonsHidden: [BtnApply.hidden, BtnOk.hidden], close: BtnCancel.textContent, status: Status.textContent, focused: document.activeElement.id }));
		const isDeletedState = state => state.sub === 'This tile no longer exists' && state.formHidden && testPage.same(state.buttonsHidden, [true, true])
			&& state.close === 'Close' && state.status === 'The tile was deleted' && state.focused === 'BtnCancel';
		const popupSaysDeleted = what => testPage.waitFor(what, () => { const popupWindow = (frameWindow('dial').document.querySelector('.qd-frame iframe') || {}).contentWindow; return popupWindow && popupWindow.app && popupWindow.app.deleted; });
		popup = await openProperties(testPage, 'b3');
		await popup.locator('#Title').fill('Too late');
		await testPage.inHost(() => backgroundPage().browser.bookmarks.removeTree('b3')); // as in the Library
		await popupSaysDeleted('the window to see the tile is gone');
		const deletedWhileOpen = await deletedState();
		testPage.check('a tile deleted while its Properties are open: the window says so, nothing to save', isDeletedState(deletedWhileOpen), deletedWhileOpen);
		await popup.locator('#BtnCancel').click();
		await popupClosed(testPage);
		await testPage.inDial(() => app.editProperties({ gridNode: { id: 'b3' } }));
		await popupSaysDeleted('the window to open');
		const alreadyGone = await deletedState();
		testPage.check('Properties of a tile already gone open in the same state', isDeletedState(alreadyGone), alreadyGone);
		await popup.locator('#BtnCancel').press('Escape');
		await popupClosed(testPage);
		popup = await openProperties(testPage, 'b4');
		await popup.locator('#Title').fill('Too late');
		await testPage.inHost(() => { const app = backgroundPage().app; app.node.children = app.node.children.filter(tile => !tile || tile.id !== 'b4'); }); // gone, and the window not told
		await popup.locator('#BtnOk').click();
		await popupSaysDeleted('the answer');
		const goneOnOk = { state: await deletedState(), open: await popupOpen(testPage) };
		testPage.check('OK on a tile that is gone: the window stays open and says so (no error in the background page)', isDeletedState(goneOnOk.state) && goneOnOk.open, goneOnOk);
		await popup.locator('#BtnCancel').click();
		await popupClosed(testPage);
	}
};
