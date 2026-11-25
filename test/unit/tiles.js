// Shared by the unit tests of the tile tree (gridnodes.test.js) and of its pictures (tilepictures.test.js): a
// background page on a fake "Quick Dial" bookmarks folder, and how to read a folder's cells.
'use strict';
const { loadBackground, plain } = require('./load');

// The node types of the tile tree (QDCommon.NodeType)
const NodeType = { empty: 0, folder: 1, bookmark: 2 };
const EMPTY_CELL = { type: NodeType.empty };
// A background page with settings loaded and a "Quick Dial" folder holding the given bookmarks
async function setup(bookmarks = []) {
	const sandbox = loadBackground();
	await sandbox.app.Settings.init();
	sandbox.browser.bookmarks.find('menu________').children.push({ id: 'qd', type: 'folder', title: 'Quick Dial', children: bookmarks });
	return sandbox;
}
// Syncs the tile tree with the root folder, as the background page does on a bookmark event
const sync = sandbox => sandbox.app.GridNodes.sync(sandbox.app.node, sandbox.app.settings.grid.root);
// A folder's cells by bookmark id ('-': a gap)
const cellIds = folder => plain(folder.children.map(tile => tile.id || '-'));
// A bookmark of the fake tree: titled with its id in capitals, at https://<id>.example/ unless given an address
const bookmark = (id, url) => ({ id, type: 'bookmark', title: id.toUpperCase(), url: url || 'https://' + id + '.example/' });
// A bookmark folder of the fake tree
const bookmarkFolder = (id, title, children = []) => ({ id, type: 'folder', title, children });
// A WebP picture as a data URL (any bytes will do)
const WEBP_PICTURE = 'data:image/webp;base64,AAAA';

module.exports = { NodeType, EMPTY_CELL, setup, sync, cellIds, bookmark, bookmarkFolder, WEBP_PICTURE };
