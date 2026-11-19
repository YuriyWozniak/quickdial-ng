// Quick Dial NG — values shared by the background page and the extension pages.
// Loaded before the other scripts of each page (see manifest.json and the html files).
/* exported QDCommon */
// eslint-disable-next-line no-var -- a global shared by the page's other scripts
var QDCommon = Object.freeze({
	// Message commands between the background page (js/background/) and the pages.
	// 202 and 208 (the menu's Settings and Import items, sent to the dial) are unused since 0.5.0:
	// those items open the Settings tab.
	Commands: Object.freeze({
		getSettings: 0,
		setSettings: 1,
		getNode: 2,
		getNodeByID: 3,
		updateNode: 4,
		setNodeIndex: 5,
		createBookmark: 6,
		createFolder: 7,
		deleteNode: 8,
		refreshNode: 9,
		capturePage: 10,
		getImages: 11,
		exportData: 12,
		importData: 13,
		getThemes: 14,
		setThemes: 15,
		openSettings: 16,
		settingsChanged: 100,
		gridNodesLoaded: 101,
		menuCreateBookmark: 200,
		menuCreateFolder: 201,
		menuEditProperties: 203,
		menuRefreshNode: 204,
		menuCapturePage: 206,
		menuDeleteNode: 207,
		showSettingsSection: 209
	}),
	// Kinds of cell in the grid (node.type)
	NodeType: Object.freeze({
		back: -1,
		empty: 0,
		folder: 1,
		bookmark: 2
	})
});
