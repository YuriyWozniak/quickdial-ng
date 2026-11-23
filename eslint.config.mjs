// ESLint for the extension's code (src/): the scripts and the stylesheets (@eslint/css).
// Run: npm install, then npm run lint (or npm run lint:fix).
// The pages are plain scripts sharing a few globals; no build step, no modules.
import fs from 'node:fs';
import js from '@eslint/js';
import css from '@eslint/css';
import globals from 'globals';

// The physical properties and units prefer-logical-properties knows: allowed, except those for left and right,
// which flip in a right-to-left language (top, width or vh are the same in every language the pages use)
const logical = css.rules['prefer-logical-properties'].meta.schema[0].properties;
const UP_DOWN_PROPERTIES = logical.allowProperties.items.enum.filter(p => !/left|right/.test(p));
const VIEWPORT_UNITS = logical.allowUnits.items.enum;

// Settings and Properties reach their form elements by id (window.BtnApply...): those ids are globals there
const idsOf = page => Object.fromEntries([...fs.readFileSync(new URL(page, import.meta.url), 'utf8').matchAll(/\sid="([A-Za-z_][\w]*)"/g)].map(m => [m[1], 'readonly']));

export default [
	{ files: ['src/**/*.js', 'test/**/*.js'] },
	{ ignores: ['*.mjs', 'release/**', 'node_modules/**', 'web-ext-artifacts/**', 'test/node_modules/**', 'test/screenshots/**'] },
	{ files: ['**/*.js'], ...js.configs.recommended },

	// Stylesheets: the recommended rules, and logical properties for left and right (CODE_STYLE.md: layout works right to left too)
	{
		files: ['src/**/*.css'],
		plugins: { css },
		language: 'css/css',
		rules: {
			...css.configs.recommended.rules,
			// The tokens (--qd-*) are defined in css/ui.css, or set by script, so another file can't look them up
			'css/no-invalid-properties': ['error', { allowUnknownVariables: true }],
			// Baseline means every major browser, Safari included; the extension runs only in Firefox (140 and later).
			// Newly available features are fine there, and so are these two, unprefixed in Firefox.
			'css/use-baseline': ['error', { available: 'newly', allowProperties: ['user-select', 'accent-color'] }],
			'css/prefer-logical-properties': ['error', { allowProperties: UP_DOWN_PROPERTIES, allowUnits: VIEWPORT_UNITS }]
		}
	},
	{
		files: ['src/**/*.js'],
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'script',
			globals: {
				...globals.browser,
				...globals.webextensions,
				QDCommon: 'readonly', // js/common.js
				QDClient: 'readonly', // js/common.js
				QDThemes: 'readonly', // js/themes.js
				QDUI: 'readonly' // js/ui.js
			}
		},
		rules: {
			'no-var': 'error',
			'prefer-const': ['error', { destructuring: 'all' }],
			'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
			'no-empty': ['error', { allowEmptyCatch: true }],
			'no-redeclare': ['error', { builtinGlobals: true }], // e.g. a page variable called Image
			'no-implicit-globals': 'error',
			'no-shadow-restricted-names': 'error',
			'prefer-arrow-callback': ['error', { allowUnboundThis: false }],
			// CODE_STYLE.md: camelCase names (UPPER_SNAKE constants are allowed), single quotes, semicolons
			camelcase: ['error', { properties: 'always' }],
			quotes: ['error', 'single', { avoidEscape: true }],
			semi: 'error'
		}
	},
	// The scripts that define those globals (with `var` and an /* exported */ comment, so they are window properties)
	{ files: ['src/js/common.js'], languageOptions: { globals: { QDCommon: 'off', QDClient: 'off' } } },
	{ files: ['src/js/themes.js'], languageOptions: { globals: { QDThemes: 'off' } } },
	{ files: ['src/js/ui.js'], languageOptions: { globals: { QDUI: 'off' } } },
	// The dial page: js/grid.js draws (dial), js/dial.js controls (app); each uses the other's global
	{ files: ['src/js/grid.js'], languageOptions: { globals: { app: 'readonly' } } },
	{ files: ['src/js/dial.js'], languageOptions: { globals: { dial: 'readonly' } } },
	{ files: ['src/js/background/*.js'], ignores: ['src/js/background/app.js'], languageOptions: { globals: { app: 'writable' } } },
	{ files: ['src/js/settings.js'], languageOptions: { globals: idsOf('./src/html/settings.html') } },
	{ files: ['src/js/properties.js'], languageOptions: { globals: idsOf('./src/html/properties.html') } },

	// Tests (Node). Functions passed to page.evaluate run in the test pages, so the integration tests may
	// also use the host page's helpers (test/index.html, test/mock.js) and the pages' own globals.
	{
		files: ['test/**/*.js'],
		languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node } },
		rules: {
			'no-var': 'error',
			'prefer-const': ['error', { destructuring: 'all' }],
			'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
			// CODE_STYLE.md holds for the tests too: camelCase names, single quotes, semicolons, Node spacing (if (x) {)
			camelcase: ['error', { properties: 'always' }],
			quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
			semi: 'error',
			'keyword-spacing': 'error',
			'space-before-blocks': 'error'
		}
	},
	{
		files: ['test/integration/*.js', 'test/lib/*.js'],
		languageOptions: {
			globals: {
				...globals.browser,
				S: 'readonly', fire: 'readonly', loadFrame: 'readonly', win: 'readonly', bg: 'readonly', bgIdle: 'readonly', makeBrowser: 'readonly', tester: 'writable',
				dial: 'readonly', app: 'readonly',
				...idsOf('./src/html/settings.html'), ...idsOf('./src/html/properties.html')
			}
		}
	},
	{ files: ['test/mock.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser, S: 'writable' } } },
	// Benchmarks (test/bench): the Node tools may leave a catch empty where a failure only means "not yet" or "already gone"
	{ files: ['test/bench/*.js'], rules: { 'no-empty': ['error', { allowEmptyCatch: true }] } },
	// ...and three scripts run inside the benchmark copy of the extension (build.js puts them there)
	{
		files: ['test/bench/seed.js', 'test/bench/early.js', 'test/bench/probe.js'],
		languageOptions: {
			sourceType: 'script',
			globals: {
				...globals.browser, ...globals.webextensions,
				BENCH_FORMAT: 'readonly', BENCH_DEFAULTS: 'readonly', BENCH_SCRIPTS: 'readonly', BENCH_OPTIONS: 'readonly', // bench/config.js
				BENCH_SHARED: 'readonly' // bench/shared.js
			}
		}
	}
];
