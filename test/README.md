# Tests

Functional tests for Quick Dial NG's storage, sync and import logic, plus performance benchmarks in [`bench/`](bench/README.md) and the README screenshot maker in [`screenshots/`](screenshots/README.md), which reuses this harness.

The functional tests don't need Firefox. They load the extension's own pages from `src/` in Chromium (through Playwright) and replace the Firefox WebExtension API with a simulation, so they run anywhere Node.js runs.

Once, in this folder:

```
npm install
npx playwright install chromium
```

The second command downloads Playwright's own Chromium (about 150 MB, into a per-user cache). It can be skipped where Microsoft Edge or Google Chrome is installed: if Playwright's Chromium is missing, the tests use one of those instead.

Then, from the repository root:

```
node test/test-storage.js
```

(or `npm test` in this folder).

The script prints a `PASS`/`FAIL` line per check. It ends with `ALL PASS` (exit code 0) or `SOME FAILED` (exit code 1).

## Files

| File | Purpose |
|---|---|
| `test-storage.js` | The test runner. Copies `src/` to a temporary folder and serves it over a local HTTP server. Loads `bg.html` (the background page) and the dial and settings pages into frames of `index.html`, then works through phases A–P (below). Deletes the temporary folder when done. |
| `mock.js` | A simulated Firefox WebExtension API (`storage.local`, `bookmarks`, `runtime` messaging, `tabs`, `contextMenus`, …) shared by every frame. State lives in the top window: storage contents, bookmark tree, listeners and a log of storage writes and removals, so the tests can check exactly what was written. It mirrors Firefox's real behaviour where it matters, e.g. `bookmarks.create` returns a new folder without `children`. |
| `package.json` | The tests' only dependency, Playwright. `npm test` runs the tests, `npm run bench` the [extension benchmark](bench/README.md) and `npm run screenshots` the [screenshot maker](screenshots/README.md). |
| `index.html` | The host page. Loads `mock.js` and provides `loadFrame()`, which opens an extension page (background, dial, settings) in an iframe. Reloading a frame removes its old listeners, which simulates a restart. |

## Test phases in `test-storage.js`

| Phase | Checks |
|---|---|
| A | A fresh install creates default settings. |
| B | Data from the original Quick Dial (version 4, screenshots stored inline as PNG) is migrated: pictures move to their own `img_<id>` keys as WebP, and the stored size shrinks. |
| C | A restart with nothing changed writes nothing to storage. |
| D | Bookmark changes outside the Quick Dial folder are ignored; changes inside it trigger a sync. |
| E | The dial page shows pictures for the visible tiles. |
| F | Export, then import into a fresh profile, restores tiles and pictures. |
| G | Deleting a tile removes its picture; changing a tile's URL drops the old picture. |
| H | Removing a whole folder removes the pictures of everything inside it. |
| I | Importing an original Quick Dial export whose bookmark IDs don't exist here rebuilds the bookmarks and keeps cell positions. |
| J | Importing the same export again creates nothing new. |
| K | The import entry points in the UI exist and work. |
| L | The dial shows an updated picture after a refresh or capture. |
| M | A brand-new profile without a Quick Dial folder creates it and keeps syncing. |
| N | The background colour is remembered for the dial page and updated when settings change. While the background page is still loading, the dial shows that colour and waits; it draws once the background page is ready, with no duplicate retry. |
| O | The old start page timer setting (`startpageTimeout`, before 0.3.5) is removed from stored settings on the next start, saved once, and the start after that writes nothing. Imports drop it too (phase I). |
| P | Themes: style settings added in 0.4.0 start at their Classic values; custom themes are cleaned (built-in names, duplicates, broken entries), saved and reloaded; theme files round-trip, and unsafe or invalid values (`url()` in gradients, CSS in font names, out-of-range numbers) are replaced; backups carry themes and their import cleans style values. In Settings › Themes, **Use** fills the form without touching the dial, **Apply** puts Anori on the dial (gradient, glass, shadow, title over the picture) and keeps rows, columns, tile shape and picture; Classic brings the original look back. |
