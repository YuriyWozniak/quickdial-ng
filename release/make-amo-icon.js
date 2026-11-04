#!/usr/bin/env node
// Renders src/img/icon.svg (light-mode colours) to release/amo-icon.png, 128x128 with a transparent
// background, for the "Add-on icon" on addons.mozilla.org (AMO accepts only PNG or JPG there).
// Usage, from the test folder (it reuses the tests' Playwright): node ../release/make-amo-icon.js
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [path.join(__dirname, '..', 'test'), process.cwd()] }));

(async () => {
	const svg = fs.readFileSync(path.join(__dirname, '..', 'src', 'img', 'icon.svg'), 'utf8');
	const out = path.join(__dirname, 'amo-icon.png');
	const b = await chromium.launch();
	const pg = await b.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1, colorScheme: 'light' });
	await pg.setContent(`<html><body style="margin:0;background:transparent">
		<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="128" height="128" style="display:block"></body></html>`);
	await pg.waitForFunction(() => document.images[0].complete);
	await pg.screenshot({ path: out, omitBackground: true });
	await b.close();
	console.log('Saved ' + out);
})();
