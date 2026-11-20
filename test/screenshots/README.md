# Screenshots

Makes the pictures in the repository's [`screenshots/`](../../screenshots/) folder: the main set, which the main README and addons.mozilla.org show, and more views for the website ([qdng.srv.if.ua](https://qdng.srv.if.ua)) in its `website/` subfolder.

Like the tests, it doesn't need Firefox. It runs the extension's own pages from `src/` in Chromium (Playwright), against the simulated Firefox API of the test harness ([`../mock.js`](../mock.js)), so the screenshots always show the current code. The pages are drawn inside a browser window (tabs and toolbar, like Firefox on Windows, without its logo), so they look the way people see them.

## Run

Once, in the `test` folder: `npm install` (see [test/README.md](../README.md)). Then, in the `test` folder:

```
npm run screenshots
```

or `node screenshots/make-screenshots.js --out <folder>` to write somewhere else. It overwrites the PNG files in the output folder and its `website` subfolder, prints each file name as it saves it, and ends with `Done` (exit code 0), or with the page errors it saw (exit code 1). A run takes about two minutes.

## What it makes

All pictures are 2560×1600: a 1600×1000 window at 1.6 device pixels per CSS pixel, so text stays sharp when the website or AMO scales them down. The light and dark ones come from the browser's colour scheme, as in Firefox.

