# addons.mozilla.org listing

The texts of Quick Dial NG's page on addons.mozilla.org (AMO), kept here so the listing and the GitHub documentation stay the same. When a feature changes, update this file together with the [README](../README.md), then bring the AMO page up to date with [`amo.js`](amo.js): `node release/amo.js info` shows what differs, `listing` updates the summary and description, `previews <png>...` replaces screenshots (each in the place of the one with the same caption), `previews-set` makes them exactly the table below, in its order (for a new set), and `icon` replaces the icon. The release notes reach AMO with each version through the Release workflow.

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
- Built in: Classic (the original Quick Dial look); Anori, inspired by the [Anori](https://anori.app/) extension; Plum, for a large grid with groups of sites; Dusk, glass tiles over a sunset; and Desktop, Retro PC and Retro Mono, which turn square tiles with icon pictures into a computer desktop.
- Glass tiles with blur, shadows, smooth hover effects, title fonts, and titles over the picture.
- Save your own themes, and export or import them as .json files.

**Moving from Quick Dial**

Right-click the page and choose "Import from Quick Dial…". Tiles keep their exact places, pictures, folders and settings. "Export backup" saves everything to one file for another profile or PC.

**Why NG**

Quick Dial NG is an independent fork of [Quick Dial](https://addons.mozilla.org/firefox/addon/quick-dial/) by MatMoul. Its storage was rebuilt: pictures are stored as WebP in separate entries, so Firefox starts faster and uses less disk and memory (10.5 MB of pictures shrank to about 1.5 MB on a real profile). Settings were redesigned: they open in their own tab and follow Firefox's light or dark mode. It also needs fewer permissions than the original.

**Home page**

Quick Dial NG also sets itself as the home page, so the dial opens when Firefox starts and from the Home button. Firefox asks once whether to keep this; to use another home page, go to Firefox Settings › Home.

**Permissions and privacy**

No data is collected or sent anywhere. Settings and pictures stay in your Firefox profile.

- Bookmarks: tiles are the bookmarks of the Quick Dial folder.
- Access to all websites: to capture a site's picture and read its title.
- Tabs: opens the site in a background tab for the capture, then closes it; opens the dial or Settings from the toolbar button.
- Menus: the right-click menu on the dial and on the toolbar button.
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

The seven main pictures from [`screenshots/`](../screenshots/), in this order (the first one is the main picture of the listing). The [`screenshots/website/`](../screenshots/website/) ones are for the website only. When a screenshot is added or renamed, add its caption here.

| # | File | Caption |
|---|---|---|
| 1 | [`dial-desktop.png`](../screenshots/dial-desktop.png) | Your dial as a desktop: icons with their names on your wallpaper, in columns at the edges, with folders. |
| 2 | [`dial-zones.png`](../screenshots/dial-zones.png) | A large grid with your sites grouped in its corners and room between the groups. |
| 3 | [`dial-categories.png`](../screenshots/dial-categories.png) | Sorted by category: each group keeps its favourites as tiles and the rest in folders. |
| 4 | [`dial-folder.png`](../screenshots/dial-folder.png) | A folder opened on the dial, with the Back tile. |
| 5 | [`dial-anori.png`](../screenshots/dial-anori.png) | The usual speed dial in the built-in Anori theme: glass tiles and titles over the pictures. |
| 6 | [`settings.png`](../screenshots/settings.png) | Settings › Themes: preview a theme, apply it, or save, export and import your own. Settings follow Firefox's light or dark mode. |
| 7 | [`properties.png`](../screenshots/properties.png) | Bookmark properties: title, address and picture. Choose, drop or paste an image, or keep it from being replaced. |

## Release notes

The "Release notes" field of each version on AMO; the same text goes to the GitHub release (`--notes`). Newest first.

### 0.7.0

```
- Five more built-in themes: Plum, a dark plum page with light grey rounded borders, for a large grid with groups of sites; Dusk, violet glass tiles over a sunset; and Desktop, Retro PC and Retro Mono, which turn square tiles with icon pictures into a computer desktop.
- Tahoma and Verdana join the title fonts.
```

### 0.6.0

```
- The background, Back and folder pictures from Settings are stored as WebP in their own entries, so a tile change no longer rewrites them: far less writing with a large background picture. A background picture is kept up to 2560 px.
- New folder, Back and loading pictures: sharp at any size, on light and dark tiles. The loading spinner shows again on tiles that start without a picture.
- Capture in a new tab: a page that never finishes loading is captured after 30 seconds, the tab is always closed, and nothing is captured if another tab is in front by then.
- Properties of a tile deleted meanwhile says "This tile no longer exists" instead of failing.
- New bookmark refuses javascript: and data: addresses.
- Startup never hangs: if Firefox can't read the stored data, Quick Dial NG tries again, then starts with the defaults without overwriting your data.
- Fixes: the tile menu on a folder's Back tile; Capture in folders whose names contain & # ? or %; dropping a tile on itself; folder pictures set to original size were stretched; an import during a bookmark sync could wait forever; an empty folder showed page 0 of 0.
- For Firefox on the desktop only: Firefox for Android doesn't let extensions replace the new tab page.
```

### 0.5.0

```
- Settings open in their own tab, with a sidebar and two columns on wide screens. Firefox's Add-ons page opens them too (Options).
- The toolbar button opens Settings, or the dial in a new or the current tab (Settings › Page). Its right-click menu has both. Existing installs keep what they had.
- Ctrl+S applies, Discard changes goes back to what the dial uses, and Firefox asks before closing Settings with changes not applied.
- Toolbar and add-on icons: the bottom-right tile is filled, like the website's icon.
```

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
