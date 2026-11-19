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

Each suite prints a `PASS`/`FAIL` line per check (a failure also shows what it got). A suite also fails on a script error in its pages. The run ends with `ALL PASS` (exit code 0) or `SOME FAILED` (exit code 1).

## Integration suites

| Suite | Covers |
|---|---|
| `startup` | A fresh install; migration of the original Quick Dial's data (version 4, inline PNG screenshots) to separate WebP pictures; restarts that write nothing; obsolete settings (`startpageTimeout`, the toolbar switch before 0.5.0) dropped and saved once; a profile without the Quick Dial folder. |
| `sync` | Bookmark changes inside the Quick Dial folder are synced (rename, new address, delete, folder removed, created, moved in, out and within); changes elsewhere are ignored; pictures go with their tiles; gaps are kept and filled. |
| `backup` | Export and import into an empty profile; an original Quick Dial export from another profile (bookmarks matched or created, cell positions, settings defaults, obsolete fields); importing twice creates nothing; themes in backups; unsafe style values cleaned. |
| `themes` | Custom themes saved, cleaned and reloaded; in Settings › Themes, **Use** fills the form, **Apply** puts the theme on the dial (layout and background picture kept), the dial draws it, Classic brings the original look back. |
| `settings-page` | Settings sections (`?tab=`), **Apply**, **Discard changes**, **Ctrl+S**, changes made elsewhere; the background picture; Backup: export, import (asks first, wrong files explained), the export snippet; Themes: save (built-in names refused, same name replaced after asking), export, import, delete. |
| `dial` | Tiles and their pictures; the background colour painted before the background page is ready; folders and the Back tile; pages (Page Down, mouse wheel); drag and drop. |
| `dial-edit` | The dial's context menu commands: new bookmark (address checked) and folder, delete, refresh, capture, properties; dialogs by keyboard; the Settings items. |
| `properties` | The Properties popup: title, address (required), locks, fit, a picture from a file, by drop or paste, Revert, a folder's "Use default"; OK, Apply, Cancel, Enter and Escape. |
| `toolbar-menus` | The toolbar button (Settings, the dial in a new tab or this tab); bringing an open Settings tab forward; every context menu item; "Add to Quick Dial" turned off. |
| `messages` | Every message the pages send to the background page: settings, tiles (read, update, swap, create, delete, refresh), pictures, backups, themes, another root folder. |
| `siteinfos` | Refresh draws the downloaded page in a sandboxed frame (its scripts never run; other addresses aren't downloaded); Capture page in a background tab (title, picture, locked title or picture kept, folders, failures). |

## Files

| File | Purpose |
|---|---|
| `run.js` | Runs the integration suites: copies `src/` to a temporary folder, serves it over a local HTTP server, starts the browser, and gives each suite a fresh page. |
| `integration/*.js` | One suite per area: `module.exports = { title, run(t) }`. |
| `lib/harness.js` | What suites use through `t`: `check`, `J` (run code in the host page), `waitFor` (wait for a condition there), `loadBg`, `idle`, `loadDial`, `loadSettings`, `inDial`, `answer` (a dialog), `download`. Also used by the screenshot maker. |
| `lib/fixtures.js` | Shared test data and stand-ins: the bookmarks, original Quick Dial data, pictures, settings changes, a recording tabs API, a stand-in for Firefox's `drawWindow`, local web pages. |
| `lib/coverage.js` | Coverage for `--coverage` (V8's, from the browser and from Node). |
| `mock.js` | The simulated Firefox API (`storage.local`, `bookmarks`, `runtime` messaging, `tabs`, `contextMenus`, …) shared by every frame. State lives in the host page as `S`: storage, the bookmark tree, listeners, logs of storage writes and removals, and the menu items. It mirrors Firefox where it matters: e.g. a new folder comes without `children`, and a missing bookmark id rejects. |
| `index.html` | The host page: loads `mock.js` and provides `loadFrame()` (opens an extension page in a frame; replacing a frame removes its listeners, which simulates a restart), `bg()`, `win()` and `bgIdle()`. |
| `unit/*.test.js` | The unit tests; `unit/load.js` loads scripts from `src/js` into a sandbox with a minimal fake of the API. |

## Writing tests

- Code passed to `t.J`, `t.waitFor` and `t.inDial` runs in the browser, not in Node: it can't use the suite's variables; pass what it needs as the argument.
- Wait for what you expect, not for a fixed time: `await t.idle()` after a change in the background page, `await t.waitFor('what', () => condition)` for anything else. A fixed pause is only right where the check is that something does *not* happen within a time.
- Outside web sites are never contacted: any address other than the test server answers with a stub page titled with its host.
- Logic that needs no page belongs in a unit test.
