# Tests

Two kinds of tests, plus performance benchmarks in [`bench/`](bench/README.md) and the README screenshot maker in [`screenshots/`](screenshots/README.md):

- **Unit tests** (`unit/`) check the logic on its own: theme rules and files, upgrades of stored data, the tile tree and its sync with the bookmarks, backup helpers, pictures. They load the extension's scripts from `src/js` into plain Node (`node:test`, no browser) and run in about a second. They need nothing installed.
- **Integration tests** (`integration/`) run the extension's real pages in Chromium (through Playwright) against a simulated Firefox WebExtension API, so they run anywhere Node.js runs, without Firefox. Each suite covers one area and starts from a fresh profile, so any of them can run alone.

## Running them

The unit tests, from the repository root or this folder:

```
npm run test:unit
```

For the integration tests, once, in this folder:

```
npm install
npx playwright install chromium
```

The second command downloads Playwright's own Chromium (about 150 MB, into a per-user cache). It can be skipped where Microsoft Edge or Google Chrome is installed: the tests then use one of those.

Then, in this folder:

| Command | Runs |
|---|---|
| `npm test` | the unit tests, then all integration suites |
| `npm test -- dial sync` | the unit tests, then only the `dial` and `sync` suites |
| `npm run test:integration` | all integration suites (`node run.js`) |
| `node run.js --list` | lists the suites |
| `node run.js --jobs 1` | one suite at a time (by default up to four run at once) |
| `npm run coverage` | all of it, then which lines of `src/js` ran, per file, with the functions that never ran |

Each suite prints a `PASS`/`FAIL` line per check (a failure also shows what it got). A suite also fails on a script error in its pages (its last check, `no script errors`). `FAIL suite stopped: …` means a step could not go on, usually `timed out waiting for <what>`: the checks after it in that suite didn't run, and the other suites are unaffected. The run ends with `ALL PASS` (exit code 0) or `SOME FAILED` (exit code 1).

The unit tests print Node's test report; `node --test --test-reporter=spec "unit/*.test.js"` lists every test by name.

## Integration suites

Each suite file starts with a comment that says what it covers, what it starts from, how its steps build on each other, and which other suite or unit test covers the rest. Its steps are grouped under `// ----- … -----` headings.

