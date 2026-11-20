# Benchmarks

Performance measurements in a real Firefox. There are two independent tools:

- **Extension benchmark** (`run.js`): times Quick Dial NG's own work (storage reads and writes, bookmark sync, new tab rendering) in a throwaway profile seeded with realistic data. It can also run the original Quick Dial code for comparison.
- **Startup profiling** (`startup.js`): launches Firefox repeatedly on a *copy* of a real profile and measures how Firefox starts with all its extensions, when the start tab shows the dial, and how fast new tabs open.

Both need Node.js and Firefox and are plain Node scripts without dependencies of their own. The extension benchmark also needs `web-ext`; it uses the install the [release script](../../release/README.md) uses. Every tool prints its options with `--help`.

Both wait for events (the background page's first bookmark sync, the browser being idle, a tab's pictures, Firefox exiting) rather than for fixed times; time limits are only there in case something hangs. The one fixed wait is the short pause between new tabs (see `--tab-pause`). Results vary by several ms between runs on a busy machine: compare medians of several runs, or more tabs, before trusting a small difference. The scripts that run inside a measured page never poll: they follow the page with a `MutationObserver`, because a busy timer in the same process holds up the very page being timed.

## Extension benchmark

```
node test/bench/run.js [ng|orig] [options]
node test/bench/run.js --newtab              # only new tabs: about 10 s
node test/bench/run.js --newtab --tabs 30 --label before-change
```

`ng` (the default) benchmarks this repo's `src/`. `orig` benchmarks the original Quick Dial code (commit `b1f76da`), where all pictures are stored inline in one record. The script prints one JSON line per result.

| Option | Meaning |
|---|---|
| `--stages <list>` | What to measure, comma-separated: `sync`, `save`, `inline`, `newtab` (default: all). Only these run; startup (the background page loading and its storage reads) is always reported. |
| `--newtab` | Only new tabs: the same as `--stages newtab`. |
| `--tabs <n>` | New tabs to open (default 12). The first is reported apart (`dialFirst`), the others as medians (`dialMedianWarm`). |
| `--tab-pause <ms>` | Pause after closing each new tab, before waiting for the extension to be idle (default 300). Firefox finishes closing a tab in its main process, which the extension can't observe; without the pause the next tab's `openToOrigin` measures about 10 ms slower. |
| `--label <text>` | Added to the results, to tell runs apart (e.g. before and after a change). |
| `--src <dir>` | Benchmark this extension folder instead. |
| `--firefox <exe>` | Firefox to use. Default: `QDNG_FIREFOX`, then `C:\Program Files\Mozilla Firefox\firefox.exe` on Windows, otherwise the one web-ext finds. |
| `--web-ext-dir <dir>` | A folder whose `node_modules` contains `web-ext`. Default: `QDNG_WEB_EXT_DIR`, then `webExtDir` from `release/config.local.json`, then `release/` and `test/`. |
| `--timeout <seconds>` | Give up after this long (default 150). The background side reports what it has 10 s before that. |
| `--headful` | Show the Firefox window. |

