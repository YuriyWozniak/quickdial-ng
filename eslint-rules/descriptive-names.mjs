// ESLint rule qdng/descriptive-names (CODE_STYLE.md, Names): a name declared in the code (a variable, a function,
// a parameter, a class) says what it holds, so it is longer than two letters. Short names are left for what
// CODE_STYLE.md allows: loop indexes (i, j), events and errors (e), the parameters of a one-line arrow function
// (t => t.name, (a, b) => a - b), and short words that are names in their own right (id, fs, ms...).
//
//   'qdng/descriptive-names': ['error', { minLength: 3, allow: ['id', 'ok'] }]

const DEFAULT_MIN_LENGTH = 3;
const DEFAULT_ALLOWED = ['i', 'j', 'e', '_', 'id', 'ok', 'fs', 'os', 'vm', 'ms', 'px'];

// The identifiers a declaration pattern binds: x, { a, b: c }, [d, ...e], f = 1
function boundIdentifiers(pattern) {
	if (!pattern) return [];
	switch (pattern.type) {
		case 'Identifier': return [pattern];
		case 'ObjectPattern': return pattern.properties.flatMap(property => boundIdentifiers(property.type === 'RestElement' ? property.argument : property.value));
		case 'ArrayPattern': return pattern.elements.flatMap(boundIdentifiers);
		case 'RestElement': return boundIdentifiers(pattern.argument);
		case 'AssignmentPattern': return boundIdentifiers(pattern.left);
		default: return [];
	}
}

// A one-line arrow function: its body is an expression, not a block
const isShortArrow = fn => fn.type === 'ArrowFunctionExpression' && fn.body.type !== 'BlockStatement';

export default {
	meta: {
		type: 'suggestion',
		docs: { description: 'Names longer than two letters, except loop indexes, events and the parameters of one-line arrow functions' },
		schema: [{ type: 'object', properties: { minLength: { type: 'integer', minimum: 1 }, allow: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }],
		messages: { tooShort: '"{{name}}" doesn\'t say what it holds: give it a name of what it is (CODE_STYLE.md, Names).' }
	},
	create(context) {
		const options = context.options[0] || {};
		const minLength = options.minLength || DEFAULT_MIN_LENGTH;
		const allowed = new Set([...DEFAULT_ALLOWED, ...(options.allow || [])]);
		const check = identifier => {
			if (identifier.name.length < minLength && !allowed.has(identifier.name)) context.report({ node: identifier, messageId: 'tooShort', data: { name: identifier.name } });
		};
		const checkFunction = fn => {
			if (fn.id) check(fn.id);
			if (!isShortArrow(fn)) fn.params.flatMap(boundIdentifiers).forEach(check);
		};
		return {
			VariableDeclarator: declarator => boundIdentifiers(declarator.id).forEach(check),
			FunctionDeclaration: checkFunction,
			FunctionExpression: checkFunction,
			ArrowFunctionExpression: checkFunction,
			ClassDeclaration: declaration => { if (declaration.id) check(declaration.id); },
			CatchClause: clause => boundIdentifiers(clause.param).forEach(check)
		};
	}
};
