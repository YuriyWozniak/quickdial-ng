// Test data and stand-ins shared by the integration suites. Each function takes the suite's TestPage (t).
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

// Bookmarks: a "Quick Dial" folder with six bookmarks (b1-b6) and a folder (f1, holding b7),
// and an unrelated folder ("Other").
function seedBookmarks(t) {
	return t.J(() => {
		const menu = S.bm.children[0];
		S.bm.type = 'folder'; menu.type = 'folder'; S.bm.children[1].type = 'folder';
		menu.children.push({ id: 'qd', type: 'folder', title: 'Quick Dial', parentId: menu.id, children: [
			...[1, 2, 3, 4, 5, 6].map(i => ({ id: 'b' + i, type: 'bookmark', title: 'Site ' + i, url: 'https://site' + i + '.example/', parentId: 'qd' })),
			{ id: 'f1', type: 'folder', title: 'Folder', parentId: 'qd', children: [{ id: 'b7', type: 'bookmark', title: 'Site 7', url: 'https://site7.example/', parentId: 'f1' }] }] });
		menu.children.push({ id: 'other', type: 'folder', title: 'Other', parentId: menu.id, children: [] });
	});
}

// A profile set up with the bookmarks above, the background page started and its first sync done.
async function freshProfile(t) {
	await seedBookmarks(t);
	await t.loadBg();
}

// Turns the stored data into what the original Quick Dial (version 4) kept: every bookmark tile gets a
// busy 600x450 PNG screenshot inline (half of them as url(...)), the bookmark in the folder too.
// Returns the size of that data. The background page has to be restarted to migrate it.
function makeVersion4(t) {
	return t.J(() => {
		const mk = seed => {
			const c = document.createElement('canvas'); c.width = 600; c.height = 450; const x = c.getContext('2d');
			for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${(i * 37 + seed * 91) % 360},70%,${30 + i % 40}%)`; x.fillRect((i * 53) % 600, (i * 29 + seed) % 450, 40 + i % 60, 20 + i % 30); }
			x.fillStyle = '#000'; x.font = '28px sans-serif';
			for (let r = 0; r < 12; r++) x.fillText('Sample page text ' + seed + ' line ' + r, 20, 40 + r * 34);
			return c.toDataURL('image/png');
		};
		const v4 = { version: 4, settings: S.storage.settings, node: JSON.parse(JSON.stringify(S.storage.node)) };
		v4.node.children.forEach((n, i) => { if (n.type === 2) { n.image = i % 2 ? 'url(' + mk(i) + ')' : mk(i); n.imageLocked = true; } });
		v4.node.children[6].children[0].image = mk(77);
		S.storage = JSON.parse(JSON.stringify(v4));
		S.writes = []; S.removes = [];
		return JSON.stringify(v4).length;
	});
}

// n plain PNG pictures (320x240, one colour each, numbered), as data URLs
function pictures(t, n) {
	return t.J(n => Array.from({ length: n }, (_, i) => {
		const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d');
		x.fillStyle = `hsl(${(i + 1) * 100},60%,50%)`; x.fillRect(0, 0, 320, 240); x.fillStyle = '#fff'; x.fillText('tile ' + (i + 1), 20, 40);
		return c.toDataURL('image/png');
	}), n);
}

// Changes the background page's settings, e.g. changeSettings(t, { grid: { rows: 2 } }), and tells
// the open pages, as when Settings applies a change.
function changeSettings(t, patch) {
	return t.J(patch => {
		const a = bg().app, s = JSON.parse(JSON.stringify(a.settings));
		const merge = (o, p) => { for (const k in p) if (p[k] && typeof p[k] == 'object' && !Array.isArray(p[k])) merge(o[k] = o[k] || {}, p[k]); else o[k] = p[k]; };
		merge(s, patch);
		return a.Settings.update(s).then(() => {
			a.Messages.broadcast(a.Messages.Commands.settingsChanged);
			a.Messages.broadcast(a.Messages.Commands.gridNodesLoaded);
		});
	}, patch);
}

// Replaces the background page's tabs API with one that records the calls in bg().qdTabs.
// bg().qdOpen is what tabs.query answers (the open tabs).
function spyTabs(t) {
	return t.J(() => {
		const w = bg(); w.qdTabs = []; w.qdOpen = [];
		w.browser.tabs.create = o => { w.qdTabs.push(['create', o]); return Promise.resolve({ id: 5 }); };
		w.browser.tabs.update = (id, o) => { w.qdTabs.push(['update', id, o]); return Promise.resolve({ id }); };
		w.browser.tabs.query = () => Promise.resolve(w.qdOpen);
		w.browser.tabs.sendMessage = (id, m) => { w.qdTabs.push(['message', id, m.cmd, m.tab]); return Promise.resolve(); };
	});
}

// Chromium has no drawWindow (Firefox only): a stand-in records what it was asked to draw in bg().qdDrawn
function stubDrawWindow(t) {
	return t.J(() => {
		const w = bg();
		w.CanvasRenderingContext2D.prototype.drawWindow = function(win) {
			w.qdDrawn = { title: win.document.title, sandbox: win.frameElement.getAttribute('sandbox'), base: win.document.querySelector('base').href };
			this.fillStyle = '#4a7'; this.fillRect(0, 0, 50, 50);
		};
	});
}

// A small web page served by the test server; returns its address
function sitePage(t, name, html) {
	const fs = require('fs'), path = require('path');
	fs.mkdirSync(path.join(t.dir, 'site'), { recursive: true });
	fs.writeFileSync(path.join(t.dir, 'site', name), html);
	return t.base + 'site/' + name;
}

module.exports = { seedBookmarks, freshProfile, makeVersion4, pictures, changeSettings, spyTabs, stubDrawWindow, sitePage };
