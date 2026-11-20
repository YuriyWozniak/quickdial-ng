// Splits each new tab's load of the dial, in a Firefox Profiler recording (startup.js --newtabs <n> --gecko-profile),
// into the steps Firefox takes before the dial's own code runs, and prints how long each took: medians over the new
// tabs, with the start tab left out. Times are ms from the tab's navigation start. The profiler slows Firefox down,
// so compare the steps with each other, or with another recording, rather than with startup.js's own timings.
'use strict';
const { fail, parseArgs, ARG, computeMedian, roundTime } = require('./lib');
const { PHASE, PARENT_PROCESS, readGeckoProfile, forEachMarker } = require('./gecko-profile');

const USAGE = `Usage: node newtab-phases.js <profile.json> [options]
  --tabs   one line per new tab too
  --busy   what kept Firefox's main process busy while each new tab waited for it
  --json   each new tab's step times as a JSON line, instead of the table`;

const DIAL_PAGE = 'dial.html';
const MAIN_THREAD = 'GeckoMain';
const EXTENSION_PROCESS = 'WebExtensions'; // the process extension pages run in
const SIDE = Object.freeze({ parent: 'parent', extension: 'extension' });
const MARKER = Object.freeze({
	firstPaint: 'FirstNonBlankPaint', // an interval from navigation start to the page's first paint
	domEvent: 'DOMEvent', ipc: 'IPC', refreshDriver: 'nsRefreshDriver', parser: 'HTMLParserTreeOps', script: 'ScriptExecution',
	syncMessage: 'PBrowser::Msg_SyncMessage' // the extension API setup asks the main process for the tab's details
});
const MESSAGE = Object.freeze({
	loadUri: 'PContent::Msg_LoadURI', documentChannel: 'PDocumentChannelConstructor', destroyBrowser: 'PBrowser::Msg_Destroy',
	resumeLoad: 'ResumeLoad', redirectToRealChannel: 'RedirectToRealChannel'
});
const EVENT = Object.freeze({ tabOpen: 'TabOpen', domContentLoaded: 'DOMContentLoaded' });
const IPC_ENDPOINT = 'endpoint', IPC_SENDING = 'sending', IPC_RECEIVING = 'receiving';
const LOOK_BEFORE_MS = 15; // a new tab's first steps happen just before its navigation starts
const LOOK_AFTER_PAINT_MS = 5;
const CLOCK_SLACK_MS = 2; // two processes' times of the same moment can differ by this much
const BUSY_MIN_MS = 1; // --busy lists the main process's markers at least this long
const BUSY_IGNORED = /^(Marionette|browser\.tabs\.opening|RefreshObserver|AsyncShutdown|Awake)/; // the benchmark's own, or spans of the others
const BUSY_TEXT_WIDTH = 50;
const LABEL_WIDTH = 64, VALUE_WIDTH = 7, TAB_VALUE_WIDTH = 8;

// What each phase measures, from the step times found below. A phase whose steps are missing is null.
const difference = (later, earlier) => later == null || earlier == null ? null : later - earlier;
const PHASES = [
	['1', 'the page waits for the main process, still opening the tab', steps => difference(steps.channelReceived, steps.channelSent)],
	['2', 'main process opens the page and replaces the tab\'s first page', steps => difference(steps.loadResumed, steps.channelReceived)],
	['3', 'new page and document made in the extension process', steps => difference(steps.documentCreated, steps.loadResumed)],
	['4', 'extension API setup waits for the main process again', steps => difference(steps.syncMessageAnswered, steps.syncMessageSent)],
	['5', 'the rest of the way to the first script', steps => {
		const total = difference(steps.firstScript, steps.documentCreated), syncWait = PHASES[3][2](steps);
		return total == null ? null : total - (syncWait || 0);
	}],
	['6', 'the dial\'s scripts, layout and first paint', steps => difference(steps.firstPaint, steps.firstScript)],
	['=', 'navigation start to first script', steps => difference(steps.firstScript, steps.navigationStart)],
	['=', 'navigation start to first paint', steps => difference(steps.firstPaint, steps.navigationStart)]
];

const parsedArgs = parseArgs(process.argv.slice(2), { tabs: ARG.bool, busy: ARG.bool, json: ARG.bool }, USAGE);
const [profilePath] = parsedArgs.positional;
if (!profilePath) fail(USAGE);

// The main threads' markers of the main process and the extension process, in time order
const markers = [];
let side = null;
forEachMarker(readGeckoProfile(profilePath), marker => {
	marker.side = side;
	markers.push(marker);
}, (thread, processName) => {
	side = processName === PARENT_PROCESS ? SIDE.parent : processName === EXTENSION_PROCESS ? SIDE.extension : null;
	return thread.name === MAIN_THREAD && side != null;
});
markers.sort((a, b) => a.time - b.time);

const dataText = (marker, key) => String(marker.data && marker.data[key]);
const isIpc = (marker, markerSide, direction, messageType) => marker.side === markerSide && marker.name === MARKER.ipc && marker.data
	&& marker.data.phase === IPC_ENDPOINT && marker.data.direction === direction && dataText(marker, 'messageType').includes(messageType);
const isDomEvent = (marker, markerSide, eventType) => marker.side === markerSide && marker.name === MARKER.domEvent && dataText(marker, 'eventType') === eventType;
const isOnExtension = (marker, name) => marker.side === SIDE.extension && marker.name === name;

