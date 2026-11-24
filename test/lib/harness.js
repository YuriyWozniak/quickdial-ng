// The test harness: a copy of the extension served over HTTP, the browser, and one fresh page per suite.
// Used by run.js (the page suites) and screenshots/make-screenshots.js. See ../README.md.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const TEST = path.join(ROOT, 'test');

function playwright() {
	try { return require('playwright'); }
	catch { console.error('Playwright not found. Run "npm install" in the test folder.'); process.exit(1); }
}

// A temporary copy of src/ that runs against the simulated API: the extension's files at the top
// (so absolute paths like /js/ui.js work), plus index.html, mock.js and bg.html (the background page).
// pageScript: extra code run in every extension page right after the mock is set up.
function prepare({ prefix = 'qdng-test-', pageScript = '' } = {}) {
	const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	fs.cpSync(SRC, copyDir, { recursive: true });
	for (const fileName of ['mock.js', 'index.html']) fs.copyFileSync(path.join(TEST, fileName), path.join(copyDir, fileName));
	const backgroundScripts = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8')).background.scripts;
	fs.writeFileSync(path.join(copyDir, 'bg.html'), '<!doctype html><html><head><script>window.browser = top.makeBrowser(window, "bg");</script>'
		+ backgroundScripts.map(script => `<script src="${script}"></script>`).join('') + '</head><body></body></html>');
	const mockScript = `<script>window.browser = top.makeBrowser(window, "dial");${pageScript}</script>`;
	for (const pageFile of ['dial.html', 'html/settings.html', 'html/properties.html']) {
		const filePath = path.join(copyDir, pageFile), html = fs.readFileSync(filePath, 'utf8');
		if (!/<head[^>]*>/.test(html)) throw new Error(pageFile + ': no <head>');
		fs.writeFileSync(filePath, html.replace(/<head[^>]*>/, headTag => headTag + mockScript));
	}
	return copyDir;
}

const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
	'.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
