import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  matchesStandardsPathFilter,
  parseChildResult,
  runStandards,
  selectStandardsRows,
} from '../lib/standardsRunner.mjs';

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

test('selectStandardsRows maps PR paths to filtered and always-run rows', () => {
  const rows = [
    row('row-1', { pr_filter_paths: ['README.md'] }),
    row('row-3', { pr_filter_paths: ['packages/yops/**'] }),
    row('row-6', { pr_runs_always: true }),
  ];

  const selected = selectStandardsRows({
    rows,
    mode: 'pr',
    changedPaths: ['packages/yops/src/engine.ts'],
  });

  assert.deepEqual(
    selected.map((selectedRow) => selectedRow.id),
    ['row-3', 'row-6']
  );
});

test('matchesStandardsPathFilter supports standards workflow globs', () => {
  assert.equal(
    matchesStandardsPathFilter(
      '.github/workflows/standards-pr.yml',
      '.github/workflows/standards-*.yml'
    ),
    true
  );
});

test('parseChildResult accepts the row result JSON contract', () => {
  const result = parseChildResult({
    rowId: 'row-6',
    stdout: JSON.stringify({
      row_id: 'row-6',
      status: 'pass',
      summary: 'Contributor files are present.',
      details: ['Checked four files.'],
    }),
  });

  assert.deepEqual(result, {
    row_id: 'row-6',
    status: 'pass',
    summary: 'Contributor files are present.',
    details: ['Checked four files.'],
  });
});

test('parseChildResult rejects malformed child output', () => {
  assert.throws(
    () =>
      parseChildResult({
        rowId: 'row-6',
        stdout: JSON.stringify({ row_id: 'row-6', status: 'ok', summary: 'nope' }),
      }),
    /status must be one of pass, fail, manual, skipped/
  );
});

test('parseChildResult requires the child row id', () => {
  assert.throws(
    () =>
      parseChildResult({
        rowId: 'row-6',
        stdout: JSON.stringify({ status: 'pass', summary: 'missing row id' }),
      }),
    /row_id must be row-6/
  );
});

test('runStandards returns a failing exit code for a failed child row', async () => {
  const rootDir = makeTempRoot({
    'row-6': {
      acceptance_type: 'automated',
      acceptance_command: 'node tools/standards/fail-row-6.mjs',
      pr_runs_always: true,
    },
  });

  const result = await runStandards({
    rootDir,
    mode: 'full',
    requestedRows: ['row-6'],
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.failed, 1);
  assert.deepEqual(result.results, [
    {
      row_id: 'row-6',
      title: 'row-6 title',
      status: 'fail',
      summary: 'row-6 failed.',
      details: ['fixture failure'],
    },
  ]);
});

test('runStandards reports selected manual rows without failing', async () => {
  const rootDir = makeTempRoot({
    'row-1': {
      pr_filter_paths: ['README.md'],
    },
  });

  const result = await runStandards({
    rootDir,
    mode: 'pr',
    changedPaths: ['README.md'],
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.summary.manual, 1);
  assert.deepEqual(result.results, [
    {
      row_id: 'row-1',
      title: 'row-1 title',
      status: 'manual',
      summary: 'Manual acceptance required.',
      details: [],
    },
  ]);
});

function row(id, overrides = {}) {
  return {
    id,
    title: `${id} title`,
    acceptance: `${id} acceptance`,
    acceptance_type: 'manual',
    owner_workstream: 'test',
    ...overrides,
  };
}

function makeTempRoot(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 't3x-standards-runner-'));
  mkdirSync(join(dir, 'standards'), { recursive: true });
  mkdirSync(join(dir, 'tools/standards'), { recursive: true });
  writeFileSync(join(dir, 'standards/matrix.yaml'), makeMatrixYaml(overrides));
  writeFileSync(
    join(dir, 'tools/standards/fail-row-6.mjs'),
    `process.stdout.write(JSON.stringify({
  row_id: 'row-6',
  status: 'fail',
  summary: 'row-6 failed.',
  details: ['fixture failure']
}));
process.exit(1);
`
  );
  return pathToFileURL(`${dir}/`);
}

function makeMatrixYaml(overrides = {}) {
  const rows = STANDARDS_ROW_IDS.map((id) => row(id, overrides[id]))
    .map((matrixRow) =>
      [
        `  - id: ${matrixRow.id}`,
        `    title: ${matrixRow.title}`,
        `    acceptance: ${matrixRow.acceptance}`,
        `    acceptance_type: ${matrixRow.acceptance_type}`,
        matrixRow.acceptance_command
          ? `    acceptance_command: ${matrixRow.acceptance_command}`
          : null,
        Array.isArray(matrixRow.pr_filter_paths)
          ? [
              '    pr_filter_paths:',
              ...matrixRow.pr_filter_paths.map((path) => `      - ${path}`),
            ].join('\n')
          : null,
        typeof matrixRow.pr_runs_always === 'boolean'
          ? `    pr_runs_always: ${matrixRow.pr_runs_always}`
          : null,
        `    owner_workstream: ${matrixRow.owner_workstream}`,
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n');

  return `version: 1
source_doc: notes/docs/hlq_docs/alpha/open-source-product-standard.md
rows:
${rows}
`;
}
