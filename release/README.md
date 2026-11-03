# Release

`release.js` takes a version that is already committed in `src/manifest.json` and turns it into a published, auto-updating release:

1. **Commit.** Uses the last commit on `origin/develop` that changed `src/` (or `--commit`). Checks that its `src/manifest.json` has the requested version.
2. **Lint and sign.** Exports `src/` exactly as it is at that commit (not your working copy) and runs `web-ext lint --self-hosted --warnings-as-errors` on it; any error or warning stops the release (dry runs included). Then it signs it on addons.mozilla.org as an *unlisted* add-on with `web-ext sign`. Mozilla's approval usually takes a few minutes. The result is saved as `quickdial-ng-<version>.xpi` in the output folder. If that file already exists, signing is skipped.
3. **Verify.** Checks that the `.xpi` is signed by Mozilla (`META-INF/mozilla.rsa`), has the right version and contains exactly the source files of the commit.
4. **Tag.** Tags the commit as `v<version>` and pushes the tag. It stops if the tag already exists at another commit.
5. **GitHub release.** Creates the release *Quick Dial NG &lt;version&gt;* with the notes from `--notes` and attaches the `.xpi`.
6. **updates.json.** Adds the version to [`updates.json`](../updates.json) with its download link and `sha256` hash, commits and pushes to `develop`. Installed copies (0.3.4 and later) pick it up on Firefox's next add-on update check.

Every step checks whether it was already done and skips it, so after a failure (e.g. a network error) just run the same command again.

## Requirements

- Node.js 18 or later and git, with push access to the repository.
- [web-ext](https://github.com/mozilla/web-ext): run `npm install` in this folder, or point `webExtDir` at an existing install.
- An addons.mozilla.org API key ([Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/)) in a text file **outside the repository**:
  ```
  JWT_ISSUER=user:12345:678
  JWT_SECRET=...
  ```
- A GitHub login: either the `GITHUB_TOKEN` environment variable or a login stored in Git Credential Manager (the script asks git for it and never prints it).

## Configuration

Copy `config.example.json` to `config.local.json` (ignored by git) and adjust the paths. Relative paths are relative to the config file.

| Key | Environment variable | Default | Meaning |
|---|---|---|---|
| `amoKeyFile` | `QDNG_AMO_KEY_FILE` | none (required to sign) | The AMO API key file. |
| `webExtDir` | `QDNG_WEB_EXT_DIR` | this folder | A folder whose `node_modules` contains `web-ext`. |
| `outDir` | `QDNG_OUT_DIR` | `release/signed` (ignored by git) | Where signed `.xpi` files are kept. |

Environment variables override the config file.

## Usage

1. Bump `version` in `src/manifest.json`, commit and push to `develop`.
2. Write the release notes to a file (Markdown).
3. Check what would happen, then run it:
   ```
   node release/release.js 0.3.5 --notes notes.md --dry-run
   node release/release.js 0.3.5 --notes notes.md
   ```

| Option | Meaning |
|---|---|
| `--notes <file>` | Release notes (Markdown). Only used when the release is created. |
| `--commit <rev>` | Release this commit instead of the last one that changed `src/`. |
| `--xpi <file>` | Use an already signed file instead of the output folder; no signing. |
| `--no-updates-json` | Publish the release without offering it as an automatic update. |
| `--amo` | Only build the package for a listed version on addons.mozilla.org (see below); no signing, tag or release. |
| `--config <file>` | Use another config file. |
| `--dry-run` | Check everything and report what would be done, without signing, tagging, uploading or committing. |

A version can be signed only once on addons.mozilla.org. If something is wrong with a signed build, fix it and release the next version.

## Publishing on addons.mozilla.org (listed)

The add-on ID is already registered on addons.mozilla.org (AMO) through the unlisted signing above, so a listed version is added to the same add-on. Listed versions are reviewed by Mozilla and signed there, and Firefox then updates them from AMO.

AMO refuses `update_url` in listed versions. The source keeps it for the GitHub builds; `--amo` removes it from the package:

1. Bump `version` in `src/manifest.json`, commit and push to `develop` (a version already signed, listed or not, can't be used again).
2. Build and check the package:
   ```
   node release/release.js 0.4.1 --amo
   ```
   It lints the source without `update_url` with the listed rules (`web-ext lint --warnings-as-errors`, no `--self-hosted`) and saves `quickdial-ng-<version>-amo.zip` in the output folder.
3. On [My Add-ons](https://addons.mozilla.org/developers/addons) open Quick Dial NG › **Upload New Version**, choose **On this site** and upload the `.zip`. Untick **Firefox for Android** under compatibility: Android doesn't let extensions replace the new tab or home page and has no bookmarks API. (`gecko_android` stays in the manifest only because the linter needs its minimum version, 142, for `data_collection_permissions`.)
   - No source code upload is needed: the package is the plain source, nothing is minified or generated.
   - The first listed version asks for the listing (summary, description, categories, license **MPL 2.0**, support links, screenshots from [`screenshots/`](../screenshots/)).
   - **Notes to Reviewer**: paste the text below.
4. After approval, download the signed file from the version's page and publish it on GitHub too:
   ```
   node release/release.js 0.4.1 --xpi quickdial-ng-0.4.1.xpi --notes notes.md
   ```
   The `.xpi` check accepts the AMO file: apart from the missing `update_url` it must match the commit. Copies installed from GitHub update to it through `updates.json`, and from then on update from AMO.

Notes to Reviewer:

```
Quick Dial NG is an independent fork of Quick Dial by MatMoul (MPL 2.0): a speed dial on the
new tab page (chrome_url_overrides) and the home page (chrome_settings_overrides), with tiles
from a bookmarks folder. Source: https://github.com/YuriyWozniak/quickdial-ng - the package is
the plain src/ folder, no build step, no minified or third-party code. No data is collected or sent.

Permissions:
- bookmarks: tiles are the bookmarks of one folder ("Quick Dial"), kept in sync both ways.
- <all_urls>: "Capture in a new tab" takes tabs.captureVisibleTab of the site in a muted
  background tab; "Refresh" downloads the page (XMLHttpRequest, background.js
  app.SiteInfos.fromFrame) to read its title. That page is placed in an iframe with
  sandbox="allow-same-origin" (no allow-scripts) via srcdoc, so none of its scripts run; only
  http/https addresses are fetched.
- tabs: create, activate and close that capture tab; open the dial from the toolbar button.
- contextMenus: right-click menu on the dial page.
- storage: settings, themes and tile pictures.

To test: open a new tab; tiles are the bookmarks of Bookmarks Menu > Quick Dial (created if
missing). Right-click the page for New > Bookmark and Quick Dial NG Settings; right-click a tile
for Properties, Refresh and Capture in a new tab. Settings > Themes applies the built-in Anori theme.
```
