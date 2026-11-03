# Screenshots

Makes the pictures in the repository's [`screenshots/`](../../screenshots/) folder, which the main README shows.

Like the tests, it doesn't need Firefox. It runs the extension's own pages from `src/` in Chromium (Playwright), against the simulated Firefox API of the test harness ([`../mock.js`](../mock.js)), so the screenshots always show the current code.

## Run

Once, in the `test` folder: `npm install` (see [test/README.md](../README.md)). Then, in the `test` folder:

```
npm run screenshots
```

or `node screenshots/make-screenshots.js --out <folder>` to write somewhere else. It overwrites the PNG files in the output folder, prints each file name as it saves it, and ends with `Done` (exit code 0), or with the page errors it saw (exit code 1). A run takes about a minute.

## What it makes

| File | Shows |
|---|---|
| `dial-classic.png` | The dial in the Classic theme, a tile hovered |
| `dial-anori.png` | The dial in the Anori theme, a tile lifted on hover |
| `dial-picture.png` | A user's own theme (violet glass, tiles grow on hover) over a background picture |
| `settings-themes.png` | Settings › Themes: Classic, Anori (in use) and the user's theme "Dusk" |
| `settings-tiles.png` | Settings › Tiles with the live preview |
| `settings-tiles-glass.png` | Settings › Tiles, scrolled to the glass, shadow and hover effect settings |
| `settings-page.png`, `settings-grid.png` | Settings › Page and Grid |
| `properties.png` | Bookmark properties |
| `settings-themes-dark.png` | Settings › Themes in dark mode, after choosing **Use** on Anori |

All are 1280×800. The light and dark ones come from the browser's colour scheme, as in Firefox.

## How it works

1. **Tile pictures.** Each invented site in [`sites.js`](sites.js) is a complete HTML page. It is rendered at 1280×960 and captured as JPEG, the way Quick Dial NG captures a real page, so the tiles show real text and layout. The background picture (dusk over mountains) is made the same way.
2. **A dial with sample data.** A temporary copy of `src/` is served over a local HTTP server and opened in frames of the test harness's `index.html`. A Quick Dial bookmarks folder gets the twelve sites and two folders. The pictures go in as original Quick Dial data (pictures inside the tile tree), so they take the normal migration path into storage, like a user's own data would.
3. **Scenes.** The script changes settings and themes through the background page, reloads the dial, opens Settings and Properties, hovers tiles and saves each view. The pages get the real version number and English texts from `src/_locales/en`.

## Files

| File | Purpose |
|---|---|
| `make-screenshots.js` | The script: the temporary extension copy and server, picture rendering, the sample dial and the scenes. The scenes are in `main()`, in the order above. |
| `sites.js` | The invented sites (mail, news, video, code, weather, maps, shop, wiki, calendar, music, photos, recipes) and the background picture. Soft colours; no real brands, logos, people or photos. `photo()` draws a pastel landscape that stands in for a photo. |

## Changing the screenshots

- **Another view:** add a few lines to `main()`. The helpers from `openDial()` change settings (`settings(fn)`), save themes (`themes(list)`), reload the dial (`dial()`), open Settings on a tab (`openSettings(dial, 'Tiles')`), hover a tile (`hover(dial, 'Weather')`) and save the window (`shot('name')`). `scrollTo(frame, selector)` scrolls the Settings content.
- **Another site:** append `{ title, url, html: page(css, body) }` to `SITES` in `sites.js`. Sites fill the grid in order, followed by the two folders. The grid is 3 rows of 5 (set in `openDial()`), so one more site fits before it needs another row.
- **New UI text or controls** need nothing here: the pages come from `src/` at every run. A scene breaks only if an element it clicks (by id) is renamed.
