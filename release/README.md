# Release

`release.js` takes a version that is already committed in `src/manifest.json` and turns it into a published, auto-updating release:

1. **Commit.** Uses the last commit on `origin/develop` that changed `src/` (or `--commit`). Checks that its `src/manifest.json` has the requested version.
2. **Sign.** Exports `src/` exactly as it is at that commit (not your working copy) and signs it on addons.mozilla.org as an *unlisted* add-on with `web-ext sign`. Mozilla's approval usually takes a few minutes. The result is saved as `quickdial-ng-<version>.xpi` in the output folder. If that file already exists, signing is skipped.
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
| `--config <file>` | Use another config file. |
| `--dry-run` | Check everything and report what would be done, without signing, tagging, uploading or committing. |

A version can be signed only once on addons.mozilla.org. If something is wrong with a signed build, fix it and release the next version.
