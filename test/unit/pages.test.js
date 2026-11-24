// The pages (src/*.html, src/html/*.html): element ids are unique on their page, also ignoring case (CODE_STYLE.md,
// HTML and CSS). Settings and Properties reach their elements as globals by id (window.BtnApply), so a second
// element with the same id would quietly take the place of the first.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', 'src');
// The ids the pages are expected to have at least (a sign the search found them)
const MIN_IDS = 100;

const pages = fs.readdirSync(SRC, { recursive: true }).filter(file => file.endsWith('.html'));
const idsOf = page => [...fs.readFileSync(path.join(SRC, page), 'utf8').matchAll(/\sid="([^"]*)"/g)].map(match => match[1]);
// The values that appear more than once in a list
const repeated = values => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

test('pages: element ids are unique on each page, also ignoring case', () => {
	let idCount = 0;
	for (const page of pages) {
		const ids = idsOf(page);
		idCount += ids.length;
		assert.deepEqual(repeated(ids), [], `${page}: the same id twice`);
		assert.deepEqual(repeated(ids.map(id => id.toLowerCase())), [], `${page}: two ids that differ only by case`);
	}
	assert.ok(idCount > MIN_IDS, `found the ids in the pages (${idCount} in ${pages.length} pages)`);
});
