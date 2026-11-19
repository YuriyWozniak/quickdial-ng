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
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	fs.cpSync(SRC, dir, { recursive: true });
	for (const f of ['mock.js', 'index.html']) fs.copyFileSync(path.join(TEST, f), path.join(dir, f));
	const scripts = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8')).background.scripts;
	fs.writeFileSync(path.join(dir, 'bg.html'), '<!doctype html><html><head><script>window.browser = top.makeBrowser(window, "bg");</script>'
		+ scripts.map(s => `<script src="${s}"></script>`).join('') + '</head><body></body></html>');
	const mock = `<script>window.browser = top.makeBrowser(window, "dial");${pageScript}</script>`;
	for (const f of ['dial.html', 'html/settings.html', 'html/properties.html']) {
		const file = path.join(dir, f), html = fs.readFileSync(file, 'utf8');
		if (!/<head[^>]*>/.test(html)) throw new Error(f + ': no <head>');
		fs.writeFileSync(file, html.replace(/<head[^>]*>/, m => m + mock));
	}
	return dir;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
	'.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
// Serves dir on a free local port. Resolves to { port, close }.
async function serve(dir) {
	const server = http.createServer((req, res) => {
		const file = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
		if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
		res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
		fs.createReadStream(file).pipe(res);
	});
	await new Promise(r => server.listen(0, '127.0.0.1', r));
	return { port: server.address().port, close: () => new Promise(r => server.close(r)) };
}

// Playwright's own Chromium, or else Edge / Chrome if it isn't downloaded.
async function launch(port) {
	const { chromium } = playwright();
	const errors = [];
	// The server port is picked by the system; Chromium refuses some ports (e.g. 6566) unless allowed
	const args = ['--explicitly-allowed-ports=' + port];
	for (const opts of [{ args }, { channel: 'msedge', args }, { channel: 'chrome', args }]) {
		try { return await chromium.launch(opts); } catch (e) { errors.push(e.message.split('\n')[0]); }
	}
	throw new Error('No browser could be started. Run "npx playwright install chromium" in the test folder.\n  ' + errors.join('\n  '));
}

// Console messages that are expected: missing icons and favicons, blocked outside requests, pages
// talking to a background page that isn't loaded, and the sandbox blocking a downloaded page's scripts.
const EXPECTED = [/no receiver/, /^Failed to load resource/, /'allow-scripts' permission is not set/];

