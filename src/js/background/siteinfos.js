// Quick Dial NG — background page: title and picture of a site, for its tile.
// Both functions resolve with { url, title, icon, screenshot }, or with null when it failed; they never reject.
app.SiteInfos = {};

app.SiteInfos.PREVIEW_WIDTH = 1200; // Width a page is drawn at for its picture; the height follows the tile proportions
app.SiteInfos.pictureSize = function(){ // Size of a tile picture, in the tiles' proportions (SiteIcons draws its pictures at it too)
	const grid = app.settings.grid;
	const width = app.SiteInfos.PREVIEW_WIDTH;
	let height = width / grid.ratioX * grid.ratioY;
	if(grid.title == true) height -= grid.titleHeight; // grid.title / grid.titleHeight: settings of the original Quick Dial 1.x
	return { width, height };
};
app.SiteInfos.CANVAS_SCALE = 0.5; // Pictures are stored at this scale of the size pages are drawn at
app.SiteInfos._canvas = function(size){ // A canvas at CANVAS_SCALE of the preview size, scaled so drawing uses preview coordinates
	const canvas = document.createElement('canvas');
	canvas.style.width = size.width + 'px';
	canvas.style.height = size.height + 'px';
	canvas.width = size.width * app.SiteInfos.CANVAS_SCALE;
	canvas.height = size.height * app.SiteInfos.CANVAS_SCALE;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, size.width, size.height);
	ctx.save();
	ctx.scale(app.SiteInfos.CANVAS_SCALE, app.SiteInfos.CANVAS_SCALE);
	return { canvas, ctx };
};

app.SiteInfos.LOAD_POLL = 300; // How often Capture page checks whether its tab has finished loading (ms)
app.SiteInfos.LOAD_TIMEOUT = 30000; // A page still loading after this long is captured as it is (endless loaders)
app.SiteInfos.DOWNLOAD_TIMEOUT = 10000; // Refresh: how long the page's download may take (ms)
app.SiteInfos.DRAW_TIMEOUT = 6000; // Refresh: a downloaded page that hasn't finished loading its parts after this long is drawn as it is (ms)

// Opens the page in a background tab, then shows it for a moment to capture it ("Capture page").
// The capture sees the page as the user does, logged in. The tab is closed again whatever happens.
app.SiteInfos.fromNewTab = function(url){
	const SiteInfos = app.SiteInfos;
	const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
	let tabId = null;
	const screenshot = async () => { // Resolves with { tab, image }: the tab as it was captured and its screenshot
		tabId = (await browser.tabs.create({ url, active: false })).id;
		browser.tabs.update(tabId, { muted: true }).catch(() => {});
		const deadline = Date.now() + SiteInfos.LOAD_TIMEOUT;
		let tab;
		do {
			await wait(SiteInfos.LOAD_POLL);
			tab = await browser.tabs.get(tabId);
		} while(tab.status == 'loading' && Date.now() < deadline);
		await browser.tabs.update(tabId, { active: true });
		await wait(app.settings.grid.cells.snapshotDelay);
		tab = await browser.tabs.get(tabId);
		if(!tab.active) throw new Error('the tab was no longer shown'); // The user switched tabs: the picture would show another page
		return { tab, image: await browser.tabs.captureVisibleTab(tab.windowId) };
	};
	return screenshot().then(
		shot => {
			browser.tabs.remove(tabId).catch(() => {});
			return SiteInfos._fromScreenshot(shot.tab, shot.image);
		},
		e => {
			if(tabId != null) browser.tabs.remove(tabId).catch(() => {});
			console.warn('Quick Dial NG: Capture page failed for ' + url, e);
			return null;
		}
	).catch(() => null);
};
// The site infos from a screenshot of its tab: the picture is cut (or stretched) to the tile proportions
app.SiteInfos._fromScreenshot = async function(tab, image){
	const img = new Image();
	img.src = image;
	await img.decode(); // Drawn only once it is decoded: drawing it earlier gives a blank picture
	const size = app.SiteInfos.pictureSize();
	const { canvas, ctx } = app.SiteInfos._canvas(size);
	if(tab.height * size.width / size.height >= tab.width){ // Cut the bottom of the page
		ctx.drawImage(img, 0, 0, tab.width, tab.width / size.width * size.height, 0, 0, size.width, size.height);
	} else { // Wider than the tile: stretched
		ctx.drawImage(img, 0, 0, tab.width, tab.height, 0, 0, size.width, size.height);
	}
	ctx.restore();
	return { url: tab.url, title: tab.title, icon: tab.favIconUrl, screenshot: canvas.toDataURL('image/webp', app.Images.quality) };
};

// Downloads the page and draws it in a hidden frame ("Refresh"). Only http and https pages.
app.SiteInfos.fromFrame = function(url){
	return new Promise(resolve => app.SiteInfos._fromFrame(url, resolve));
};
app.SiteInfos._fromFrame = function(url, done){ // done(infos), or done(null) when it failed
	const fail = () => done(null);
	if(!/^https?:\/\//i.test(url)){ // Only web pages can be fetched (not place:, file:, javascript:...)
		fail();
		return;
	}
	const size = app.SiteInfos.pictureSize();
	let iframe;
	const pageLoaded = () => { // onload, or a timeout for pages that never finish: whichever comes first
		if(!iframe) return;
		const title = iframe.contentWindow.document.title || url;
		const { canvas, ctx } = app.SiteInfos._canvas(size);
		try {
			ctx.drawWindow(iframe.contentWindow, 0, 0, size.width, size.height, 'rgb(255, 255, 255)');
		} catch(e) { // drawWindow is refused to extensions in recent Firefox versions: no picture
			iframe.remove();
			iframe = null;
			fail();
			return;
		}
		ctx.restore();
		const screenshot = canvas.toDataURL('image/webp', app.Images.quality);
		iframe.remove();
		iframe = null;
		done({ url, title, icon: null, screenshot });
	};
	const xhr = new XMLHttpRequest();
	xhr.timeout = app.SiteInfos.DOWNLOAD_TIMEOUT;
	try {
		xhr.open('GET', url, true);
	} catch(e) { // Not a valid address after all (e.g. "http://a b")
		fail();
		return;
	}
	xhr.onload = () => {
		iframe = document.createElement('iframe');
		iframe.width = size.width;
		iframe.height = size.height;
		iframe.style.position = 'absolute';
		iframe.scrolling = 'no';
		// The downloaded page is only drawn, never run: the sandbox (no allow-scripts) blocks all of its scripts,
		// forms, pop-ups and navigation, on top of the extension's own content security policy.
		// allow-same-origin keeps the frame readable for its title and for drawWindow.
		iframe.setAttribute('sandbox', 'allow-same-origin');
		iframe.setAttribute('referrerpolicy', 'no-referrer');
		const base = '<base href="' + url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '">';
		const html = xhr.responseText;
		let content = html.replace(/<head(\s[^>]*)?>/i, tag => tag + base); // Relative links resolve against the site
		if(content == html) content = base + html;
		document.body.appendChild(iframe);
		iframe.onload = pageLoaded;
		iframe.srcdoc = content;
		setTimeout(pageLoaded, app.SiteInfos.DRAW_TIMEOUT);
	};
	xhr.onabort = xhr.onerror = xhr.ontimeout = fail;
	xhr.send();
};
