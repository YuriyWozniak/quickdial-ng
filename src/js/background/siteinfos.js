// Quick Dial NG — background page: title and picture of a site, for its tile.
// Both functions call back with { url, title, icon, screenshot }, or with nothing on failure.
app.SiteInfos = {};

app.SiteInfos._previewSize = function(){ // Size of a tile picture, in the tiles' proportions
	const grid = app.settings.grid;
	const width = 1200;
	let height = width / grid.ratioX * grid.ratioY;
	if(grid.title == true) height -= grid.titleHeight; // grid.title / grid.titleHeight: settings of the original Quick Dial 1.x
	return { width, height };
};
app.SiteInfos._canvas = function(size){ // A canvas at half the preview size, scaled so drawing uses preview coordinates
	const canvas = document.createElement('canvas');
	canvas.style.width = size.width + 'px';
	canvas.style.height = size.height + 'px';
	canvas.width = size.width / 2;
	canvas.height = size.height / 2;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, size.width, size.height);
	ctx.save();
	ctx.scale(0.5, 0.5);
	return { canvas, ctx };
};

// Opens the page in a background tab, then shows it for a moment to capture it ("Capture page").
// The capture sees the page as the user does, logged in.
app.SiteInfos.fromNewTab = function(url, callback){
	const fail = () => { if(callback) callback(); };
	browser.tabs.create({ url, active: false }).then(tab => {
		browser.tabs.update(tab.id, { muted: true });
		const waitLoaded = () => {
			browser.tabs.get(tab.id).then(tab => {
				if(tab.status == 'loading'){
					setTimeout(waitLoaded, 300);
					return;
				}
				browser.tabs.update(tab.id, { active: true }).then(() => {
					setTimeout(() => {
						browser.tabs.captureVisibleTab().then(img => {
							browser.tabs.remove(tab.id);
							const imgObj = new Image();
							imgObj.src = img;
							const size = app.SiteInfos._previewSize();
							const { canvas, ctx } = app.SiteInfos._canvas(size);
							setTimeout(() => {
								if(tab.height * size.width / size.height >= tab.width){ // Cut the bottom of the page
									ctx.drawImage(imgObj, 0, 0, tab.width, tab.width / size.width * size.height, 0, 0, size.width, size.height);
								} else { // Wider than the tile: stretched
									ctx.drawImage(imgObj, 0, 0, tab.width, tab.height, 0, 0, size.width, size.height);
								}
								ctx.restore();
								if(callback) callback({ url: tab.url, title: tab.title, icon: tab.favIconUrl, screenshot: canvas.toDataURL('image/webp', app.Images.quality) });
							}, 100);
						}, () => {
							browser.tabs.remove(tab.id);
							fail();
						});
					}, app.settings.grid.cells.snapshotDelay);
				}, fail);
			}, fail);
		};
		setTimeout(waitLoaded, 300);
	}, fail);
};

// Downloads the page and draws it in a hidden frame ("Refresh"). Only http and https pages.
app.SiteInfos.fromFrame = function(url, callback){
	const fail = () => { if(callback) callback(); };
	if(!/^https?:\/\//i.test(url)){ // Only web pages can be fetched (not place:, file:, javascript:...)
		fail();
		return;
	}
	const size = app.SiteInfos._previewSize();
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
		if(callback) callback({ url, title, icon: null, screenshot });
	};
	const xhr = new XMLHttpRequest();
	xhr.timeout = 10000;
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
		setTimeout(pageLoaded, 6000);
	};
	xhr.onabort = xhr.onerror = xhr.ontimeout = fail;
	xhr.send();
};
