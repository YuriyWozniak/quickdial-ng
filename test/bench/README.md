# Benchmarks

Performance measurements in a real Firefox. There are two independent tools:

- **Extension benchmark** (`run.ps1`): times Quick Dial NG's own work (storage reads and writes, bookmark sync, new tab rendering) in a throwaway profile seeded with realistic data. It can also run the original Quick Dial code for comparison.
- **Startup profiling** (`startup.js`): launches Firefox repeatedly on a *copy* of a real profile and measures how Firefox starts with all its extensions, when the start tab shows the dial, and how fast a new tab opens.

Both are written for Windows (paths default to majesty-pc's layout) and need Node.js and Firefox. The extension benchmark also needs `web-ext`.

## Extension benchmark

```
pwsh -File test\bench\run.ps1 [-Format ng|orig]
```

`ng` benchmarks this repo's `src/`. `orig` benchmarks the original Quick Dial code (commit `b1f76da`), where all pictures are stored inline in one record. The script prints one JSON line per result.

| File | Purpose |
|---|---|
| `run.ps1` | Runner. Builds the benchmark copy, starts it with `web-ext run` in headless Firefox with a temporary profile, waits for the results, then stops only that Firefox and prints the results. Results come back as small files that the extension downloads to `<Downloads>\qdbench`; the script reads them and deletes the folder. |
| `build.js` | `node build.js <src> <out> <ng\|orig>`. Copies the extension and adds the benchmark scripts. Writes `bench/config.js` with the format and the extension's default settings. Changes the manifest: the background page runs the benchmark scripts, the `downloads` permission is added, and the ID becomes `quickdial-bench-<format>@local` so it never clashes with the installed extension. Adds `probe.js` to `dial.html`. |
| `seed.js` | Background side. Seeds the profile with data shaped like a real one: a Quick Dial folder with 13 bookmarks on an 8×12 grid, 600×450 WebP pictures and realistic settings. Then loads the extension's `background.js` and measures startup reads, bookmark sync, saving after a change, the same data in the original inline format, and 12 new tab openings. Has a 90-second watchdog. |
| `probe.js` | New tab side, injected into `dial.html`. Records when settings are applied, the grid is filled, all pictures are set and decoded, and the page has painted, then reports these times to `seed.js`. |

## Startup profiling

```
node test\bench\startup.js <firefox.exe> <profileCopyDir> <runs> <label> <results.jsonl> [options]
node test\bench\startup-report.js <results.jsonl> [more.jsonl ...]
```

Never point `startup.js` at a profile you use. It writes `user.js` and can disable add-ons. Copy the profile first (with Firefox closed) and delete the copy afterwards, because it contains private browsing data.

| File | Purpose |
|---|---|
| `startup.js` | Launches Firefox `<runs>` times plus one warm-up launch, controlling it through Marionette (Firefox's built-in remote control, no extra packages). Each launch records Firefox's own startup timings, the per-extension timings Firefox keeps, when the start tab's page painted, and how fast a new tab shows its pictures. Appends one JSON line per launch to the results file and a readable log next to it. Options: `--disable-ng` (compare without Quick Dial NG), `--homepage <url>` (set Firefox's home page), `--gecko-profile <file>` (record the last launch with the Firefox Profiler; open the file at profiler.firefox.com), `--headful` (show the window), `--discover` (dump everything Firefox exposes; for development). |
| `startup-report.js` | Summarizes one or more results files: medians per series, with warm-up launches excluded. Shows window paint, session restore, start tab paint, new tab timings, and per-extension startup, background page load and storage read times. |
| `gecko-markers.js` | `node gecko-markers.js <profile.json> <regex> [--names] [--threads] [--exclude <regex>]`. Lists Firefox Profiler markers matching a pattern on one timeline across all processes, e.g. everything mentioning an extension's ID. `--names` counts marker names per thread instead, which helps to find what a recording contains. |