// When each step of one load happened (absolute times; null when the recording doesn't show it). Each step is
// looked for after the one it follows, because the same messages go by for other tabs and pages too.
function findSteps(load) {
	const navigationStart = load.start, earliest = navigationStart - LOOK_BEFORE_MS;
	const nearby = markers.filter(marker => marker.time >= earliest && marker.time <= load.end + LOOK_AFTER_PAINT_MS);
	const findFirst = (test, after = earliest) => { // null when the step it follows wasn't found
		if (after == null) return null;
		const found = nearby.find(marker => marker.time >= after && test(marker));
		return found ? found.time : null;
	};
	const steps = { navigationStart };
	steps.tabOpen = findFirst(marker => isDomEvent(marker, SIDE.parent, EVENT.tabOpen));
	steps.loadUriSent = findFirst(marker => isIpc(marker, SIDE.parent, IPC_SENDING, MESSAGE.loadUri));
	steps.channelSent = findFirst(marker => isIpc(marker, SIDE.extension, IPC_SENDING, MESSAGE.documentChannel), navigationStart - CLOCK_SLACK_MS);
	steps.channelReceived = findFirst(marker => isIpc(marker, SIDE.parent, IPC_RECEIVING, MESSAGE.documentChannel), steps.channelSent);
	steps.browserReplaced = findFirst(marker => isIpc(marker, SIDE.parent, IPC_SENDING, MESSAGE.destroyBrowser), steps.channelReceived);
	steps.loadResumed = findFirst(marker => isIpc(marker, SIDE.parent, IPC_SENDING, MESSAGE.resumeLoad)
		|| isIpc(marker, SIDE.parent, IPC_SENDING, MESSAGE.redirectToRealChannel), steps.channelReceived);
	steps.documentCreated = findFirst(marker => isOnExtension(marker, MARKER.refreshDriver) && dataText(marker, 'name').includes(DIAL_PAGE));
	steps.parserStarted = findFirst(marker => isOnExtension(marker, MARKER.parser), steps.documentCreated);
	steps.syncMessageSent = findFirst(marker => isOnExtension(marker, MARKER.syncMessage) && marker.phase === PHASE.intervalStart, steps.documentCreated);
	steps.syncMessageAnswered = findFirst(marker => isOnExtension(marker, MARKER.syncMessage) && marker.phase === PHASE.intervalEnd, steps.syncMessageSent);
	steps.firstScript = findFirst(marker => isOnExtension(marker, MARKER.script), steps.documentCreated);
	steps.domContentLoaded = findFirst(marker => isDomEvent(marker, SIDE.extension, EVENT.domContentLoaded), steps.documentCreated);
	steps.firstPaint = load.end;
	return steps;
}

// The main process's longer markers while the page waited for it (phase 1)
function findBusyMarkers(steps) {
	if (steps.channelSent == null || steps.channelReceived == null) return [];
	return markers.filter(marker => marker.side === SIDE.parent && marker.phase === PHASE.interval && marker.end - marker.start >= BUSY_MIN_MS
		&& marker.start >= steps.channelSent && marker.start < steps.channelReceived && !BUSY_IGNORED.test(marker.name));
}

const relativeTo = (time, origin) => time == null ? null : roundTime(time - origin);
const formatTime = ms => ms == null ? '-' : roundTime(ms).toFixed(1);

// Each load of the dial; a new tab is one that Firefox opened just before (the start tab wasn't)
const loads = markers.filter(marker => marker.side === SIDE.extension && marker.name === MARKER.firstPaint
	&& marker.phase === PHASE.interval && dataText(marker, 'name').includes(DIAL_PAGE));
const newTabs = loads.map(findSteps).filter(steps => steps.tabOpen != null);
if (!newTabs.length) fail(`No new tab with ${DIAL_PAGE} in ${profilePath} (${loads.length} loads of it in all). Record one with startup.js --newtabs <n> --gecko-profile <file>.`);

if (parsedArgs.json) {
	for (const steps of newTabs) {
		const relative = {};
		for (const [name, time] of Object.entries(steps)) relative[name] = relativeTo(time, steps.navigationStart);
		console.log(JSON.stringify(relative));
	}
	process.exit(0);
}

console.log(`${profilePath}: ${newTabs.length} new tabs (start tab left out), ms from navigation start`);
console.log(''.padEnd(LABEL_WIDTH + 3) + 'median'.padStart(VALUE_WIDTH) + '   min-max');
for (const [number, label, measure] of PHASES) {
	const values = newTabs.map(measure).filter(value => value != null);
	const range = values.length ? `${formatTime(Math.min(...values))}-${formatTime(Math.max(...values))}` : '';
	const missing = values.length < newTabs.length ? ` (${newTabs.length - values.length} tabs without it)` : '';
	console.log(`${number}  ${label.padEnd(LABEL_WIDTH)}${formatTime(computeMedian(values)).padStart(VALUE_WIDTH)}   ${range}${missing}`);
}

if (parsedArgs.tabs) {
	const heading = 'Per new tab:';
	console.log('\n' + heading + PHASES.map(([number]) => number.padStart(TAB_VALUE_WIDTH)).join(''));
	newTabs.forEach((steps, index) => console.log(`tab ${index + 1}:`.padEnd(heading.length)
		+ PHASES.map(([, , measure]) => formatTime(measure(steps)).padStart(TAB_VALUE_WIDTH)).join('')));
}

if (parsedArgs.busy) {
	console.log('\nThe main process while each new tab waited for it (phase 1): start+duration, name');
	newTabs.forEach((steps, index) => {
		console.log(`tab ${index + 1}:`);
		for (const marker of findBusyMarkers(steps)) {
			const detail = marker.data && (marker.data.name || marker.data.eventType) || '';
			console.log(`  ${formatTime(marker.start - steps.navigationStart)}+${formatTime(marker.end - marker.start)} ${marker.name} ${String(detail).slice(0, BUSY_TEXT_WIDTH)}`);
		}
	});
}
