// Build a benchmark copy of the extension: node test/bench/build.js <srcDir> <outDir> <ng|orig>
const fs = require('fs'), path = require('path'), vm = require('vm');
const [src, out, format] = process.argv.slice(2);
if(!src || !out || !['ng','orig'].includes(format)) { console.error('usage: build.js <srcDir> <outDir> <ng|orig>'); process.exit(1); }
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.mkdirSync(path.join(out, 'bench'), { recursive: true });
for (const f of ['seed.js', 'probe.js']) fs.copyFileSync(path.join(__dirname, f), path.join(out, 'bench', f));
const manPath = path.join(out, 'manifest.json');
const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
const bgScripts = man.background.scripts; // seed.js loads these itself once data is in place
// Default settings come from the extension itself
const bg = bgScripts.map(s => fs.readFileSync(path.join(src, s), 'utf8')).join('\n');
const m = bg.match(/data = \{ version: 4, settings: (\{[^]*?\r?\n\t\t\t\t\}), node/); // the original keeps them inline in its loader
let defaults;
if (m) defaults = m[1];
else { // Quick Dial NG: run its background scripts (without main.js, which starts it) and ask
	const ctx = vm.createContext({ console });
	for (const s of bgScripts) if (!/(^|\/)main\.js$/.test(s)) vm.runInContext(fs.readFileSync(path.join(src, s), 'utf8'), ctx, { filename: s });
	defaults = JSON.stringify(vm.runInContext('app.Settings.defaults()', ctx), null, '\t');
}
fs.writeFileSync(path.join(out, 'bench', 'config.js'), `var BENCH_FORMAT = ${JSON.stringify(format)};\nvar BENCH_DEFAULTS = ${defaults};\nvar BENCH_SCRIPTS = ${JSON.stringify(bgScripts)};\n`);
man.permissions.push('downloads');
man.background.scripts = ['bench/config.js', 'bench/seed.js'];
man.browser_specific_settings.gecko.id = 'quickdial-bench-' + format + '@local';
fs.writeFileSync(manPath, JSON.stringify(man, null, 2));
const dialPath = path.join(out, 'dial.html');
fs.writeFileSync(dialPath, fs.readFileSync(dialPath, 'utf8').replace(/(<script[^>]*src="js\/dial\.js"><\/script>)/, '$1<script src="bench/probe.js"></script>'));
console.log('built', format, 'bench in', out);
