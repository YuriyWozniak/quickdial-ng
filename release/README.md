# Release

## With GitHub Actions (the usual way)

1. Bump `version` in `src/manifest.json` and add its release notes to [amo-listing.md](amo-listing.md) (`### <version>` under "Release notes"), in a pull request into `develop`; merge it once CI is green.
2. On GitHub: **Actions › Release › Run workflow**, branch `develop`, enter the version. Tick *Dry run* to only test, lint and build the package.
   - It checks that the version is the one in `src/manifest.json` and wasn't submitted before, runs all of CI, and builds the AMO package (the source without `update_url`, linted with the listed rules).
   - The *submit to AMO* job then waits for you: open the run and choose **Review deployments › amo › Approve**. It uploads the package to addons.mozilla.org with the release notes and the Notes to Reviewer below, and tags the commit `v<version>`.
3. Mozilla reviews the version (hours to days). The **Publish** workflow checks addons.mozilla.org every 3 hours; once the version is approved it downloads the signed file, checks it against AMO's hash and the tagged source, and creates the GitHub release with the notes and the `.xpi`. To publish sooner, run Publish by hand.

The package and its metadata stay downloadable from the Release run for 30 days. Each version is for **Firefox on the desktop** only: the metadata asks for that, and if AMO adds Firefox for Android anyway, the *submit to AMO* job takes it off with `node release/amo.js compat <version>`. If that step fails (it doesn't stop the release; AMO sometimes throttles edits for an hour), run the same command on the PC later or untick Android on the version's page. AMO throttles uploads too: the job waits and tries again up to 3 times when AMO asks for at most 5 minutes; after a longer throttle, run Release again later. Up to 0.7.0 the manifest had `gecko_android`, and AMO doesn't let anyone change what the manifest sets, so those versions stay listed for Android.

The listing itself (summary, description, screenshots, icon) is kept up to date with [`amo.js`](amo.js) from [amo-listing.md](amo-listing.md); it uses the same API key, from `AMO_JWT_ISSUER`/`AMO_JWT_SECRET` or the key file below.

One-time setup (done once per repository): **Settings › Environments › amo** has you as required reviewer and allows only `develop`. Its secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` are the two values of the AMO API key ([Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/)); they are used only by the *submit to AMO* job and never appear in logs.

GitHub turns off scheduled workflows in a repository without activity for 60 days; if Publish stops, enable it again on the Actions tab or run it by hand.

## On the PC

`release.js` takes a version that is already committed in `src/manifest.json` and turns it into a published, auto-updating release:

1. **Commit.** Uses the last commit on `origin/develop` that changed `src/` (or `--commit`). Checks that its `src/manifest.json` has the requested version.
2. **Lint and sign.** Exports `src/` exactly as it is at that commit (not your working copy) and lints it with `release/lint.js` (`web-ext lint --self-hosted`); any error or warning stops the release (dry runs included), except the one in `ALLOWED_WARNINGS`: the manifest has no `gecko_android` (desktop only), so the linter warns that `data_collection_permissions` needs Firefox for Android 142. The CI lints `src/` with the same script. Then it signs it on addons.mozilla.org as an *unlisted* add-on with `web-ext sign`. Mozilla's approval usually takes a few minutes. The result is saved as `quickdial-ng-<version>.xpi` in the output folder. If that file already exists, signing is skipped.
3. **Verify.** Checks that the `.xpi` is signed by Mozilla (`META-INF/mozilla.rsa`), has the right version and contains exactly the source files of the commit.
4. **Tag.** Tags the commit as `v<version>` and pushes the tag. It stops if the tag already exists at another commit.
5. **GitHub release.** Creates the release *Quick Dial NG &lt;version&gt;* with the notes from `--notes` and attaches the `.xpi`.
6. **updates.json.** Only for a self-hosted (unlisted) file: adds the version to [`updates.json`](../updates.json) with its download link and `sha256` hash, commits and pushes to `develop`. Since `develop` is protected, that push is refused: use `--no-updates-json` and add the entry in a pull request. A file signed through AMO has no `update_url`, so this step is skipped: copies installed from GitHub (0.3.4 and later) reach AMO through the entries already in `updates.json` and update from there.

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

1. Bump `version` in `src/manifest.json` and add its release notes to [amo-listing.md](amo-listing.md) (`### <version>` under "Release notes") in the same change; CI fails on an unreleased version without notes. Commit and push to `develop`.
2. Write the notes to a file: `node release/notes.js 0.3.5 --out notes.md`.
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
   It lints the source without `update_url` with the listed rules (`release/lint.js` without `--self-hosted`) and saves `quickdial-ng-<version>-amo.zip` in the output folder.
3. On [My Add-ons](https://addons.mozilla.org/developers/addons) open Quick Dial NG › **Upload New Version**, choose **On this site** and upload the `.zip`. Untick **Firefox for Android** under compatibility if it's ticked: Android doesn't let extensions replace the new tab or home page and has no bookmarks API, so the manifest has no `gecko_android`.
   - No source code upload is needed: the package is the plain source, nothing is minified or generated.
   - The first listed version asks for the listing (summary, description, categories, license, support links, screenshots and release notes). Copy them from [amo-listing.md](amo-listing.md). Keep that file up to date with every version: add the version's release notes there (and pass the same text to `--notes`), and update the description when features change.
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
  background tab; "Refresh" downloads the page (XMLHttpRequest,
  js/background/siteinfos.js, app.SiteInfos.fromFrame) to read its title. That page is placed in an iframe with
  sandbox="allow-same-origin" (no allow-scripts) via srcdoc, so none of its scripts run; only
  http/https addresses are fetched.
- tabs: create, activate and close that capture tab; open the dial or the Settings tab from the
  toolbar button, and bring an already open Settings tab forward (tabs.query, matched by the
  add-on's own html/settings.html address).
- contextMenus: right-click menu on the dial page and on the toolbar button.
- storage: settings, themes and tile pictures.

To test: open a new tab; tiles are the bookmarks of Bookmarks Menu > Quick Dial (created if
missing). Right-click the page for New > Bookmark and Quick Dial NG Settings; right-click a tile
for Properties, Refresh and Capture in a new tab. The toolbar button opens Settings in its own tab
(also Add-ons > Quick Dial NG > Options); Settings > Themes applies the built-in Anori theme.
```
