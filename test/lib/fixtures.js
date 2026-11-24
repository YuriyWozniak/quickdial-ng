// Test data and stand-ins shared by the integration suites. Each function takes the suite's TestPage (testPage).
//
// The standard bookmarks (seedBookmarks, freshProfile), which most suites start from:
//   menu________ (Bookmarks Menu)
//     qd     "Quick Dial"   the dial's folder: b1-b6 "Site 1"-"Site 6" (https://site1.example/...),
//                           then f1 "Folder" holding b7 "Site 7"
//     other  "Other"        unrelated bookmarks: changes there must be ignored
// So the dial starts with 7 tiles: b1-b6, then the folder f1.
// Sites other than the test server answer with a stub page titled with their host ("site1.example");
// sitePage() serves a local page where a page's content matters.
'use strict';
const fs = require('fs'), path = require('path');

// Bookmarks: a "Quick Dial" folder with six bookmarks (b1-b6) and a folder (f1, holding b7),
// and an unrelated folder ("Other").
function seedBookmarks(testPage) {
	return testPage.inHost(() => {
		const tree = mockState.bookmarkTree, menu = tree.children[0];
		tree.type = 'folder'; menu.type = 'folder'; tree.children[1].type = 'folder';
		menu.children.push({ id: 'qd', type: 'folder', title: 'Quick Dial', parentId: menu.id, children: [
			...[1, 2, 3, 4, 5, 6].map(siteNumber => ({ id: 'b' + siteNumber, type: 'bookmark', title: 'Site ' + siteNumber, url: 'https://site' + siteNumber + '.example/', parentId: 'qd' })),
			{ id: 'f1', type: 'folder', title: 'Folder', parentId: 'qd', children: [{ id: 'b7', type: 'bookmark', title: 'Site 7', url: 'https://site7.example/', parentId: 'f1' }] }] });
		menu.children.push({ id: 'other', type: 'folder', title: 'Other', parentId: menu.id, children: [] });
	});
}

// A profile set up with the bookmarks above, the background page started and its first sync done.
async function freshProfile(testPage) {
	await seedBookmarks(testPage);
	await testPage.loadBg();
}

// Turns the stored data into what the original Quick Dial (version 4) kept: every bookmark tile gets a
// busy 600x450 PNG screenshot inline (half of them as url(...)), the bookmark in the folder too.
// Returns the size of that data. The background page has to be restarted to migrate it.
function makeVersion4(testPage) {
	return testPage.inHost(() => {
		const SCREENSHOT_WIDTH = 600, SCREENSHOT_HEIGHT = 450, BOOKMARK_TYPE = 2;
		// A screenshot full of coloured boxes and text, so it compresses as badly as a real one; seed varies it
		const screenshot = seed => {
			const canvas = document.createElement('canvas');
			canvas.width = SCREENSHOT_WIDTH; canvas.height = SCREENSHOT_HEIGHT;
			const context = canvas.getContext('2d');
			for (let i = 0; i < 400; i++) {
				context.fillStyle = `hsl(${(i * 37 + seed * 91) % 360},70%,${30 + i % 40}%)`;
				context.fillRect((i * 53) % SCREENSHOT_WIDTH, (i * 29 + seed) % SCREENSHOT_HEIGHT, 40 + i % 60, 20 + i % 30);
			}
			context.fillStyle = '#000'; context.font = '28px sans-serif';
			for (let line = 0; line < 12; line++) context.fillText('Sample page text ' + seed + ' line ' + line, 20, 40 + line * 34);
			return canvas.toDataURL('image/png');
		};
		const version4 = { version: 4, settings: mockState.storage.settings, node: JSON.parse(JSON.stringify(mockState.storage.node)) };
		version4.node.children.forEach((tile, index) => {
			if (tile.type === BOOKMARK_TYPE) { tile.image = index % 2 ? 'url(' + screenshot(index) + ')' : screenshot(index); tile.imageLocked = true; }
		});
		version4.node.children[6].children[0].image = screenshot(77);
		mockState.storage = JSON.parse(JSON.stringify(version4));
		mockState.writes = []; mockState.removes = [];
		return JSON.stringify(version4).length;
	});
}