What each new tab reports (ms since the tab's page started loading, except `openToOrigin`):

| Key | Meaning |
|---|---|
| `openToOrigin` | From `tabs.create` until the page starts loading: Firefox creating the tab. |
| `earlyScript` | The page's first script runs. Everything before it is Firefox's (setting up the extension page). |
| `firstFrame` | Firefox's first animation frame for the page. |
| `domContentLoaded`, `load` | The page's own events. |
| `settingsApplied`, `gridPopulated` | The dial applies the settings and fills the grid. |
| `imagesSet`, `imagesDecoded` | Every tile picture is set, then decoded. |
| `painted` | Two frames after that: the drawn grid is on screen. |
| `firstContentfulPaint` | Firefox's own paint timing. |
| `timedOut` | Set when not every picture showed up within 5 s (a broken build). |

| File | Purpose |
|---|---|
| `run.js` | Runner. Builds the benchmark copy in a temporary folder, starts it with `web-ext run` in headless Firefox with a temporary profile, waits for the results, then stops only that Firefox and prints the results. Results come back as small files that the extension downloads; the runner points Firefox's download folder into its temporary folder, reads them from there and deletes them. |
| `build.js` | `node build.js <src> <out> <ng\|orig> [optionsJson]`. Copies the extension and adds the benchmark scripts. Writes `bench/config.js` with the format, the extension's default settings, its background scripts and the runner's options, and `bench/shared.js` with what the Node tools and the page scripts agree on (`SHARED` in `lib.js`). Changes the manifest: the background page runs `seed.js`, the `downloads` permission is added, and the ID becomes `quickdial-bench-<format>@local` so it never clashes with the installed extension. Puts `early.js` first in `dial.html`, and `shared.js` and `probe.js` right after `js/dial.js`. |
| `seed.js` | Background side. Seeds the profile with data shaped like a real one: a Quick Dial folder with 13 bookmarks on an 8×12 grid, 600×450 WebP pictures and realistic settings. Then loads the extension's background scripts (in manifest order), waits for their first bookmark sync, and runs the stages asked for: bookmark sync, saving after a change, the same data in the original inline format, and new tab openings. Has a watchdog that reports partial results. |
| `early.js` | New tab side, the first script of `dial.html`: notes when the page's first script runs, its first frame and its load events. |
| `probe.js` | New tab side, after `js/dial.js`: notes when settings are applied, the grid is filled, all pictures are set and decoded, and the page has painted, then reports all times to `seed.js`. |
| `lib.js` | What the Node tools share: the names and defaults they agree on with the page scripts (`SHARED`: result files and prefixes, message and URL parameter names, stages, default tab count and pause), argument parsing, medians, where Firefox is, Quick Dial NG's add-on id (read from `src/manifest.json`). Values used by one file only are constants at the top of that file. |

## Startup profiling

```
node test/bench/startup.js <firefox.exe> <profileCopyDir> <runs> <label> <results.jsonl> [options]
node test/bench/startup-report.js <results.jsonl> [more.jsonl ...]
node test/bench/startup.js <firefox.exe> <profileCopyDir> 1 <label> <results.jsonl> --newtabs 8 --gecko-profile <profile.json>
node test/bench/newtab-phases.js <profile.json> [--tabs] [--busy]
```

Never point `startup.js` at a profile you use. It writes `user.js` and can disable add-ons. Copy the profile first (with Firefox closed) and delete the copy afterwards, because it contains private browsing data. Copy all of it: the tile pictures belong to bookmark ids, so a copy without `places.sqlite` (the bookmarks) loses its pictures on the first start. `startup.js` warns when no new tab shows a picture; such a tab is measured without them, and counted as drawn 1.5 s after its load event instead of waiting the full 6 s.

| File | Purpose |
|---|---|
| `startup.js` | Launches Firefox `<runs>` times plus one warm-up launch, controlling it through Marionette (Firefox's built-in remote control, no extra packages). Each launch records Firefox's own startup timings, the per-extension timings Firefox keeps, when the start tab's page painted, and how fast new tabs show their pictures. Appends one JSON line per launch to the results file and a readable log next to it. Options: `--newtabs <n>` (new tabs per launch, default 1; the first is `newTab`, the others `newTabsLater`), `--idle <ms>` (after the session is restored, wait until no extension is still starting and Firefox is idle, at most this long; default 8000), `--settle <ms>` (a new tab counts as drawn when its pictures haven't changed for this long; default 500), `--disable-ng` (compare without Quick Dial NG), `--homepage <url>` (set Firefox's home page), `--gecko-profile <file>` (record the last launch with the Firefox Profiler; open the file at profiler.firefox.com), `--headful` (show the window), `--discover` (dump everything Firefox exposes; for development). |
| `startup-report.js` | Summarizes one or more results files: medians per series, with warm-up launches excluded. Shows window paint, session restore, start tab paint, new tab timings (the first and the later ones apart), and per-extension startup, background page load and storage read times. |
| `gecko-markers.js` | `node gecko-markers.js <profile.json> [regex] [--names] [--threads] [--exclude <regex>]`. Lists Firefox Profiler markers matching a pattern on one timeline across all processes, e.g. everything mentioning an extension's ID. `--names` counts marker names per thread instead, which helps to find what a recording contains. |
| `newtab-phases.js` | `node newtab-phases.js <profile.json> [--tabs] [--busy] [--json]`. Splits each new tab's load of the dial in a recording into the steps Firefox takes before the dial's code runs, and prints the median and range of each over the new tabs (the start tab is left out): 1. the page waits for Firefox's main process, which is still opening the tab; 2. the main process opens the page and replaces the tab's first page; 3. the new page and document are made in the extension process; 4. the extension API setup waits for the main process again; 5. the rest of the way to the first script; 6. the dial's scripts, layout and first paint. Only step 6 is the dial's own work. `--tabs` adds a line per tab, `--busy` lists what kept the main process busy during step 1, `--json` prints each tab's step times instead. The profiler slows Firefox down, so compare steps with each other or with another recording, not with `startup.js`'s own timings. |
| `gecko-profile.js` | Reads a recording for `gecko-markers.js` and `newtab-phases.js`: the markers of every thread in every process, on the main process's timeline. |
