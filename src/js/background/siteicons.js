// Quick Dial NG — background page: a site's own icon as a tile picture ("Site icon"), and a letter tile for a
// site that has none. The icons come from the site itself, never from a favicon service (which would learn every
// address on the dial): the page's <link rel="icon"> and apple-touch icons, its web app manifest, and /favicon.ico.
// Each icon is drawn centred on a transparent picture in the tiles' proportions, so the tile's own colour shows
// around it. Neither function rejects: a site that can't be reached has no icons.
app.SiteIcons = {};

app.SiteIcons.DOWNLOAD_TIMEOUT = 10000; // How long the page, its manifest and each icon may take to download (ms)
app.SiteIcons.MAX_ICON_BYTES = 1024 * 1024; // Larger files are skipped: no real icon is that big
app.SiteIcons.MAX_DOWNLOADS = 6; // At most this many icons are downloaded per site, the most promising first
app.SiteIcons.ICON_SHARE = 0.56; // The icon's side, as a share of the picture's shorter side
app.SiteIcons.ICON_ON_SQUARE = 0.6; // An icon on a rounded square (the icon picker's Background): its side, as a share of the square's
app.SiteIcons.VECTOR_SIZE = 1024; // The size an SVG icon counts as when the icons are ranked
// What an icon's size is guessed to be before it is downloaded, when the page doesn't say
app.SiteIcons.GUESSED_SIZE = Object.freeze({ appleTouch: 180, link: 32, favicon: 32 });
// The letter tile: a rounded square in a colour of its own for each site, with the site's first letter
app.SiteIcons.LETTER_RADIUS = 0.2; // Corner radius, as a share of the square's side
app.SiteIcons.LETTER_FONT_SHARE = 0.58; // Height of the letter, as a share of the square's side
app.SiteIcons.LETTER_SATURATION = 45; // The square's colour: a hue from the site's name, at this saturation and lightness (%)
app.SiteIcons.LETTER_LIGHTNESS = 42;
app.SiteIcons.LETTER_COLOR = '#ffffff';
app.SiteIcons.LETTER_FONT = 'system-ui, "Segoe UI", sans-serif';

/**
 * @typedef {object} SiteIcon an icon of a site, drawn as a tile picture
 * @property {string} picture WebP data URL in the tiles' proportions
 * @property {number} width the icon's own size in pixels (0 for an SVG icon)
 * @property {number} height
 * @property {boolean} isVector an SVG icon: sharp at any size
 */
/**
 * The icons of the site at url, best first (SVG, then the largest), and the page's title.
 * Resolves with { title: null, icons: [] } for an address that isn't a web page or can't be reached.
 * @param {string} url @returns {Promise<{ title: string|null, icons: SiteIcon[] }>}
 */
