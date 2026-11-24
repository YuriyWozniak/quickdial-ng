// The project's own ESLint rules, as one plugin: qdng. eslint.config.mjs registers it once and turns its rules on
// for the files they suit. A new rule goes in its own file here and gets a line in `rules` below.
import descriptiveNames from './descriptive-names.mjs';
import cssNames from './css-names.mjs';
import colorTokens from './color-tokens.mjs';

export default {
	meta: { name: 'qdng' },
	rules: {
		'descriptive-names': descriptiveNames, // scripts: CODE_STYLE.md, Names
		'css-names': cssNames, // stylesheets: CODE_STYLE.md, HTML and CSS
		'color-tokens': colorTokens // stylesheets: CODE_STYLE.md, HTML and CSS
	}
};
