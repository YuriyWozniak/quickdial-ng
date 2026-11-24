// ESLint rule qdng/color-tokens (CODE_STYLE.md, HTML and CSS), for the stylesheets (language css/css): colours come
// from the tokens at the top of css/ui.css (var(--qd-accent)), so a theme or the dark scheme changes them in one place.
// A colour written out in a declaration (#fff, rgba(...), hsl(...), white) is reported; the token definitions
// themselves (custom properties: --qd-text: #15141a) are where colours belong, and so are left alone. Mixing
// tokens (color-mix(in srgb, var(--qd-ok) 45%, transparent)), transparent and currentcolor are fine.
//
//   'qdng/color-tokens': 'error'

const COLOR_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color']);
const COLOR_KEYWORDS_ALLOWED = new Set(['transparent', 'currentcolor']);

export default {
	meta: {
		type: 'suggestion',
		languages: ['css/css'],
		docs: { description: 'Colours from the --qd- tokens, not written out in declarations' },
		schema: [],
		messages: { literal: 'Colour "{{text}}": use a --qd- colour token from css/ui.css, adding one there if none fits (CODE_STYLE.md, HTML and CSS).' }
	},
	create(context) {
		const { sourceCode } = context;
		const lexer = sourceCode.lexer;
		let inDeclaration = false; // in the value of a declaration that is not a custom property
		const report = node => context.report({ loc: node.loc, messageId: 'literal', data: { text: sourceCode.getText(node) } });
		const isNamedColor = node => !COLOR_KEYWORDS_ALLOWED.has(node.name.toLowerCase()) && lexer.matchType('named-color', node).matched !== null;
		return {
			Declaration(node) { inDeclaration = !node.property.startsWith('--'); },
			'Declaration:exit'() { inDeclaration = false; },
			Hash(node) { if (inDeclaration) report(node); },
			Function(node) { if (inDeclaration && COLOR_FUNCTIONS.has(node.name.toLowerCase())) report(node); },
			Identifier(node) { if (inDeclaration && isNamedColor(node)) report(node); }
		};
	}
};
