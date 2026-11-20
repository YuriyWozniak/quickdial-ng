// Summarizes startup.js results: medians per results file (one label each), warm-up launches excluded.
// Usage: node startup-report.js <results.jsonl> [more.jsonl ...]
'use strict';
const fs = require('fs');
const { fail, computeMedian, parseArgs } = require('./lib');

const USAGE = 'Usage: node startup-report.js <results.jsonl> [more.jsonl ...]';
const LABEL_WIDTH = 32, ID_WIDTH = 38, NUMBER_WIDTH = 5;
const FIRST_CONTENTFUL_PAINT = 'first-contentful-paint';
// Firefox's per-extension timings, cumulative across launches of a profile: [total ms, count]. The storage reads are
// reported as a total per launch, the others per occurrence.
const EXTENSION_TIMINGS = { startup: 'startup', backgroundLoad: 'background page load', storageRead: 'storage.local reads (total)' };
const TOTAL_TIMINGS = ['storageRead'];

const resultFiles = parseArgs(process.argv.slice(2), {}, USAGE).positional;
if (!resultFiles.length) fail(USAGE);
const formatMs = ms => ms == null ? '-' : String(Math.round(ms));
const printLine = (label, ms, note) => console.log(label.padEnd(LABEL_WIDTH), formatMs(ms), note || '');
const tryRead = (read, item) => {
	try { return read(item); } catch (e) { return null; }
};

// Per-launch extension timings from the cumulative pairs of consecutive launches
function computeExtensionTimings(launches) {
	const perLaunch = {};
	for (let i = 1; i < launches.length; i++) {
		if (launches[i].warmup) continue;
		const current = launches[i].extensionTimings || {}, previous = launches[i - 1].extensionTimings || {};
		for (const id in current) {
			for (const key in current[id]) {
				const [total, count] = current[id][key];
				const [previousTotal, previousCount] = (previous[id] && previous[id][key]) || [0, 0];
				if (count <= previousCount) continue;
				const value = TOTAL_TIMINGS.includes(key) ? total - previousTotal : (total - previousTotal) / (count - previousCount);
				((perLaunch[id] = perLaunch[id] || {})[key] = perLaunch[id][key] || []).push(value);
			}
		}
	}
	return perLaunch;
}

for (const resultFile of resultFiles) {
	const launches = fs.readFileSync(resultFile, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)).filter(launch => !launch.done);
	if (!launches.length) continue;
	const label = launches[0].label, measured = launches.filter(launch => !launch.warmup && !launch.error);
	const medianOf = read => computeMedian(measured.map(launch => tryRead(read, launch)));
	const medianOfLaterTabs = read => computeMedian(measured.flatMap(launch => (launch.newTabsLater || []).map(tab => tryRead(read, tab))));
	console.log(`\n== ${label}: ${measured.length} launches (warm-up excluded)`);
	printLine('Firefox window first paint', medianOf(launch => launch.startup.firstPaint2 || launch.startup.firstPaint), 'ms after process start');
	printLine('Session restored', medianOf(launch => launch.startup.sessionRestored));
	printLine('Start tab: page load began', medianOf(launch => launch.startTab.timeOriginSinceProcess), (measured[0].startTab || {}).url || '');
	printLine('Start tab: page painted', medianOf(launch => launch.startTab.paintedSinceProcess));
	printLine('New tab: open to page load', medianOf(launch => launch.newTab.openToTimeOriginMs), 'ms; the rest is since the page started loading');
	printLine('New tab: first contentful paint', medianOf(launch => launch.newTab.paint[FIRST_CONTENTFUL_PAINT]), (measured[0].newTab || {}).url || '');
	printLine('New tab: pictures set', medianOf(launch => launch.newTab.imagesSet));
	if (measured.some(launch => launch.newTabsLater)) {
		printLine('Later new tabs: open to load', medianOfLaterTabs(tab => tab.openToTimeOriginMs), 'ms (median of every new tab after the first)');
		printLine('Later new tabs: first paint', medianOfLaterTabs(tab => tab.paint[FIRST_CONTENTFUL_PAINT]));
		printLine('Later new tabs: pictures set', medianOfLaterTabs(tab => tab.imagesSet));
	}
	const perLaunch = computeExtensionTimings(launches);
	console.log('Per extension (median per launch, ms): ' + Object.values(EXTENSION_TIMINGS).join(' | '));
	const byBackgroundLoad = (a, b) => (computeMedian(perLaunch[b].backgroundLoad || []) || 0) - (computeMedian(perLaunch[a].backgroundLoad || []) || 0);
	for (const id of Object.keys(perLaunch).sort(byBackgroundLoad)) {
		const columns = Object.keys(EXTENSION_TIMINGS).map(key => formatMs(computeMedian(perLaunch[id][key] || [])).padStart(NUMBER_WIDTH));
		console.log('  ' + id.padEnd(ID_WIDTH), columns.join(' | '));
	}
}
