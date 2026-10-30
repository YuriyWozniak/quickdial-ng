# Quick Dial NG

Quick Dial NG is a speed dial new tab page for Firefox. Its tiles come from a bookmarks folder ("Quick Dial" by default).

It is a fork of [Quick Dial](https://github.com/MatMoul/quickdial-webext) by MatMoul ([on addons.mozilla.org](https://addons.mozilla.org/firefox/addon/quick-dial/)). It looks and works the same, but its storage has been reworked so Firefox starts faster and uses less disk and memory.

## What is different from Quick Dial 0.1.24

**Images are stored separately and loaded on demand.**
The original keeps every tile picture inside one big storage record (data URLs inside the node tree). Firefox reads that whole record at every start, and the bookmark sync that runs ~0.5 s after start writes it all back. With 73 tiles that was 21 MB read and rewritten on every launch.
Now each picture has its own storage key (`img_<bookmarkId>`). The startup record holds only settings and the tile tree, a few KB. The new tab page asks only for the pictures on the page you're looking at.

**Pictures are WebP.**
Captures and uploaded images are saved as WebP (quality 0.85) instead of PNG. Uploads are also limited to 1200 px on the longest side. On a real profile that took 10.5 MB of PNGs down to about 1.5 MB, with no visible difference at tile size.

**Saves only when something changed.**
Saves are batched (100 ms) and skipped when settings and tiles are unchanged, so a normal startup writes nothing.

**Bookmark events outside the Quick Dial folder are ignored.**
The original re-synced and saved on *any* bookmark change in the browser. Now only changes inside the Quick Dial tree trigger a sync.

**Unused images are removed.**
When a tile is deleted, its folder is removed, its URL changes, or the root folder is switched, its picture is deleted too.

**Fewer permissions.**
The hidden "Capture here" feature and the `webRequest`/`webRequestBlocking` permissions it needed are gone.

**Backup and restore.**
Settings → **Export backup** / **Import backup** saves and restores settings, tiles and pictures as one JSON file. Import also accepts data from the original Quick Dial (see below).

**Refresh no longer hangs.**
The automatic "Refresh" capture uses `drawWindow`, which recent Firefox no longer allows extensions to call. Instead of leaving a spinner forever, the tile now ends without a picture. Use **Capture in a new tab** to set one.

## Moving from the original Quick Dial

Quick Dial NG has its own add-on ID, so it starts with empty storage. Your tiles come back automatically because they are the same bookmarks. To bring over the pictures and settings:

1. In the original Quick Dial, open a new tab, press `Ctrl+Shift+K` and run:
   ```js
   (async()=>{const a=(await browser.runtime.getBackgroundPage()).app;const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([JSON.stringify({version:4,settings:a.settings,node:a.node})],{type:'application/json'}));l.download='quickdial-export.json';document.body.appendChild(l);l.click();})()
   ```
   (Firefox may ask you to type `allow pasting` first.)
2. Install Quick Dial NG and disable the original.
3. In Quick Dial NG: right-click the page → Quick Dial Settings → **Import backup** → choose `quickdial-export.json`.

## Development

- Source: `src/` (a Manifest V2 WebExtension).
- Lint: `npx web-ext lint -s src`
- Tests: `python3 test/test_storage.py`. This runs the extension pages in Chromium (Playwright) against a simulated Firefox API (`test/mock.js`). It covers migration, startup writes, bookmark filtering, the dial page, export/import and image cleanup.
- Build and sign (unlisted, for self-distribution):
  `npx web-ext sign -s src --channel unlisted --api-key <JWT issuer> --api-secret <JWT secret>`

## License

[Mozilla Public License 2.0](LICENSE), the same as the original Quick Dial.
