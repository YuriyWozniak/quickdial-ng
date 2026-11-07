# addons.mozilla.org listing

The texts of Quick Dial NG's page on addons.mozilla.org (AMO), kept here so the listing and the GitHub documentation stay the same. When a feature changes, update this file together with the [README](../README.md), then paste the changed parts into the AMO Developer Hub (Edit Product Page).

The description uses AMO's limited Markdown: `**bold**`, `_italic_`, `[links](https://…)`, `` `code` ``, `>` quotes and `-`/`1.` lists. HTML tags and `#` headings are not supported (AMO shows HTML as plain text), so section titles are bold lines. Keep a blank line between paragraphs and before each list.

## Name

```
Quick Dial NG
```

## Summary

At most 250 characters (now 217).

```
Speed dial for your new tab and home page. Tiles come from a bookmarks folder, with page pictures, folders, themes and backups. A faster, independent fork of Quick Dial by MatMoul: quicker start, less disk and memory.
```

## Description

```markdown
Quick Dial NG turns your new tab and home page into a grid of tiles. Each tile is a bookmark in one bookmarks folder ("Quick Dial"), so the dial always matches your bookmarks, and Firefox Sync carries the tiles to your other computers (pictures stay on each computer).

**Tiles**

- Add, edit, move and delete tiles right on the page; subfolders become folder tiles.
- Pictures: "Capture in a new tab" takes a screenshot of the site as you see it, signed in. You can also upload, drag in or paste your own picture.
- Set the number of rows and columns, the tile shape, margins, borders, titles and the background colour or picture.

**Themes**

- Switch the whole look at once: background, tile and title styles, and the accent colour of the settings.
- Built in: Classic (the original Quick Dial look) and Anori, inspired by the [Anori](https://anori.app/) extension.
- Glass tiles with blur, shadows, smooth hover effects, title fonts, and titles over the picture.
- Save your own themes, and export or import them as .json files.

**Moving from Quick Dial**

Right-click the page and choose "Import from Quick Dial…". Tiles keep their exact places, pictures, folders and settings. "Export backup" saves everything to one file for another profile or PC.

**Why NG**

Quick Dial NG is an independent fork of [Quick Dial](https://addons.mozilla.org/firefox/addon/quick-dial/) by MatMoul. Its storage was rebuilt: pictures are stored as WebP in separate entries, so Firefox starts faster and uses less disk and memory (10.5 MB of pictures shrank to about 1.5 MB on a real profile). Settings were redesigned and follow Firefox's light or dark mode. It also needs fewer permissions than the original.

**Home page**

Quick Dial NG also sets itself as the home page, so the dial opens when Firefox starts and from the Home button. Firefox asks once whether to keep this; to use another home page, go to Firefox Settings › Home.

**Permissions and privacy**

No data is collected or sent anywhere. Settings and pictures stay in your Firefox profile.

- Bookmarks: tiles are the bookmarks of the Quick Dial folder.
- Access to all websites: to capture a site's picture and read its title.
- Tabs: opens the site in a background tab for the capture, then closes it.
- Menus: the right-click menu on the dial.
- Storage: settings, themes and pictures.

For Firefox on the desktop, version 140 or later. Available in English, German, Spanish, French, Hebrew, Italian, Polish, Portuguese (Brazil), Russian, Serbian and Ukrainian.

Open source (MPL 2.0): [github.com/YuriyWozniak/quickdial-ng](https://github.com/YuriyWozniak/quickdial-ng)
```

## Categories and details

| Field | Value |
|---|---|
| Categories | Tabs, Bookmarks |
| Homepage | `https://github.com/YuriyWozniak/quickdial-ng` |
| Support site | `https://github.com/YuriyWozniak/quickdial-ng/issues` |
| Support email | (none) |
| License | Mozilla Public License 2.0 |
| Privacy policy | None needed: nothing is collected. |
| Compatibility | Firefox (desktop) only; untick Firefox for Android. |
| Add-on icon | [`amo-icon.png`](amo-icon.png) (128×128; AMO doesn't use the SVG icon from the manifest). Remake it after changing `src/img/icon.svg`: `node ../release/make-amo-icon.js` in `test/`. |

## Screenshots

All ten from [`screenshots/`](../screenshots/), in alphabetical order (the first one is the main picture of the listing). When a screenshot is added or renamed, keep the order and add its caption here.

| # | File | Caption |
|---|---|---|
| 1 | [`dial-anori.png`](../screenshots/dial-anori.png) | The dial with the built-in Anori theme: glass tiles and titles over the pictures. |
| 2 | [`dial-classic.png`](../screenshots/dial-classic.png) | The Classic theme, the original Quick Dial look. |
| 3 | [`dial-picture.png`](../screenshots/dial-picture.png) | Your own background picture behind the tiles. |
| 4 | [`properties.png`](../screenshots/properties.png) | Bookmark properties: title, address and picture. Choose, drop or paste an image, or keep it from being replaced. |
| 5 | [`settings-grid.png`](../screenshots/settings-grid.png) | Settings › Grid: rows and columns, tile shape, page margin, the bookmarks folder, and where bookmarks and folders open. |
| 6 | [`settings-page.png`](../screenshots/settings-page.png) | Settings › Page: background colour, picture or gradient, and the accent colour of Quick Dial NG's windows. |
| 7 | [`settings-themes.png`](../screenshots/settings-themes.png) | Settings › Themes: preview a theme, then apply it, or save, export and import your own. |
| 8 | [`settings-themes-dark.png`](../screenshots/settings-themes-dark.png) | Settings follow Firefox's dark mode. |
| 9 | [`settings-tiles.png`](../screenshots/settings-tiles.png) | Settings › Tiles: a live preview of the normal and hover look, with size, spacing, borders and colours. |
| 10 | [`settings-tiles-glass.png`](../screenshots/settings-tiles-glass.png) | Tile styles: glass blur, background opacity, shadows, hover effects and title settings. |

## Release notes

The "Release notes" field of each version on AMO; the same text goes to the GitHub release (`--notes`). Newest first.

### 0.4.1

```
First version on addons.mozilla.org.
- Themes: Classic and Anori built in; save, export and import your own.
- New tile styles: glass and blur, shadows, hover effects, title fonts, titles over the picture.
- Accent colour for the settings windows.
- New monochrome toolbar icon that follows Firefox's light or dark theme.
- Refresh loads the page in a sandbox, so none of its scripts run.
```

## Notes to Reviewer

See [Publishing on addons.mozilla.org](README.md#publishing-on-addonsmozillaorg-listed) in the release README.
