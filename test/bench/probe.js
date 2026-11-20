// Quick Dial NG benchmark: new tab side, right after js/dial.js (build.js puts it there). Notes when the settings are
// applied, the grid is drawn, all tile pictures are set and decoded and the page has painted, then sends early.js's
// and its own times to seed.js. Times are ms since the tab's navigation started.
// It follows the page with a MutationObserver and never polls: a busy timer here would hold up the page it measures.
(function(){
	'use strict';
	const REPORT_TIMEOUT_MS = 5000; // report anyway when not every picture shows up (a broken build)
	const PICTURE_URL = /url\("?(data:[^")]+)/;

	const expected = +new URL(location.href).searchParams.get('tiles') || 0; // tile pictures to wait for (seed.js says)
	const bench = window.QDBench || { marks: {}, now: () => +performance.now().toFixed(1) };
	const marks = bench.marks, now = bench.now;
	const mark = key => { if(!(key in marks)) marks[key] = now(); };
	const wrap = (obj, name, key) => { // marks the first call of obj[name]
		if(!obj || typeof obj[name] != 'function') return;
		const fn = obj[name];
		obj[name] = function(){ const r = fn.apply(this, arguments); mark(key); return r; };
	};
	wrap(window.app && window.app.Settings, '_changed', 'settingsApplied');
	wrap(window.dial, 'populateGrid', 'gridPopulated');

	const panels = () => [...document.querySelectorAll('td > a')].map(a => a.firstElementChild).filter(Boolean); // each tile's picture
	const hasPicture = p => p.style.backgroundImage.indexOf('data:image') >= 0;
	let reported = false;
	const observer = new MutationObserver(check);
	observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
	document.addEventListener('DOMContentLoaded', check);
	const timeout = setTimeout(() => { marks.timedOut = true; report(); }, REPORT_TIMEOUT_MS);

	function check(){
		if(reported || 'imagesSet' in marks) return;
		if(!expected){ if('gridPopulated' in marks){ observer.disconnect(); afterPaint(); } return; }
		if(panels().filter(hasPicture).length < expected) return;
		mark('imagesSet');
		observer.disconnect();
		afterPaint();
	}
	function afterPaint(){ // two frames later the drawn grid is on screen
		requestAnimationFrame(() => requestAnimationFrame(() => { mark('painted'); decoded().then(report); }));
	}
	// When the pictures are decoded at the latest. Asked only after the paint: decoding copies of them earlier would
	// compete with the page's own first paint. By now Firefox has usually decoded them, so this resolves at once.
	function decoded(){
		const urls = panels().map(p => (p.style.backgroundImage.match(PICTURE_URL) || [])[1]).filter(Boolean);
		if(!urls.length) return Promise.resolve();
		return Promise.all(urls.map(u => { const img = new Image(); img.src = u; return img.decode().catch(() => {}); }))
			.then(() => { mark('imagesDecoded'); });
	}
	function report(){
		if(reported) return;
		reported = true;
		observer.disconnect();
		clearTimeout(timeout);
		const send = () => {
			for(const e of performance.getEntriesByType('paint')) marks[e.name.replace(/-(\w)/g, (m, c) => c.toUpperCase())] = +e.startTime.toFixed(1);
			marks.timeOrigin = performance.timeOrigin; // seed.js turns it into openToOrigin
			browser.runtime.sendMessage({ benchDial: marks });
		};
		if(document.readyState == 'complete') send(); else window.addEventListener('load', send);
	}
})();