app.SiteIcons.find = async function(url){
	const SiteIcons = app.SiteIcons;
	if(!/^https?:\/\//i.test(url || '')) return { title: null, icons: [] };
	try {
		const page = await SiteIcons._readPage(url);
		const loaded = await Promise.all(page.candidates.slice(0, SiteIcons.MAX_DOWNLOADS).map(candidate => SiteIcons._load(candidate)));
		const seen = new Set(), icons = [];
		for(const icon of loaded){
			if(!icon || seen.has(icon.dataUrl)) continue; // The same file under two names
			seen.add(icon.dataUrl);
			icons.push(icon);
		}
		icons.sort((first, second) => SiteIcons._rank(second) - SiteIcons._rank(first));
		return { title: page.title, icons: icons.map(icon => ({ picture: SiteIcons._compose(icon), width: icon.isVector ? 0 : icon.width, height: icon.isVector ? 0 : icon.height, isVector: icon.isVector })) };
	} catch(e) {
		console.warn('Quick Dial NG: no site icons for ' + url, e);
		return { title: null, icons: [] };
	}
};

/**
 * A letter tile for a site, for one without an icon: the first letter of its host on a rounded square, in a
 * colour worked out from the host, so a site always gets the same one.
 * @param {string} url @param {string} [title] used when the address has no host @returns {string} WebP data URL
 */
app.SiteIcons.letter = function(url, title){
	const SiteIcons = app.SiteIcons;
	let name = '';
	try { name = new URL(url).hostname.replace(/^www\./i, ''); } catch(e) {}
	name = name || (title || '').trim() || '?';
	const letter = Array.from(name)[0].toLocaleUpperCase();
	let hue = 0;
	for(const character of name) hue = (hue * 31 + (character.codePointAt(0) || 0)) % 360;
	const { canvas, ctx, side } = SiteIcons._pictureCanvas();
	const top = SiteIcons._square(canvas, ctx, side, 'hsl(' + hue + ' ' + SiteIcons.LETTER_SATURATION + '% ' + SiteIcons.LETTER_LIGHTNESS + '%)');
	ctx.fillStyle = SiteIcons.LETTER_COLOR;
	ctx.font = '600 ' + Math.round(side * SiteIcons.LETTER_FONT_SHARE) + 'px ' + SiteIcons.LETTER_FONT;
	ctx.textAlign = 'center';
	const metrics = ctx.measureText(letter); // Centred on the letter's own height, not on the line's
	ctx.fillText(letter, canvas.width / 2, top + (side + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
	return canvas.toDataURL('image/webp', app.Images.quality);
};

app.SiteIcons.COLOR = /^#[0-9a-f]{6}$/i; // The background colour of an icon from the icon picker
/**
 * An icon of the icon picker (Properties › Picture › Icon) as a tile picture, drawn the way a site's icon is, on a
 * rounded square of the colour `background` if it has one. Resolves with null for anything that isn't a picture.
 * @param {{ image: string, width: number, height: number, isVector: boolean, background?: string|null }} icon
 *   image: a data URL; width, height: its size in pixels (at most VECTOR_SIZE)
 * @returns {Promise<string|null>} WebP data URL
 */
app.SiteIcons.drawIcon = async function(icon){
	const SiteIcons = app.SiteIcons;
	if(!icon || typeof icon.image != 'string' || !icon.image.startsWith('data:image/')) return null;
	const width = Math.round(+icon.width), height = Math.round(+icon.height);
	if(!(width > 0 && height > 0 && Math.max(width, height) <= SiteIcons.VECTOR_SIZE)) return null;
	const background = typeof icon.background == 'string' && SiteIcons.COLOR.test(icon.background) ? icon.background : null;
	const image = new Image();
	image.src = icon.image;
	try { await image.decode(); } catch(e) { return null; }
	return SiteIcons._compose({ image, width, height, isVector: icon.isVector === true }, background);
};

// A transparent canvas of a tile picture (the size of the pictures SiteInfos makes) and the side of the icon on it
app.SiteIcons._pictureCanvas = function(){
	const size = app.SiteInfos._previewSize(), scale = app.SiteInfos.CANVAS_SCALE;
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(size.width * scale);
	canvas.height = Math.round(size.height * scale);
	const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
	return { canvas, ctx, side: Math.round(Math.min(canvas.width, canvas.height) * app.SiteIcons.ICON_SHARE) };
};
// The rounded square of a letter tile, or behind an icon, in the middle of the picture: answers its top
app.SiteIcons._square = function(canvas, ctx, side, color){
	const top = Math.round((canvas.height - side) / 2);
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.roundRect(Math.round((canvas.width - side) / 2), top, side, side, side * app.SiteIcons.LETTER_RADIUS);
	ctx.fill();
	return top;
};
// An icon as a tile picture: centred, ICON_SHARE of the picture's shorter side. An icon smaller than that is
// enlarged by whole pixels without smoothing, so it stays sharp (and may stay a little smaller). background: the
// colour of a rounded square drawn behind the icon, which then takes ICON_ON_SQUARE of it; none: transparent.
app.SiteIcons._compose = function(icon, background){
	const { canvas, ctx, side: pictureSide } = app.SiteIcons._pictureCanvas();
	let side = pictureSide;
	if(background){
		app.SiteIcons._square(canvas, ctx, pictureSide, background);
		side = Math.round(pictureSide * app.SiteIcons.ICON_ON_SQUARE);
	}
	const longest = Math.max(icon.width, icon.height);
	let scale = side / longest;
	if(!icon.isVector && longest < side){
		scale = Math.floor(side / longest);
		ctx.imageSmoothingEnabled = false;
	} else {
		ctx.imageSmoothingQuality = 'high';
	}
	const width = Math.round(icon.width * scale), height = Math.round(icon.height * scale);
	ctx.drawImage(icon.image, Math.round((canvas.width - width) / 2), Math.round((canvas.height - height) / 2), width, height);
	return canvas.toDataURL('image/webp', app.Images.quality);
};
// How good an icon is: SVG first, then the larger
app.SiteIcons._rank = icon => icon.isVector ? app.SiteIcons.VECTOR_SIZE : Math.min(icon.width, icon.height);

// The page's title and the icons to try, the most promising first: the icons the page links to, its manifest's,
// then /favicon.ico. Each candidate is { href, size }, size being what the page says (or a guess, see GUESSED_SIZE).
app.SiteIcons._readPage = async function(url){
	const SiteIcons = app.SiteIcons, Guessed = SiteIcons.GUESSED_SIZE;
	const candidates = [];
	let title = null, pageUrl = url;
	const page = await SiteIcons._download(url, response => response.text().then(html => ({ url: response.url || url, html })));
	if(page){
		pageUrl = page.url;
		const doc = new DOMParser().parseFromString(page.html, 'text/html');
		title = (doc.title || '').trim() || null;
		const baseElement = doc.querySelector('base[href]');
		const base = (baseElement && SiteIcons._resolve(baseElement.getAttribute('href'), pageUrl)) || pageUrl;
		for(const link of doc.querySelectorAll('link[rel][href]')){
			const rel = (link.getAttribute('rel') || '').toLowerCase().split(/\s+/);
			const isAppleTouch = rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed');
			if(!isAppleTouch && !rel.includes('icon')) continue; // "shortcut icon" counts; mask-icon (one colour, for Safari) doesn't
			const href = SiteIcons._resolve(link.getAttribute('href'), base);
			if(href) candidates.push({ href, size: SiteIcons._declaredSize(link.getAttribute('sizes'), link.getAttribute('type'), href, isAppleTouch ? Guessed.appleTouch : Guessed.link) });
		}
		const manifestLink = doc.querySelector('link[rel~="manifest" i][href]');
		const manifestUrl = manifestLink && SiteIcons._resolve(manifestLink.getAttribute('href'), base);
		if(manifestUrl) candidates.push(...await SiteIcons._manifestIcons(manifestUrl));
	}
	const favicon = SiteIcons._resolve('/favicon.ico', pageUrl);
	if(favicon) candidates.push({ href: favicon, size: Guessed.favicon });
	candidates.sort((first, second) => second.size - first.size); // Equal sizes keep the page's order
	const hrefs = new Set();
	return { title, candidates: candidates.filter(candidate => !hrefs.has(candidate.href) && hrefs.add(candidate.href)) };
};
// The icons of a web app manifest, but those made to be drawn in one colour only (purpose "monochrome")
app.SiteIcons._manifestIcons = async function(manifestUrl){
	const SiteIcons = app.SiteIcons;
	const manifest = await SiteIcons._download(manifestUrl, response => response.json());
	if(!manifest || !Array.isArray(manifest.icons)) return [];
	const candidates = [];
	for(const icon of manifest.icons){
		if(!icon || typeof icon.src != 'string') continue;
		const purposes = String(icon.purpose || 'any').toLowerCase().split(/\s+/);
		if(!purposes.includes('any') && !purposes.includes('maskable')) continue;
		const href = SiteIcons._resolve(icon.src, manifestUrl);
		if(href) candidates.push({ href, size: SiteIcons._declaredSize(icon.sizes, icon.type, href, SiteIcons.GUESSED_SIZE.link) });
	}
	return candidates;
};
// The size of an icon as the page declares it: the largest of its sizes ("16x16 32x32"), or VECTOR_SIZE for SVG
app.SiteIcons._declaredSize = function(sizes, type, href, guess){
	if(/svg/i.test(type || '') || /\.svg([?#]|$)/i.test(href)) return app.SiteIcons.VECTOR_SIZE;
	let largest = 0;
	for(const match of String(sizes || '').matchAll(/(\d+)x(\d+)/gi)) largest = Math.max(largest, Math.min(+match[1], +match[2]));
	return largest || guess;
};
// An address from a page, made absolute. Only web addresses and pictures written in the page (data:image/) are kept.
app.SiteIcons._resolve = function(href, base){
	if(!href) return null;
	try {
		const url = new URL(href.trim(), base);
		if(url.protocol == 'http:' || url.protocol == 'https:' || url.href.startsWith('data:image/')) return url.href;
	} catch(e) {}
	return null;
};

// Downloads an icon and decodes it. Resolves with { image, dataUrl, width, height, isVector }, or with null when it
// isn't a picture that can be drawn (a missing icon often comes back as a web page), or is too large.
app.SiteIcons._load = async function(candidate){
	const SiteIcons = app.SiteIcons;
	let blob = await SiteIcons._download(candidate.href, response => response.blob());
	if(!blob || blob.size == 0 || blob.size > SiteIcons.MAX_ICON_BYTES) return null;
	const isVector = /svg/i.test(blob.type) || (!blob.type.startsWith('image/') && /\.svg([?#]|$)/i.test(candidate.href));
	if(isVector && !/svg/i.test(blob.type)) blob = new Blob([blob], { type: 'image/svg+xml' }); // SVG served as text: drawn only with its own type
	const dataUrl = await new Promise(resolve => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => resolve('');
		reader.readAsDataURL(blob);
	});
	const image = new Image();
	image.src = dataUrl;
	try { await image.decode(); } catch(e) { return null; } // Not a picture. An SVG icon's scripts never run: it is only drawn.
	// An SVG icon is drawn into a square: its viewBox keeps its shape (an SVG without a size reports 300×150 in some browsers)
	if(isVector) return { image, dataUrl, width: SiteIcons.VECTOR_SIZE, height: SiteIcons.VECTOR_SIZE, isVector };
	if(!image.naturalWidth || !image.naturalHeight) return null;
	return { image, dataUrl, width: image.naturalWidth, height: image.naturalHeight, isVector };
};
// Downloads href with the user's cookies (the icons a site shows when logged in) and reads the answer with
// read(response). Resolves with what read gives, or null when the download or the reading failed or took too long.
app.SiteIcons._download = async function(href, read){
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), app.SiteIcons.DOWNLOAD_TIMEOUT);
	try {
		const response = await fetch(href, { credentials: 'include', referrerPolicy: 'no-referrer', signal: controller.signal });
		return response.ok ? await read(response) : null;
	} catch(e) {
		return null;
	} finally {
		clearTimeout(timer);
	}
};
