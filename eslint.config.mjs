// ESLint for the extension's code (src/). Run: npm install, then npm run lint (or npm run lint:fix).
// The pages are plain scripts sharing a few globals; no build step, no modules.
import fs from 'node:fs';
import js from '@eslint/js';
import globals from 'globals';

// Settings and Properties reach their form elements by id (window.BtnApply...): those ids are globals there
const idsOf = page => Object.fromEntries([...fs.readFileSync(new URL(page, import.meta.url), 'utf8').matchAll(/\sid="([A-Za-z_][\w]*)"/g)].map(m => [m[1], 'readonly']));

export default [
	{ files: ['src/**/*.js', 'test/**/*.js'] },
	{ ignores: ['*.mjs', 'release/**', 'node_modules/**', 'web-ext-artifacts/**', 'test/node_modules/**', 'test/bench/**', 'test/screenshots/**'] },
	js.configs.recommended,
	{
		files: ['src/**/*.js'],
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'script',
			globals: {
				...globals.browser,
				...globals.webextensions,
				QDCommon: 'readonly', // js/common.js
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
	{ files: ['src/js/common.js'], languageOptions: { globals: { QDCommon: 'off' } } },
	{ files: ['src/js/themes.js'], languageOptions: { globals: { QDThemes: 'off' } } },
	{ files: ['src/js/ui.js'], languageOptions: { globals: { QDUI: 'off' } } },
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
			'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }]
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
	{ files: ['test/mock.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser, S: 'writable' } } }
];
