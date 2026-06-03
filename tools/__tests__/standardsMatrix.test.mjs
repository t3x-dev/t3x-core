import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { validateStandardsMatrix } from '../lib/standardsMatrix.mjs';

const root = new URL('../..', import.meta.url);
const STANDARDS_ROW_IDS = [
  'row-1',
  'row-2a',
  'row-2b',
  'row-2c',
  'row-3',
  'row-4',
  'row-5',
  'row-6',
  'row-7',
  'row-8',
];

test('standards matrix declares the alpha readiness rows from the notes source', () => {
  const result = validateStandardsMatrix({ rootDir: root });

  assert.deepEqual(result.errors, []);
  assert.equal(
    result.matrix.source_doc,
    'notes/docs/hlq_docs/alpha/open-source-product-standard.md'
  );
  assert.deepEqual(
    result.rows.map((row) => row.id),
    STANDARDS_ROW_IDS
  );
  assert.equal(
    result.rowsById.get('row-2c')?.title,
    'No-key seeded demo produces an inspectable commit in <=10 min'
  );
  assert.match(result.rowsById.get('row-3')?.acceptance ?? '', /STABILITY\.md/);
});

test('standards matrix JSON schema encodes the canonical row set', () => {
  const schema = JSON.parse(readFileSync(new URL('standards/matrix.schema.json', root), 'utf8'));
  const rowsSchema = schema.properties.rows;
  const requiredRowIds = rowsSchema.allOf.map((rule) => rule.contains.properties.id.const);

  assert.equal(rowsSchema.minItems, STANDARDS_ROW_IDS.length);
  assert.equal(rowsSchema.maxItems, STANDARDS_ROW_IDS.length);
  assert.deepEqual(rowsSchema.items.properties.id.enum, STANDARDS_ROW_IDS);
  assert.deepEqual(requiredRowIds, STANDARDS_ROW_IDS);
});

test('standards matrix rejects missing required rows', () => {
  const rootDir = makeTempRoot(`version: 1
source_doc: notes/docs/hlq_docs/alpha/open-source-product-standard.md
rows:
  - id: row-1
    title: One row only
    acceptance: Not enough.
`);

  const result = validateStandardsMatrix({ rootDir });

  assert.deepEqual(result.errors, [
    'standards/matrix.yaml missing row-2a',
    'standards/matrix.yaml missing row-2b',
    'standards/matrix.yaml missing row-2c',
    'standards/matrix.yaml missing row-3',
    'standards/matrix.yaml missing row-4',
    'standards/matrix.yaml missing row-5',
    'standards/matrix.yaml missing row-6',
    'standards/matrix.yaml missing row-7',
    'standards/matrix.yaml missing row-8',
  ]);
});

test('standards matrix rejects duplicate and malformed row entries', () => {
  const rootDir = makeTempRoot(`version: 1
source_doc: wrong/path.md
rows:
  - id: row-1
    title: First
    acceptance: Valid text
  - id: row-1
    title: Second
    acceptance: Valid text
  - id: row-2a
    title: ""
    acceptance: ""
`);

  const result = validateStandardsMatrix({ rootDir });

  assert.deepEqual(result.errors, [
    'standards/matrix.yaml source_doc must be notes/docs/hlq_docs/alpha/open-source-product-standard.md',
    'duplicate standards matrix row: row-1',
    'standards/matrix.yaml rows[2] title must be a non-empty string',
    'standards/matrix.yaml rows[2] acceptance must be a non-empty string',
    'standards/matrix.yaml missing row-2b',
    'standards/matrix.yaml missing row-2c',
    'standards/matrix.yaml missing row-3',
    'standards/matrix.yaml missing row-4',
    'standards/matrix.yaml missing row-5',
    'standards/matrix.yaml missing row-6',
    'standards/matrix.yaml missing row-7',
    'standards/matrix.yaml missing row-8',
  ]);
});

test('standards matrix rejects unknown row ids', () => {
  const rows = [...STANDARDS_ROW_IDS, 'row-9']
    .map(
      (id) => `  - id: ${id}
    title: ${id}
    acceptance: ${id} acceptance`
    )
    .join('\n');
  const rootDir = makeTempRoot(`version: 1
source_doc: notes/docs/hlq_docs/alpha/open-source-product-standard.md
rows:
${rows}
`);

  const result = validateStandardsMatrix({ rootDir });

  assert.deepEqual(result.errors, ['standards/matrix.yaml rows[10] has unknown id: row-9']);
});

test('PR template asks authors to declare matrix row ids', () => {
  const template = readFileSync(new URL('.github/PULL_REQUEST_TEMPLATE.md', root), 'utf8');

  assert.match(template, /^## Matrix Rows$/m);
  for (const rowId of STANDARDS_ROW_IDS) {
    assert.match(template, new RegExp(`\\b${rowId}\\b`));
  }
});

function makeTempRoot(matrixYaml) {
  const dir = mkdtempSync(join(tmpdir(), 't3x-standards-matrix-'));
  mkdirSync(join(dir, 'standards'), { recursive: true });
  writeFileSync(join(dir, 'standards/matrix.yaml'), matrixYaml);
  return pathToFileURL(`${dir}/`);
}
