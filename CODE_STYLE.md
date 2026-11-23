# Code style

How the code of Quick Dial NG is written and named. `npm run check` ([ESLint](eslint.config.mjs) for the scripts and the stylesheets, and TypeScript's checker) enforces part of it, including camelCase names and logical CSS properties; the rest is kept by review. When something isn't covered here, follow the code around it.

## Formatting

- Indent with tabs.
- `src/` keeps the compact style it inherited from the original Quick Dial: `if(x){`, `function(){`, `} else {`. The tests (`test/`) use the usual Node spacing: `if (x) {`. Follow the file you are editing.
- Single quotes for strings; end statements with a semicolon.
- No build step and no modules: each page loads plain scripts that share a few globals (see [README.md](README.md#development)).

## Names

| What | Style | Examples |
| --- | --- | --- |
| Parts of `app`, page globals | PascalCase; page globals start with `QD` | `app.GridNodes`, `app.Settings`, `QDCommon`, `QDClient`, `QDThemes`, `QDUI` |
| Frozen lookup objects (enums) | PascalCase, members camelCase | `QDCommon.Commands.getNodeById`, `QDCommon.NodeType.folder` |
| Constructors | PascalCase | `PopupPanel` (js/ui.js) |
| Functions and methods | camelCase, starting with a verb | `getNodeById`, `refreshNode`, `readJsonFile`, `toCssUrl` |
| Event handlers | `on` + event | `_onDrop`, `_onKeyDown` |
| Variables and properties | camelCase | `cellsPerPage`, `backIcon`, `dial.titleElement` |
| True/false values | say what is true | `isFolder`, `hasLegacySwitch`, `titleBelow`, `urlChanged` |
| Constants | UPPER_SNAKE | `LOADING_ICON`, `TOOLBAR_ACTIONS`, `LEGACY_ICONS`, `FIELDS` |
| Internal to a part | leading `_` | `app.Settings._serialize`, `app._selectedLink` |
| Kept on a node only while the extension runs | leading `__` (never saved: `Settings._serialize` drops them) | `node.__isLoading` |
| Our properties on DOM elements | camelCase, `_` when internal | `link.gridNode`, `link._imageId` |
| Files | lowercase, named after the part they hold | `js/background/gridnodes.js` holds `app.GridNodes` |

- **Abbreviations are words:** `Id`, `Url`, `Json`, `Css`, `Webp`: `getNodeById`, `dataUrl`, `readJsonFile`, `toWebp`. Names that come from the platform stay as they are (`JSON.parse`, `toDataURL`), and so does the `QD` prefix.
- **One job, one name, one copy:** code that several pages need is written once: in `QDCommon` (`js/common.js`) when the background page needs it too, otherwise in `QDUI` (`js/ui.js`). A part that keeps its own name for it points at the shared copy (`app.Images.toWebp = QDCommon.toWebp`). Code that must stay in two places has the same name and argument order in both.
- **Drawing apart from the rest:** on the dial, `js/grid.js` (`dial`) only draws, from what `js/dial.js` (`app`) holds; it sends no messages and handles no input, and returns what it couldn't finish (pictures to load or make) for `app` to do. On the Settings page, each tab is set up by its own function (`app.setupGrid`, `app.Themes.setup`...), called from `app.init`.
- **Short names** only for loop indexes (`i`, `j`), events (`e`), short arrow functions (`t => t.name`) and the usual aliases in style code: `s` (settings), `g` (`settings.grid`), `c` (`settings.grid.cells`). Write longer aliases out: `const NodeType = QDCommon.NodeType`, `const Commands = QDCommon.Commands`. Never use one short name for two different things in the same file.
- **Named values, not bare literals:** a setting that is a choice from a list has a frozen lookup object, and the code compares with its names, never with the stored numbers: `QDCommon.OpenIn`, `QDCommon.ImageMode`, `QDThemes.HoverEffect`, `QDThemes.ClickEffect`, `QDThemes.TitlePosition`, `QDThemes.Shadow`. Other fixed values (sizes, delays, limits, storage keys, file formats, paths) are UPPER_SNAKE constants with a comment saying what they are, kept once: in `QDCommon` or `QDThemes` when more than one page uses them, otherwise on the part that does (`app.SiteInfos.DOWNLOAD_TIMEOUT`, `app.Settings.DATA_VERSION`). Data tables keep their values as they are: the defaults in `app.Settings.defaults`, the built-in themes, the steps of the upgrade from older versions. A script that runs before `common.js` (`dialbg.js`), or is loaded on its own (`themes.js` in the unit tests), keeps its own copy, under the same name and with a comment pointing at the shared one.
- **Messages** between the pages and the background page: the `QDCommon.Commands` key is a camelCase verb phrase; the number is what gets sent, so a number is never reused for another command. The pages send them only through `QDClient` (`js/common.js`), one method per command.

## HTML and CSS

- **Element ids** are PascalCase, because the Settings and Properties pages use them as globals (`BtnApply.onclick`):
  - action buttons are `Btn<Action>`: `BtnApply`, `BtnThemeImport`;
  - other elements are `<Subject><Role>`: `ImageZone`, `GridBackPreview`, `TabGridButton`;
  - a form field is named after the setting it edits: `GridCellsTitleFont` for `grid.cells.titleFont`.

  Only give an id to an element that needs one, and never two ids that differ only by case.
- **CSS classes** are kebab-case with the `qd-` prefix (`qd-grid`, `qd-dialog`, `qd-tile-slot`). States and variants are `is-*` classes (`is-loading`, `is-dirty`, `is-primary`).
- **Custom properties** start with `--qd-`: `--qd-accent`. Colors, sizes and spacing use the tokens at the top of `css/ui.css`.
- **Stylesheets** follow where they are loaded: `css/ui.css` (tokens, base text, controls, dialogs) on every page, and the only one the dial page loads; `css/page.css` (page frame, cards, form rows, image picker) on the Properties and Settings pages; `css/settings.css` on Settings only. Reusable pieces go in the file that every page using them loads; what only one section of a page has (the Tiles preview, the theme gallery) goes in that page's file.
- **Attributes of our own** are `data-*` attributes (`cell.dataset.index`), never made-up attribute names.

## Translations

- Message keys in `src/_locales/*/messages.json` are camelCase and start with where they are used: `menu*` for menu items, `dialog*` for dialogs (`dialogNewBookmarkPrompt`, `dialogDeleteConfirmation`).
- English (`en`) is the default locale: add new keys there first. A key that is no longer used is removed from every locale.
- Every language has every key (`test/unit/locales.test.js` checks it): a new text is translated in the same change, or added in English to the other languages and noted for translation.
- A count is a set of keys, one per plural form: `countTilesOne`, `countTilesFew`, `countTilesMany`, `countTilesOther`, read with `QDCommon.countText('countTiles', n)`. Each language has the forms its plural rules use (`Intl.PluralRules`), always with `Other`.
- Texts are read with `QDCommon.text`, never `browser.i18n.getMessage`: the user can choose a language other than Firefox's (Settings › Page › Language), and only `QDCommon` knows it. The same goes for the language tag and direction (`QDCommon.language()`, `QDCommon.direction()`).
- A new language: its folder in `src/_locales` and its own name in `QDCommon.LANGUAGES` (`test/unit/language.test.js` checks that they match).
- In a message, `<b>`, `<code>` and `<br>` are the only markup (`QDUI.setRichText` builds it as elements); keep the same markup and `$1`..`$9` in every language.
- Layout works right to left too (Hebrew): use logical CSS properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`), not left and right. ESLint reports left and right in the stylesheets (`css/prefer-logical-properties`); top, bottom, width and height are fine.

## Comments

- The first lines of each file say what it is and how it fits in.
- Comments explain why, and what isn't obvious from the names; keep them in sync when the code changes.