// Serves a folder on a free local port. Resolves to { port, close }.
async function serve(rootDir) {
	const server = http.createServer((request, response) => {
		const filePath = path.join(rootDir, decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
		if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) { response.writeHead(404); return response.end(); }
		response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
		fs.createReadStream(filePath).pipe(response);
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	return { port: server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}

// Playwright's own Chromium, or else Edge / Chrome if it isn't downloaded.
async function launch(port) {
	const { chromium } = playwright();
	const errors = [];
	// The server port is picked by the system; Chromium refuses some ports (e.g. 6566) unless allowed
	const args = ['--explicitly-allowed-ports=' + port];
	for (const launchOptions of [{ args }, { channel: 'msedge', args }, { channel: 'chrome', args }]) {
		try { return await chromium.launch(launchOptions); } catch (e) { errors.push(e.message.split('\n')[0]); }
	}
	throw new Error('No browser could be started. Run "npx playwright install chromium" in the test folder.\n  ' + errors.join('\n  '));
}

// Console messages that are expected: missing icons and favicons, blocked outside requests, pages
// talking to a background page that isn't loaded, and the sandbox blocking a downloaded page's scripts.
const EXPECTED_CONSOLE_ERRORS = [/no receiver/, /^Failed to load resource/, /'allow-scripts' permission is not set/];
// The size of the test browser's window: tall enough for both frames (background above, dial below), so clicks in the dial frame land
const VIEWPORT = { width: 1240, height: 1440 };
// How long waitFor and download wait by default (ms); at most this many script errors are reported per suite
const WAIT_TIMEOUT = 10000, DIALOG_TIMEOUT = 5000, MAX_REPORTED_ERRORS = 10;

const show = value => value === undefined ? '' : (typeof value === 'string' ? value : JSON.stringify(value));
const same = (first, second) => JSON.stringify(first) === JSON.stringify(second);

// One suite's page: a fresh browser context (empty storage, no bookmarks) with index.html loaded.
// The methods below are what suites use; code passed to inHost/waitFor runs in the page, not in Node.
class TestPage {
	static async open(browser, port, { dir, coverage } = {}) {
		const testPage = new TestPage();
		testPage.port = port;
		testPage.base = `http://127.0.0.1:${port}/`;
		testPage.dir = dir;
		testPage.lines = [];
		testPage.passed = 0;
		testPage.failed = 0;
		testPage.errors = [];
		testPage.context = await browser.newContext({ acceptDownloads: true, viewport: VIEWPORT });
		// Tiles without a picture download their site (Refresh). Nothing leaves this computer: other sites
		// answer with a stub page titled with their host, readable from the test pages as the extension's
		// host permission allows, also when asked with the user's cookies (site icons).
		const localOrigin = new URL(testPage.base).origin;
		await testPage.context.route(url => /^https?:$/.test(url.protocol) && url.origin !== localOrigin, route => route.fulfill({
			status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': localOrigin, 'access-control-allow-credentials': 'true' },
			body: `<!doctype html><html><head><title>${new URL(route.request().url()).host}</title></head><body></body></html>` }));
		testPage.page = await testPage.context.newPage();
		testPage.page.on('console', message => {
			if (message.type() === 'error' && !EXPECTED_CONSOLE_ERRORS.some(expected => expected.test(message.text()))) testPage.errors.push(message.text());
		});
		testPage.page.on('pageerror', error => testPage.errors.push(String(error.stack || error).split('\n').slice(0, 3).map(line => line.trim()).join(' | ')));
		if (coverage) testPage.coverage = await coverage.attach(testPage.page);
		await testPage.page.goto(testPage.base + 'index.html');
		return testPage;
	}

	/** Records a check: description says what should be true; found (shown on failure) is what was found. */
	check(description, passed, found) {
		if (passed) this.passed++; else this.failed++;
		this.lines.push((passed ? 'PASS ' : 'FAIL ') + description + (passed || found === undefined ? '' : '\n     got: ' + show(found)));
		return !!passed;
	}
	/** Deep equality of plain data (as JSON). */
	same(first, second) { return same(first, second); }
	/** A line of information in the report (not a check). */
	log(text) { this.lines.push('     ' + text); }

	/** Runs pageFunction(arg) in the host page (index.html) and returns its result. */
	inHost(pageFunction, arg) { return this.page.evaluate(pageFunction, arg); }
	/** Waits until condition(arg), run in the host page, returns something truthy, and returns it. */
	async waitFor(what, condition, arg, timeout = WAIT_TIMEOUT) {
		try { return await (await this.page.waitForFunction(condition, arg, { timeout, polling: 25 })).jsonValue(); }
		catch (e) { throw new Error('timed out waiting for ' + what + (e.message.includes('Timeout') ? '' : ': ' + e.message.split('\n')[0])); }
	}
	/** The frame of an extension page ('bg' or 'dial'), and functions run in it. */
	async frame(role = 'dial') { return (await this.page.$('#' + role)).contentFrame(); }
	async inFrame(role, pageFunction, arg) { return (await this.frame(role)).evaluate(pageFunction, arg); }
	inDial(pageFunction, arg) { return this.inFrame('dial', pageFunction, arg); }
	/** A locator in the dial frame (dial, Settings or Properties, whichever page is loaded there). */
	dial() { return this.page.frameLocator('#dial'); }

	/** Waits until the background page has nothing left to do (see waitForBackgroundIdle in index.html). */
	idle() { return this.page.evaluate(() => waitForBackgroundIdle()); }
	/** (Re)starts the background page and waits until it is idle. */
	async loadBg() {
		await this.page.evaluate(() => loadFrame('bg', 'bg.html'));
		await this.idle();
	}
	/** Opens the dial (query: e.g. '?path=/Folder') and waits until it shows its tiles. */
	async loadDial(query = '') {
		await this.page.evaluate(src => loadFrame('dial', src), 'dial.html' + query);
		await this.waitFor('the dial to draw', () => {
			const dialWindow = frameWindow('dial');
			return dialWindow.app && dialWindow.app.node && dialWindow.dial.grid && dialWindow.document.querySelector('table.qd-grid');
		});
	}
	/** Opens Settings on a section and waits until its form and themes are filled in. */
	async loadSettings(tab = '') {
		await this.page.evaluate(src => loadFrame('dial', src), 'html/settings.html' + (tab ? '?tab=' + tab : ''));
		await this.waitFor('Settings to load', () => { const settingsWindow = frameWindow('dial'); return settingsWindow.app && settingsWindow.app.settings && settingsWindow.app.Themes.cards; });
	}
	/** Answers the dialog (QDUI.dialog) open in a frame: fills its fields with values (null: keep), then
	 * clicks OK, or Cancel when ok is false. Returns { title, error }: error is the dialog's message
	 * when it refused the values and stays open, else null. where: a frame locator (default: the dial frame). */
	async answer({ values = [], ok = true, where } = {}) {
		const dialogBox = (where || this.dial()).locator('.qd-overlay:not(.is-closing) > .qd-dialog');
		await dialogBox.waitFor({ timeout: DIALOG_TIMEOUT }).catch(() => { throw new Error('no dialog appeared'); });
		const dialogElement = await dialogBox.elementHandle();
		const title = await dialogBox.locator('.qd-title').textContent();
		for (let i = 0; i < values.length; i++) if (values[i] != null) await dialogBox.locator('input').nth(i).fill(values[i]);
		await dialogBox.locator('.qd-dialog-actions .qd-btn').nth(ok ? 1 : 0).click();
		// This same dialog still open (another one may have opened after it): it refused the values
		const error = await dialogElement.evaluate(dialog => dialog.isConnected && !dialog.parentNode.classList.contains('is-closing') ? dialog.querySelector('.qd-dialog-error').textContent : null);
		return { title, error };
	}
	/** Runs action() and returns the file it downloads: { name, text }. */
	async download(action) {
		const [download] = await Promise.all([this.page.waitForEvent('download', { timeout: WAIT_TIMEOUT }), action()]);
		return { name: download.suggestedFilename(), text: fs.readFileSync(await download.path(), 'utf8') };
	}

	async close() {
		const errors = this.errors.slice(0, MAX_REPORTED_ERRORS);
		this.check('no script errors', errors.length === 0, errors);
		if (this.coverage) await this.coverage.snapshot();
		await this.context.close();
	}
}

module.exports = { ROOT, SRC, TEST, prepare, serve, launch, playwright, TestPage, same };
