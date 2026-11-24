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
//   f1: a folder's form; renamed "Work", its picture back to the folder icon
//   b3: its bookmark deleted while the window is open, then opened again while gone
//   b4: taken out of the tree without the window being told, then OK
// Related: the updateNode message the popup sends is tested on its own in messages.js.
'use strict';
const { freshProfile, stubDrawWindow, pictures } = require('../lib/fixtures');

// How a picture fills its tile (QDCommon.ImageMode), as values of the fit list (the ImageMode field)
const ImageFit = { inherit: '-1', contain: '2' };

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

		// ----- a folder: no address or locks; its picture can go back to the folder icon -----
		await testPage.inHost(() => { const app = backgroundPage().app; return app.Images.setNodeImage(app.GridNodes.getNodeById('f1'), document.createElement('canvas').toDataURL('image/webp')); });
		popup = await openProperties(testPage, 'f1');
		const folderForm = await inPopup(testPage, () => ({ header: HeaderTitle.textContent, urlHidden: UrlRow.hidden, locksHidden: [TitleLockBox.hidden, ImageLockRow.hidden],
			useDefault: [ImageDefault.hidden, ImageDefault.disabled] }));
		testPage.check('a folder\'s Properties: no address, no locks, "Use default" available', folderForm.header === 'Folder properties' && folderForm.urlHidden
			&& testPage.same(folderForm.locksHidden, [true, true]) && testPage.same(folderForm.useDefault, [false, false]), folderForm);
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
