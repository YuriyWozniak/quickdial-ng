// The project's own ESLint rules, as one plugin: qdng. eslint.config.mjs registers it once and turns its rules on
// for the files they suit. A new rule goes in its own file here and gets a line in `rules` below.
import descriptiveNames from './descriptive-names.mjs';

export default {
	meta: { name: 'qdng' },
	rules: {
		'descriptive-names': descriptiveNames // CODE_STYLE.md, Names
	}
};
