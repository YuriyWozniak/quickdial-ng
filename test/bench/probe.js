// Quick Dial NG benchmark: new tab side, right after js/dial.js and shared.js (build.js puts them there). Notes when
// the settings are applied, the grid is drawn, all tile pictures are set and decoded and the page has painted, then
// sends early.js's and its own times to seed.js. Times are ms since the tab's navigation started.
// It follows the page with a MutationObserver and never polls: a busy timer here would hold up the page it measures.
(function () {
	'use strict';
	const REPORT_TIMEOUT_MS = 5000; // report anyway when not every picture shows up (a broken build)
	const TILE_SELECTOR = 'td > a'; // a tile; its first child shows the picture (the original Quick Dial's markup too)
	const PICTURE_PREFIX = 'data:image';
	const PICTURE_URL = /url\("?(data:[^")]+)/;
	const PAINTED_AFTER_FRAMES = 2; // the frame after the next one: the drawn grid is on screen
	const OBSERVED = { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] };
	// The dial's functions whose first call is noted: [owner, function name, mark]
	const TIMED_CALLS = [[() => window.app && window.app.Settings, '_changed', 'settingsApplied'], [() => window.dial, 'populateGrid', 'gridPopulated']];

	const shared = window.BENCH_SHARED;
	const expectedPictures = +new URL(location.href).searchParams.get(shared.TILES_PARAM) || 0; // seed.js says how many
	const bench = window.QDBench || { marks: {}, now: () => +performance.now().toFixed(shared.TIME_DIGITS) };
	const marks = bench.marks, now = bench.now;
	const markOnce = key => { if (!(key in marks)) marks[key] = now(); };
	for (const [getOwner, name, key] of TIMED_CALLS) {
		const owner = getOwner();
		if (!owner || typeof owner[name] !== 'function') continue;
		const original = owner[name];
		owner[name] = function () { const result = original.apply(this, arguments); markOnce(key); return result; };
	}

	const getTilePanels = () => [...document.querySelectorAll(TILE_SELECTOR)].map(tile => tile.firstElementChild).filter(Boolean);
	const hasPicture = panel => panel.style.backgroundImage.indexOf(PICTURE_PREFIX) >= 0;
	let hasReported = false;
	const observer = new MutationObserver(checkPictures);
	observer.observe(document.documentElement, OBSERVED);
	document.addEventListener('DOMContentLoaded', checkPictures);
	const reportTimer = setTimeout(() => { marks.timedOut = true; report(); }, REPORT_TIMEOUT_MS);

	function checkPictures() {
		if (hasReported || 'imagesSet' in marks) return;
		if (!expectedPictures) {
			if ('gridPopulated' in marks) {
				observer.disconnect();
				reportAfterPaint();
			}
			return;
		}
		if (getTilePanels().filter(hasPicture).length < expectedPictures) return;
		markOnce('imagesSet');
		observer.disconnect();
		reportAfterPaint();
	}
	function afterFrames(count, callback) {
		requestAnimationFrame(() => { if (count > 1) afterFrames(count - 1, callback); else callback(); });
	}
	function reportAfterPaint() {
		afterFrames(PAINTED_AFTER_FRAMES, () => {
			markOnce('painted');
			waitForDecoding().then(report);
		});
	}
	// When the pictures are decoded at the latest. Asked only after the paint: decoding copies of them earlier would
	// compete with the page's own first paint. By now Firefox has usually decoded them, so this resolves at once.
	function waitForDecoding() {
		const urls = getTilePanels().map(panel => (panel.style.backgroundImage.match(PICTURE_URL) || [])[1]).filter(Boolean);
		if (!urls.length) return Promise.resolve();
		return Promise.all(urls.map(url => {
			const image = new Image();
			image.src = url;
			return image.decode().catch(() => {});
		})).then(() => { markOnce('imagesDecoded'); });
	}
	function report() {
		if (hasReported) return;
		hasReported = true;
		observer.disconnect();
		clearTimeout(reportTimer);
		const send = () => {
			for (const entry of performance.getEntriesByType('paint')) { // first-contentful-paint -> firstContentfulPaint
				marks[entry.name.replace(/-(\w)/g, (match, letter) => letter.toUpperCase())] = +entry.startTime.toFixed(shared.TIME_DIGITS);
			}
			marks.timeOrigin = performance.timeOrigin; // seed.js turns it into openToOrigin
			browser.runtime.sendMessage({ [shared.DIAL_MESSAGE]: marks });
		};
		if (document.readyState === 'complete') send();
		else window.addEventListener('load', send);
	}
})();
