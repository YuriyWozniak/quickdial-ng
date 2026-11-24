// ESLint rule qdng/css-names (CODE_STYLE.md, HTML and CSS), for the stylesheets (language css/css):
//   - classes are kebab-case with the qd- prefix (qd-grid, qd-tile-slot), states and variants is-* (is-loading);
//   - element ids are PascalCase, as the Settings and Properties pages use them as globals (BtnApply, ImageZone);
//   - custom properties, defined or read with var(), start with --qd- (--qd-accent).
// `allow` lists class names that keep their own: the .qd root class the base styles sit under.
//
//   'qdng/css-names': ['error', { allow: ['qd'] }]

const CLASS_NAME = /^(qd|is)-[a-z0-9]+(-[a-z0-9]+)*$/;
const ID_NAME = /^[A-Z][A-Za-z0-9]*$/;
const CUSTOM_PROPERTY_PREFIX = '--qd-';

// A node's first child: CSSTree keeps children in a List (with .first), plain trees in an array
const firstChild = node => Array.isArray(node.children) ? node.children[0] : node.children && node.children.first;

export default {
	meta: {
		type: 'suggestion',
		languages: ['css/css'],
		docs: { description: 'qd- and is-* classes, PascalCase ids and --qd- custom properties' },
		schema: [{ type: 'object', properties: { allow: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }],
		messages: {
			className: 'Class "{{name}}": classes are qd-name, and states or variants is-name, in kebab-case (CODE_STYLE.md, HTML and CSS).',
			idName: 'Id "{{name}}": element ids are PascalCase (CODE_STYLE.md, HTML and CSS).',
			customProperty: 'Custom property "{{name}}": custom properties start with --qd- (CODE_STYLE.md, HTML and CSS).'
		}
	},
	create(context) {
		const allowed = new Set((context.options[0] || {}).allow || []);
		const checkCustomProperty = (node, name) => {
			if (name.startsWith('--') && !name.startsWith(CUSTOM_PROPERTY_PREFIX)) context.report({ loc: node.loc, messageId: 'customProperty', data: { name } });
		};
		return {
			ClassSelector(node) {
				if (!CLASS_NAME.test(node.name) && !allowed.has(node.name)) context.report({ loc: node.loc, messageId: 'className', data: { name: node.name } });
			},
			IdSelector(node) {
				if (!ID_NAME.test(node.name)) context.report({ loc: node.loc, messageId: 'idName', data: { name: node.name } });
			},
			Declaration(node) {
				checkCustomProperty(node, node.property);
			},
			Function(node) { // var(--name, fallback): its first argument
				if (node.name.toLowerCase() !== 'var') return;
				const first = firstChild(node);
				if (first && first.type === 'Identifier') checkCustomProperty(first, first.name);
			}
		};
	}
};
