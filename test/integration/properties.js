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

// Opens Properties for a tile, as its context menu item does, and waits until the form is filled in.
// Returns a locator for the popup's frame.
async function open(t, id) {
	await t.inDial(id => app.editProperties({ gridNode: { id } }), id);
	await t.waitFor('Properties to load', () => { const f = win('dial').document.querySelector('.qd-frame iframe'); return f && f.contentWindow.app && f.contentWindow.app.node && f.contentWindow.document.getElementById('Title').value; });
	return t.dial().frameLocator('.qd-frame iframe');
}
// Runs fn(arg) in the popup; waits until it has closed; a node of the background page by id
const inPopup = async (t, fn, arg) => (await t.frame()).childFrames().find(f => f.url().includes('properties.html')).evaluate(fn, arg);
const closed = t => t.waitFor('the popup to close', () => !win('dial').document.querySelector('.qd-overlay'));
const node = (t, id) => t.J(id => bg().app.GridNodes.getNodeById(id), id);

module.exports = {
	title: 'Properties: title, address, locks, picture (file, fit, revert, default), OK / Apply / Cancel',
	async run(t) {
		await freshProfile(t);
		await stubDrawWindow(t);
		await t.loadDial();
		await t.waitFor('the tiles to fetch their sites', () => bg().app.node.children.filter(c => c.image === '1').length === 6);

		// ----- a bookmark: the form, Apply -----
		let p = await open(t, 'b1');
		let st = await inPopup(t, () => ({ header: HeaderTitle.textContent, sub: HeaderSubtitle.textContent, title: Title.value, url: Url.value, urlShown: !UrlRow.hidden,
			locks: [TitleLocked.checked, ImageLocked.checked], mode: ImageMode.value, picture: ImagePreview.style.backgroundImage.slice(0, 16), apply: BtnApply.disabled, focused: document.activeElement.id }));
		t.check('a bookmark\'s Properties: header, address, its picture, nothing to apply', st.header === 'Bookmark properties' && st.sub === 'site1.example' && st.title === 'site1.example' && st.url === 'https://site1.example/' &&
			st.urlShown && t.same(st.locks, [false, false]) && st.mode === '-1' && st.picture === 'url("data:image/' && st.apply && st.focused === 'Title', st);
		await p.locator('#Title').fill('My site');
		await p.locator('#TitleLocked').check({ force: true });
		await p.locator('#ImageMode').selectOption('2');
		st = await inPopup(t, () => ({ apply: BtnApply.disabled, status: Status.textContent, size: ImagePreview.style.backgroundSize }));
		t.check('edits enable Apply and preview the fit', !st.apply && st.status === 'Unsaved changes' && st.size === 'contain', st);
		await p.locator('#BtnApply').click();
		await t.idle();
		st = { node: await node(t, 'b1'), bookmark: await t.J(() => S.bm.children[0].children[0].children[0].title), open: await t.J(() => !!win('dial').document.querySelector('.qd-overlay')) };
		t.check('Apply saves title, lock and fit, renames the bookmark, and stays open', st.node.title === 'My site' && st.node.titleLocked && st.node.imageMode === 2 && st.bookmark === 'My site' && st.open, st);
		await t.waitFor('the dial to follow', () => [...win('dial').document.querySelectorAll('table.qd-grid a')].some(a => a.lastChild.innerText === 'My site'));

		// ----- a picture from a file: re-encoded as WebP; Revert brings the old one back; OK -----
		const [png] = await pictures(t, 1);
		await p.locator('#ImageFile').setInputFiles({ name: 'pic.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
		await t.waitFor('the picture to load', () => { const w = win('dial').document.querySelector('.qd-frame iframe').contentWindow; return w.ImagePreview.style.backgroundImage.includes('image/webp') && !w.BtnApply.disabled; });
		await p.locator('#ImageReset').click();
		st = await inPopup(t, () => ImagePreview.style.backgroundImage.slice(0, 16));
		t.check('a chosen file is shown as WebP; Revert brings back the tile\'s picture', st === 'url("data:image/', st);
		await p.locator('#ImageFile').setInputFiles({ name: 'pic.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
		await t.waitFor('the picture to load', () => win('dial').document.querySelector('.qd-frame iframe').contentWindow.ImagePreview.style.backgroundImage.includes('image/webp'));
		await p.locator('#ImageLocked').check({ force: true });
		await p.locator('#BtnOk').click();
		await closed(t);
		await t.idle();
		st = { node: await node(t, 'b1'), stored: await t.J(() => S.storage.img_b1.slice(0, 15)) };
		t.check('OK saves the new picture (WebP), keeps it locked, and closes', st.node.imageLocked && st.node.image === '1' && st.stored === 'data:image/webp', st);

		// ----- the address: required; a new one is fetched (the locked title and picture stay) -----
		p = await open(t, 'b1');
		await p.locator('#Url').fill('  ');
		await p.locator('#BtnOk').click();
		st = await inPopup(t, () => ({ invalid: Url.classList.contains('is-invalid'), focused: document.activeElement.id }));
		t.check('an empty address is refused and the popup stays open', st.invalid && st.focused === 'Url' && (await t.J(() => !!win('dial').document.querySelector('.qd-overlay'))), st);
		await p.locator('#Url').fill('https://elsewhere.example/');
		await p.locator('#Url').press('Enter');
		await closed(t);
		await t.waitFor('the new address', () => S.bm.children[0].children[0].children[0].url === 'https://elsewhere.example/');
		await t.idle();
		st = await node(t, 'b1');
		t.check('Enter saves the new address; the locked title and picture stay', st.url === 'https://elsewhere.example/' && st.title === 'My site' && st.image === '1', st);

		// ----- a picture dropped on the preview, or pasted; then Cancel and Escape change nothing -----
		p = await open(t, 'b2');
		const imageEvent = (t, kind) => inPopup(t, ([png, kind]) => {
			const bytes = Uint8Array.from(atob(png.split(',')[1]), c => c.charCodeAt(0));
			const dt = new DataTransfer();
			dt.items.add(new File([bytes], 'p.png', { type: 'image/png' }));
			ImageReset.click();
			if (kind === 'paste') { document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true; }
			for (const type of ['dragenter', 'dragover']) ImageZone.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
			const highlighted = ImageZone.classList.contains('is-dragover');
			ImageZone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
			return highlighted && !ImageZone.classList.contains('is-dragover');
		}, [png, kind]);
		const webp = () => t.waitFor('the picture', () => win('dial').document.querySelector('.qd-frame iframe').contentWindow.ImagePreview.style.backgroundImage.includes('image/webp'));
		st = await imageEvent(t, 'drop');
		await webp();
		t.check('an image file dropped on the preview is used (highlighted while dragging)', st);
		await imageEvent(t, 'paste');
		await webp();
		t.check('an image pasted with Ctrl+V is used', true);
		await p.locator('#Title').fill('Not saved');
		await p.locator('#BtnCancel').click();
		await closed(t);
		p = await open(t, 'b2');
		await p.locator('#Title').fill('Not saved either');
		await p.locator('#Title').press('Escape');
		await closed(t);
		await t.idle();
		t.check('Cancel and Escape close without saving', (await node(t, 'b2')).title === 'site2.example', await node(t, 'b2'));

		// ----- a folder: no address or locks; its picture can go back to the folder icon -----
		await t.J(() => { const a = bg().app; return a.Images.setNodeImage(a.GridNodes.getNodeById('f1'), document.createElement('canvas').toDataURL('image/webp')); });
		p = await open(t, 'f1');
		st = await inPopup(t, () => ({ header: HeaderTitle.textContent, url: UrlRow.hidden, locks: [TitleLockBox.hidden, ImageLockRow.hidden], useDefault: [ImageDefault.hidden, ImageDefault.disabled] }));
		t.check('a folder\'s Properties: no address, no locks, "Use default" available', st.header === 'Folder properties' && st.url && t.same(st.locks, [true, true]) && t.same(st.useDefault, [false, false]), st);
		await p.locator('#ImageDefault').click();
		st = await inPopup(t, () => ({ pic: ImagePreview.style.backgroundImage, disabled: ImageDefault.disabled }));
		await p.locator('#Title').fill('Work');
		await p.locator('#BtnOk').click();
		await closed(t);
		await t.idle();
		const folder = await node(t, 'f1');
		const bookmark = await t.J(() => S.bm.children[0].children[0].children.find(c => c.id === 'f1').title);
		t.check('"Use default" shows the folder icon; OK renames the folder and drops its picture', st.pic.includes('folder.svg') && st.disabled && folder.title === 'Work' && !folder.image && bookmark === 'Work', [st, folder, bookmark]);

		// ----- the tile deleted while its window is open, or before it opens: only Close is left -----
		const deletedState = () => inPopup(t, () => ({ sub: HeaderSubtitle.textContent, form: document.querySelector('main').hidden,
			buttons: [BtnApply.hidden, BtnOk.hidden], close: BtnCancel.textContent, status: Status.textContent, focused: document.activeElement.id }));
		const isDeletedState = st => st.sub === 'This tile no longer exists' && st.form && t.same(st.buttons, [true, true]) && st.close === 'Close' && st.status === 'The tile was deleted' && st.focused === 'BtnCancel';
		p = await open(t, 'b3');
		await p.locator('#Title').fill('Too late');
		await t.J(() => bg().browser.bookmarks.removeTree('b3')); // as in the Library
		await t.waitFor('the window to see the tile is gone', () => { const w = (win('dial').document.querySelector('.qd-frame iframe') || {}).contentWindow; return w && w.app && w.app.deleted; });
		st = await deletedState();
		t.check('a tile deleted while its Properties are open: the window says so, nothing to save', isDeletedState(st), st);
		await p.locator('#BtnCancel').click();
		await closed(t);
		await t.inDial(() => app.editProperties({ gridNode: { id: 'b3' } }));
		await t.waitFor('the window to open', () => { const w = (win('dial').document.querySelector('.qd-frame iframe') || {}).contentWindow; return w && w.app && w.app.deleted; });
		st = await deletedState();
		t.check('Properties of a tile already gone open in the same state', isDeletedState(st), st);
		await p.locator('#BtnCancel').press('Escape');
		await closed(t);
		p = await open(t, 'b4');
		await p.locator('#Title').fill('Too late');
		await t.J(() => { const a = bg().app; a.node.children = a.node.children.filter(c => !c || c.id !== 'b4'); }); // gone, and the window not told
		await p.locator('#BtnOk').click();
		await t.waitFor('the answer', () => { const w = (win('dial').document.querySelector('.qd-frame iframe') || {}).contentWindow; return w && w.app && w.app.deleted; });
		st = { state: await deletedState(), open: await t.J(() => !!win('dial').document.querySelector('.qd-overlay')) };
		t.check('OK on a tile that is gone: the window stays open and says so (no error in the background page)', isDeletedState(st.state) && st.open, st);
		await p.locator('#BtnCancel').click();
		await closed(t);
	}
};