| Suite | Covers |
|---|---|
| `startup` | A fresh install; migration of the original Quick Dial's data (version 4, inline PNG screenshots) to separate WebP pictures; restarts that write nothing; obsolete settings (`startpageTimeout`, the toolbar switch before 0.5.0) dropped and saved once; a profile without the Quick Dial folder. |
| `sync` | Bookmark changes inside the Quick Dial folder are synced (rename, new address, delete, folder removed, created, moved in, out and within); changes elsewhere are ignored; pictures go with their tiles; gaps are kept and filled. |
| `backup` | Export and import into an empty profile; an original Quick Dial export from another profile (bookmarks matched or created, cell positions, settings defaults, obsolete fields); importing twice creates nothing; themes in backups; unsafe style values cleaned; the background picture inline in backups and under its own key in storage. |
| `themes` | Custom themes saved, cleaned and reloaded; in Settings › Themes, **Use** fills the form, **Apply** puts the theme on the dial (layout and background picture kept), the dial draws it, Classic brings the original look back. |
| `settings-page` | Settings sections (`?tab=`), **Apply**, **Discard changes**, **Ctrl+S**, changes made elsewhere; the background and folder pictures (stored as WebP, large ones made smaller); Backup: export, import (asks first, wrong files explained), the export snippet; Themes: save (built-in names refused, same name replaced after asking), export, import, delete. |
| `dial` | Tiles and their pictures; the background colour painted before the background page is ready; folders and the Back tile; pages (Page Down, mouse wheel); drag and drop. |
| `dial-edit` | The dial's context menu commands: new bookmark (address checked) and folder, delete, refresh, capture, properties; dialogs by keyboard; the Settings items. |
| `properties` | The Properties popup: title, address (required), locks, fit, a picture from a file, by drop or paste, Revert, a folder's "Use default"; OK, Apply, Cancel, Enter and Escape. |
| `toolbar-menus` | The toolbar button (Settings, the dial in a new tab or this tab); bringing an open Settings tab forward; every context menu item; "Add to Quick Dial" turned off. |
| `messages` | Every message the pages send to the background page: settings, tiles (read, update, swap, create, delete, refresh), pictures, backups, themes, another root folder. |
| `siteinfos` | Refresh draws the downloaded page in a sandboxed frame (its scripts never run; other addresses aren't downloaded); Capture page in a background tab (title, picture, locked title or picture kept, folders, failures, a tile already loading). |

## Unit tests

Each file starts with a comment on what it tests and how; every test's name says what it checks.

| File | Tests | Covers |
|---|---|---|
| `themes.test.js` | `js/themes.js` | The style rules: numbers kept in range and rounded, colours, fonts and gradients checked (no `url()`, nothing that ends a CSS declaration); extract / apply / complete; theme files (round trip, what's wrong with a file); the custom theme list; file names; CSS helpers. |
| `settings.test.js` | `js/background/settings.js` | Defaults; the toolbar setting before and after 0.5.0; upgrades of the original Quick Dial's data (versions 1 to 4); the first start of a new profile; obsolete settings saved once, then nothing written; batched saving without transient fields; reads and writes that fail (tried again; stored data never replaced by the defaults); pictures picked in Settings under their own keys (written only when changed, moved out of older settings once, a missing one replaced by the default); the custom theme list. |
| `gridnodes.test.js` | `js/background/gridnodes.js` | Sync with the bookmarks folder (order, gaps kept and filled, the end trimmed, pictures dropped, a sync asked for during a sync, bookmarks that can't be read, a missing or absolute root folder); finding nodes; swapping cells; new bookmarks and folders; deleting; Refresh and Capture page one at a time per tile; a new address in Properties refreshed before its bookmark is updated. |
| `background.test.js` | `js/common.js`, `js/background/backup.js`, `images.js`, `bookmarks.js` | Unique command numbers; picture modes and CSS values; the pages' message client (fields sent, failures, listening); backup copies and default merging; linking imported tiles to bookmarks (by id, address, folder name, or new); picture values, storage and cache; which bookmark events count; listening again after our own changes. |
| `locales.test.js` | `_locales/*/messages.json` | Every text the pages and scripts name (`data-i18n*`, `__MSG_*__`, `text()`, `countText()`, theme name and description keys, errors that carry a key) is in English, and every English text is used; every language has every English text with the same `$1`..`$9` and `<b>`/`<code>`/`<br>`, and every plural form its language needs. |

`unit/load.js` loads scripts from `src/js` into a sandbox, the way a page shares its globals, with a small fake of the API: storage in memory and a bookmark tree, plus a log of the calls that change something.

## Test data

Most integration suites start from `freshProfile` (`lib/fixtures.js`): the background page started on these bookmarks.

```
Bookmarks Menu
├─ Quick Dial (qd)       the dial's folder
│  ├─ Site 1 … Site 6    b1 … b6, https://site1.example/ …
│  └─ Folder (f1)
│     └─ Site 7          b7
└─ Other (other)         not the dial's: changes here must be ignored
```

So the dial starts with 7 tiles: b1–b6, then the folder. Checks name tiles by these bookmark ids (`'-'` is an empty cell). Some suites add pictures to every tile first (`makeVersion4`, data as the original Quick Dial stored it).

No test reaches the internet: an address other than the test server gets a stub page titled with its host, so a tile that fetches its site (Refresh) is named `site1.example` and so on. `sitePage()` serves a local page where the page's content matters. Chromium can't draw a page into a picture the way Firefox's `drawWindow` does; suites that need tile pictures from pages use `stubDrawWindow`.

## Files

| File | Purpose |
|---|---|
| `run.js` | Runs the integration suites: copies `src/` to a temporary folder, serves it over a local HTTP server, starts the browser, and gives each suite a fresh page. |
| `integration/*.js` | One suite per area: `module.exports = { title, run(t) }`. |
| `lib/harness.js` | What suites use through `t` (each method is described there): `check`, `same`, `log`; `J` (run code in the host page), `waitFor` (wait for a condition there); `loadBg`, `idle`, `loadDial`, `loadSettings`; `frame`, `inFrame`, `inDial`, `dial` (a page's frame); `answer` (a dialog), `download`. Also used by the screenshot maker. |
| `lib/fixtures.js` | Shared test data and stand-ins: the bookmarks, original Quick Dial data, pictures, settings changes, a recording tabs API, a stand-in for Firefox's `drawWindow`, local web pages. |
| `lib/coverage.js` | Coverage for `--coverage` (V8's, from the browser and from Node). |
| `mock.js` | The simulated Firefox API (`storage.local`, `bookmarks`, `runtime` messaging, `tabs`, `contextMenus`, …) shared by every frame. State lives in the host page as `S`: storage, the bookmark tree, listeners, logs of storage writes and removals, and the menu items. It mirrors Firefox where it matters: e.g. a new folder comes without `children`, and a missing bookmark id rejects. |
| `index.html` | The host page: loads `mock.js` and provides `loadFrame()` (opens an extension page in a frame; replacing a frame removes its listeners, which simulates a restart), `bg()`, `win()` and `bgIdle()`. |
| `unit/*.test.js` | The unit tests; `unit/load.js` loads scripts from `src/js` into a sandbox with a minimal fake of the API. |

## Writing tests

Logic that needs no page belongs in a unit test; what needs the pages, their events or the browser goes in the integration suite for its area. A new area gets a new file in `integration/`; `run.js` finds it by itself. Start from this:

```js
// <What it covers> (<source files>): <one or two lines>.
//
// Starts from: <freshProfile, or what else, and the stand-ins used>.
// The steps build on each other: <what each step leaves for the next one>.
// Related: <the suites or unit tests that cover the rest>.
'use strict';
const { freshProfile } = require('../lib/fixtures');

module.exports = {
	title: '<shown in the report and by --list>',
	async run(t) {
		await freshProfile(t);

		// ----- <a group of steps> -----
		await t.J(() => bg().browser.bookmarks.update('b1', { title: 'Renamed' }));
		await t.idle();
		const st = await t.J(() => S.storage.node.children[0].title);
		t.check('a renamed bookmark renames its tile', st === 'Renamed', st);
	}
};
```

- Name a check by what should be true, as a statement ("a renamed bookmark renames its tile"); pass what you got as the third argument, so a failure shows it.
- Code passed to `t.J`, `t.waitFor` and `t.inDial` runs in the browser, not in Node: it can't use the suite's variables; pass what it needs as the argument.
- Wait for what you expect, not for a fixed time: `await t.idle()` after a change in the background page, `await t.waitFor('what', () => condition)` for anything else. A fixed pause is only right where the check is that something does *not* happen within a time.
- When a step changes what later steps see, say so in the file's comment.
- Run `npm run check` at the top of the repository: ESLint checks the test code too.
