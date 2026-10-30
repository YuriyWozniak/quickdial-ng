// Build a benchmark copy of the extension: node test/bench/build.js <srcDir> <outDir> <ng|orig>
const fs = require('fs'), path = require('path');
const [src, out, format] = process.argv.slice(2);
if(!src || !out || !['ng','orig'].includes(format)) { console.error('usage: build.js <srcDir> <outDir> <ng|orig>'); process.exit(1); }
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.mkdirSync(path.join(out, 'bench'), { recursive: true });
for (const f of ['seed.js', 'probe.js']) fs.copyFileSync(path.join(__dirname, f), path.join(out, 'bench', f));
// Default settings come from the extension itself
const bg = fs.readFileSync(path.join(src, 'js', 'background.js'), 'utf8');
const m = bg.match(/app\.Settings\.defaults = function\(\)\{[^]*?return (\{[^]*?\r?\n\t\});\r?\n\};/) || bg.match(/data = \{ version: 4, settings: (\{[^]*?\r?\n\t\t\t\t\}), node/);
let defaults;
if (m) defaults = m[1]; else {
	// Upstream keeps defaults inline in the loader; fall back to NG's
	const ng = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'js', 'background.js'), 'utf8');
	defaults = ng.match(/app\.Settings\.defaults = function\(\)\{[^]*?return (\{[^]*?\r?\n\t\});\r?\n\};/)[1];
}
fs.writeFileSync(path.join(out, 'bench', 'config.js'), `var BENCH_FORMAT = ${JSON.stringify(format)};\nvar BENCH_DEFAULTS = ${defaults};\n`);
const manPath = path.join(out, 'manifest.json');
const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
man.background.scripts = ['bench/config.js', 'bench/seed.js']; // seed.js loads js/background.js itself once data is in place
man.browser_specific_settings.gecko.id = 'quickdial-bench-' + format + '@local';
fs.writeFileSync(manPath, JSON.stringify(man, null, 2));
const dialPath = path.join(out, 'dial.html');
fs.writeFileSync(dialPath, fs.readFileSync(dialPath, 'utf8').replace(/(<script[^>]*src="js\/dial\.js"><\/script>)/, '$1<script src="bench/probe.js"></script>'));
console.log('built', format, 'bench in', out);