Main set (`screenshots/`), in the order AMO shows them (see [release/amo-listing.md](../../release/amo-listing.md#screenshots)):

| File | Shows |
|---|---|
| `dial-desktop.png` | Desktop icons on a night wallpaper: square tiles, no borders, icons in columns at the edges, folders, one icon hovered (built-in theme Desktop and a wallpaper) |
| `dial-zones.png` | A 8×12 grid with the sites grouped in its corners and room between them, dark-mode pages (built-in theme Plum) |
| `dial-categories.png` | The same groups as categories, each with folders for the rest of its sites |
| `dial-folder.png` | The "Servers" folder of the categories opened, with the Back tile |
| `dial-anori.png` | The usual speed dial: light sites in the built-in Anori theme, one tile lifted on hover |
| `settings.png` | Settings › Themes, light on the left and dark on the right, with all the built-in themes and one of the user's own, Desktop (day) |
| `properties.png` | Bookmark properties over the zoned dial, dark |

Website set (`screenshots/website/`):

| File | Shows |
|---|---|
| `dial-zones-anori.png`, `dial-zones-classic.png`, `dial-zones-dusk.png` | The zoned dial in Anori, Classic, and Dusk over a sunset picture |
| `dial-desktop-day.png` | Desktop icons on a daylight wallpaper, dark titles, light mode |
| `dial-categories-desktop.png` | The categories with folders as desktop icons |
| `dial-retro-pc.png`, `dial-retro-mono.png` | The desktop in the Retro PC theme with SerenityOS icons, and in the Retro Mono theme with Pixelarticons over a dotted pattern picture |
| `dial-classic.png`, `dial-picture.png` | The usual speed dial in Classic, and in Dusk over a sunset picture |
| `settings-themes.png`, `settings-themes-dark.png` | Settings › Themes, light and dark |
| `settings-tiles.png`, `settings-tiles-glass.png` | Settings › Tiles with the live preview, and scrolled to the glass, shadow and hover settings |
| `settings-page.png`, `settings-grid.png` | Settings › Page and Grid |
| `properties.png` | Bookmark properties, light |

The website's build (`images.js` in the website folder) makes its WebP files from these PNGs, by file name.

## How it works

1. **Pictures.** Each invented site in [`sites.js`](sites.js) (light) and [`dark-sites.js`](dark-sites.js) (mostly dark) is a complete HTML page. It is rendered at 1280×960 and captured as JPEG, the way Quick Dial NG captures a real page, so the tiles show real text and layout. The icons in [`icons.js`](icons.js) are captured as PNG with a transparent background, and the wallpapers the same way as the sites.
2. **A dial with sample data.** A temporary copy of `src/` is served over a local HTTP server and opened in frames of the test harness's `index.html`, below the drawn browser window ([`browser-frame.js`](browser-frame.js)). Each scene fills the Quick Dial bookmarks folder from a layout (`LAYOUTS` in the script): which sites, icons and folders, and in which row and column, with empty cells between groups. The tiles go in as original Quick Dial data (pictures inside the tile tree), so they take the normal migration path into storage, like a user's own data would.
3. **Scenes.** The script applies a theme (built in, or one of `OWN_THEMES`: a built-in one with some values changed) and a background picture through the background page, reloads the dial, opens Settings (in the window, as its own tab) and Properties, hovers tiles, opens a folder and saves each view. The pages get the real version number and English texts from `src/_locales/en`.

## Files

| File | Purpose |
|---|---|
| `make-screenshots.js` | The script: the temporary extension copy and server, picture rendering, `OWN_THEMES`, `LAYOUTS`, the sample dial and the scenes in `main()`, main set first. |
| `sites.js` | The light invented sites of the usual speed dial (mail, news, video, code, weather, maps, shop, wiki, calendar, music, photos, recipes) and the sunset picture. `photo()` draws a pastel landscape that stands in for a photo. |
| `dark-sites.js` | The sites of the zoned dials, the kinds people keep on a large dial (mail, drive, translator, photos, video, music, passwords, cloud files, server and router panels, add-on hub, code host, private mail, AI chat), and the server dashboards of the "Servers" folder. |
| `icons.js` | App-style icons drawn for the desktop scenes, and the night and day wallpapers. |
| `retro-icons.js` | The icons, folder pictures and dotted pattern of the retro scenes, from two open icon sets (see below), enlarged by whole pixels so they stay sharp. |
| `retro-icons/` | The SerenityOS icons the Retro PC scene uses, copied from its `Base/res/icons/32x32` folder, with their licence. |
| `browser-frame.js` | The browser window around the pages: tabs, toolbar and address bar, light or dark. |

No real brands, logos, people or photos appear anywhere. Every site, wallpaper and modern icon is made up here; the retro icons come from two open icon sets:

- **Retro PC:** icons from [SerenityOS](https://github.com/SerenityOS/serenity), © the SerenityOS developers, [BSD 2-Clause License](retro-icons/LICENSE). To add one, copy it from `Base/res/icons/32x32` of that repository into `retro-icons/` and name it in `RETRO_FILES`.
- **Retro Mono:** [Pixelarticons](https://pixelarticons.com) by Gerrit Halfmann, [MIT License](https://github.com/halfmage/pixelarticons/blob/master/LICENSE), installed with the test packages (`pixelarticons` in [../package.json](../package.json)); name an icon in `MONO_FILES`.

The main [README](../../README.md#credits) credits them too.

## Changing the screenshots

- **Another view:** add a few lines to `main()`. The helpers from `openDial()` apply a look (`look({ theme: 'plum', wallpaper, folder })`), save the user's own themes (`saveThemes(['desktopDay'])`), reload the dial with tabs beside it (`dial([TABS.mail])`), open Settings on a section (`openSettings('Tiles')`), hover a tile (`hover(dial, 'Photos')`) and save the window (`shot('name')`, or `shot('name', WEBSITE_OUT)`). `scrollTo(frame, selector)` scrolls the Settings content.
- **Another layout:** add it to `LAYOUTS`: rows, columns, tile shape and the cells. `site('mail', [row, column])` places a dark site, `iconTile('mail', [row, column])` its icon, `folder('Name', [row, column], [cells])` a folder; cells without a place fill the free cells in order.
- **Another site:** add it to `DARK_SITES` in `dark-sites.js` (or `SITES` in `sites.js`) and, for the desktop scenes, its drawing and colours in `icons.js` under the same key.
- **New UI text or controls** need nothing here: the pages come from `src/` at every run. A scene breaks only if an element it clicks (by id) is renamed.