// count plain PNG pictures (320x240, one colour each, numbered), as data URLs
function pictures(testPage, count) {
	return testPage.inHost(pictureCount => Array.from({ length: pictureCount }, (unused, index) => {
		const canvas = document.createElement('canvas');
		canvas.width = 320; canvas.height = 240;
		const context = canvas.getContext('2d');
		context.fillStyle = `hsl(${(index + 1) * 100},60%,50%)`; context.fillRect(0, 0, 320, 240);
		context.fillStyle = '#fff'; context.fillText('tile ' + (index + 1), 20, 40);
		return canvas.toDataURL('image/png');
	}), count);
}

// Changes the background page's settings, e.g. changeSettings(testPage, { grid: { rows: 2 } }), and tells
// the open pages, as when Settings applies a change.
function changeSettings(testPage, patch) {
	return testPage.inHost(settingsPatch => {
		const app = backgroundPage().app, settings = JSON.parse(JSON.stringify(app.settings));
		const merge = (target, changes) => {
			for (const key in changes) {
				const value = changes[key];
				if (value && typeof value == 'object' && !Array.isArray(value)) merge(target[key] = target[key] || {}, value);
				else target[key] = value;
			}
		};
		merge(settings, settingsPatch);
		return app.Settings.update(settings).then(() => {
			app.Messages.broadcast(app.Messages.Commands.settingsChanged);
			app.Messages.broadcast(app.Messages.Commands.gridNodesLoaded);
		});
	}, patch);
}

// Replaces the background page's tabs API with one that records the calls in backgroundPage().qdTabs.
// backgroundPage().qdOpen is what tabs.query answers (the open tabs).
function spyTabs(testPage) {
	return testPage.inHost(() => {
		const page = backgroundPage(), CREATED_TAB_ID = 5;
		page.qdTabs = []; page.qdOpen = [];
		page.browser.tabs.create = properties => { page.qdTabs.push(['create', properties]); return Promise.resolve({ id: CREATED_TAB_ID }); };
		page.browser.tabs.update = (tabId, properties) => { page.qdTabs.push(['update', tabId, properties]); return Promise.resolve({ id: tabId }); };
		page.browser.tabs.query = () => Promise.resolve(page.qdOpen);
		page.browser.tabs.sendMessage = (tabId, message) => { page.qdTabs.push(['message', tabId, message.cmd, message.tab]); return Promise.resolve(); };
	});
}

// Chromium has no drawWindow (Firefox only): a stand-in records what it was asked to draw in backgroundPage().qdDrawn
function stubDrawWindow(testPage) {
	return testPage.inHost(() => {
		const page = backgroundPage();
		page.CanvasRenderingContext2D.prototype.drawWindow = function (drawnWindow) {
			page.qdDrawn = { title: drawnWindow.document.title, sandbox: drawnWindow.frameElement.getAttribute('sandbox'), base: drawnWindow.document.querySelector('base').href };
			this.fillStyle = '#4a7'; this.fillRect(0, 0, 50, 50);
		};
	});
}

// A small web page served by the test server; returns its address
function sitePage(testPage, fileName, html) {
	fs.mkdirSync(path.join(testPage.dir, 'site'), { recursive: true });
	fs.writeFileSync(path.join(testPage.dir, 'site', fileName), html);
	return testPage.base + 'site/' + fileName;
}

// The names of the built-in themes, in the order Settings › Themes lists them (src/js/themes.js)
const BUILTIN_THEMES = ['Classic', 'Anori', 'Plum', 'Desktop', 'Dusk', 'Retro PC', 'Retro Mono'];

// The text of a key in a language's messages.json (lang: 'en', 'uk', 'he_IL'...), as { key: text }
const LOCALES = path.join(__dirname, '..', '..', 'src', '_locales');
const messagesOf = lang => Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(LOCALES, lang, 'messages.json'), 'utf8'))).map(([key, entry]) => [key, entry.message]));
// The English text of a key, as the simulated browser.i18n gives it (mock.js)
const ENGLISH_MESSAGES = messagesOf('en');
const englishText = key => ENGLISH_MESSAGES[key];

module.exports = { BUILTIN_THEMES, seedBookmarks, freshProfile, makeVersion4, pictures, changeSettings, spyTabs, stubDrawWindow, sitePage, messagesOf, englishText };