const show = v => v === undefined ? '' : (typeof v === 'string' ? v : JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// One suite's page: a fresh browser context (empty storage, no bookmarks) with index.html loaded.
// The methods below are what suites use; code passed to J/waitFor runs in the page, not in Node.
class TestPage {
	static async open(browser, port, { dir, coverage } = {}) {
		const t = new TestPage();
		t.port = port;
		t.base = `http://127.0.0.1:${port}/`;
		t.dir = dir;
		t.lines = [];
		t.passed = 0;
		t.failed = 0;
		t.errors = [];
		// Tall enough for both frames (background above, dial below), so clicks in the dial frame land
		t.context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1240, height: 1440 } });
		// Tiles without a picture download their site (Refresh). Nothing leaves this computer: other sites
		// answer with a stub page titled with their host, readable from the test pages as the extension's
		// host permission allows.
		const local = new URL(t.base).origin;
		await t.context.route(url => /^https?:$/.test(url.protocol) && url.origin !== local, route => route.fulfill({
			status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' },
			body: `<!doctype html><html><head><title>${new URL(route.request().url()).host}</title></head><body></body></html>` }));
		t.page = await t.context.newPage();
		t.page.on('console', m => { if (m.type() === 'error' && !EXPECTED.some(r => r.test(m.text()))) t.errors.push(m.text()); });
		t.page.on('pageerror', e => t.errors.push(String(e.stack || e).split('\n').slice(0, 3).map(s => s.trim()).join(' | ')));
		if (coverage) t.coverage = await coverage.attach(t.page);
		await t.page.goto(t.base + 'index.html');
		return t;
	}

	check(name, cond, info) {
		if (cond) this.passed++; else this.failed++;
		this.lines.push((cond ? 'PASS ' : 'FAIL ') + name + (cond || info === undefined ? '' : '\n     got: ' + show(info)));
		return !!cond;
	}
	same(a, b) { return same(a, b); }
	log(text) { this.lines.push('     ' + text); }

	/** Runs fn(arg) in the host page (index.html) and returns its result. */
	J(fn, arg) { return this.page.evaluate(fn, arg); }
	/** Waits until fn(arg), run in the host page, returns something truthy, and returns it. */
	async waitFor(what, fn, arg, timeout = 10000) {
		try { return await (await this.page.waitForFunction(fn, arg, { timeout, polling: 25 })).jsonValue(); }
		catch (e) { throw new Error('timed out waiting for ' + what + (e.message.includes('Timeout') ? '' : ': ' + e.message.split('\n')[0])); }
	}
	/** The frame of an extension page ('bg' or 'dial'), and functions run in it. */
	async frame(role = 'dial') { return (await this.page.$('#' + role)).contentFrame(); }
	async inFrame(role, fn, arg) { return (await this.frame(role)).evaluate(fn, arg); }
	inDial(fn, arg) { return this.inFrame('dial', fn, arg); }
	/** A locator in the dial frame (dial, Settings or Properties, whichever page is loaded there). */
	dial() { return this.page.frameLocator('#dial'); }

	/** Waits until the background page has nothing left to do (see bgIdle in index.html). */
	idle() { return this.page.evaluate(() => bgIdle()); }
	/** (Re)starts the background page and waits until it is idle. */
	async loadBg() {
		await this.page.evaluate(() => loadFrame('bg', 'bg.html'));
		await this.idle();
	}
	/** Opens the dial (query: e.g. '?path=/Folder') and waits until it shows its tiles. */
	async loadDial(query = '') {
		await this.page.evaluate(src => loadFrame('dial', src), 'dial.html' + query);
		await this.waitFor('the dial to draw', () => { const w = win('dial'); return w.app && w.app.node && w.dial.Grid && w.document.querySelector('table.Grid'); });
	}
	/** Opens Settings on a section and waits until its form and themes are filled in. */
	async loadSettings(tab = '') {
		await this.page.evaluate(src => loadFrame('dial', src), 'html/settings.html' + (tab ? '?tab=' + tab : ''));
		await this.waitFor('Settings to load', () => { const w = win('dial'); return w.app && w.app.settings && w.app.Themes.cards; });
	}
	/** Answers the dialog (QDUI.dialog) open in a frame: fills its fields with values (null: keep), then
	 * clicks OK, or Cancel when ok is false. Returns { title, error }: error is the dialog's message
	 * when it refused the values and stays open, else null. where: a frame locator (default: the dial frame). */
	async answer({ values = [], ok = true, where } = {}) {
		const box = (where || this.dial()).locator('.qd-overlay:not(.is-closing) > .qd-dialog');
		await box.waitFor({ timeout: 5000 }).catch(() => { throw new Error('no dialog appeared'); });
		const dialog = await box.elementHandle();
		const title = await box.locator('.qd-title').textContent();
		for (let i = 0; i < values.length; i++) if (values[i] != null) await box.locator('input').nth(i).fill(values[i]);
		await box.locator('.qd-dialog-actions .qd-btn').nth(ok ? 1 : 0).click();
		// This same dialog still open (another one may have opened after it): it refused the values
		const error = await dialog.evaluate(b => b.isConnected && !b.parentNode.classList.contains('is-closing') ? b.querySelector('.qd-dialog-error').textContent : null);
		return { title, error };
	}
	/** Runs action() and returns the file it downloads: { name, text }. */
	async download(action) {
		const [d] = await Promise.all([this.page.waitForEvent('download', { timeout: 10000 }), action()]);
		return { name: d.suggestedFilename(), text: fs.readFileSync(await d.path(), 'utf8') };
	}

	async close() {
		const errors = this.errors.slice(0, 10);
		this.check('no script errors', errors.length === 0, errors);
		if (this.coverage) await this.coverage.snapshot();
		await this.context.close();
	}
}

module.exports = { ROOT, SRC, TEST, prepare, serve, launch, playwright, TestPage, same };
