// Quick Dial NG benchmark: new tab side, the first script of dial.html (build.js puts it there). Notes the page's
// earliest moments; probe.js adds the rest and reports them. Times are ms since the tab's navigation started.
/* exported QDBench */
// eslint-disable-next-line no-var -- a window property: probe.js reads it
var QDBench = (function () {
	'use strict';
	// BENCH_SHARED.TIME_DIGITS: this script runs before shared.js loads (and should be the page's very first)
	const TIME_DIGITS = 1;
	const now = () => +performance.now().toFixed(TIME_DIGITS);
	const marks = { earlyScript: now() }; // the page's first script runs: everything before it is Firefox's
	requestAnimationFrame(() => { marks.firstFrame = now(); }); // the first frame Firefox draws for the page
	document.addEventListener('DOMContentLoaded', () => { marks.domContentLoaded = now(); });
	window.addEventListener('load', () => { marks.load = now(); });
	return { marks, now };
})();
