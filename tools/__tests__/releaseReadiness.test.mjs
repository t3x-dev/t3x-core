import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../..', import.meta.url);

async function loadReadiness() {
  try {
    return await import('../lib/releaseReadiness.mjs');
  } catch (error) {
    assert.fail(`release readiness library should load: ${error.message}`);
  }
}

test('builds a ready report when hard gates pass and manual gates are approved', async () => {
  const { buildReleaseReadinessReport, renderReleaseReadinessMarkdown, REPORT_MARKER } =
    await loadReadiness();

  const report = buildReleaseReadinessReport({
    generatedAt: '2026-06-05T00:00:00.000Z',
    release: {
      pr_number: 1087,
      base_ref: 'main',
      head_ref: 'release/0.4.0',
      product_version: '0.4.0',
    },
    standardsRun: standardsRun([
      standardsResult('row-3', 'YOps stability', 'pass', 'YOps stability passed.'),
      standardsResult('row-4', 'API surface', 'pass', 'API surface passed.'),
      standardsResult('row-6', 'External release review', 'manual', 'Manual review required.'),
    ]),
    releaseSurface: releaseSurface({ npmPublishPackages: ['@t3x-dev/local'] }),
    testerEvidence: [
      {
        id: 'external-alpha-smoke',
        tester: 'external-reviewer',
        status: 'pass',
        summary: 'Installer and local smoke paths passed.',
        url: 'https://github.com/t3x-dev/t3x-core/actions/runs/1',
      },
    ],
    signoffState: {
      schema_version: 1,
      decisions: [
        {
          row_id: 'row-6',
          decision: 'approve',
          author: 'etht3x',
          reason: 'Reviewed external tester evidence.',
          decided_at: '2026-06-05T00:01:00.000Z',
        },
      ],
    },
  });

  assert.equal(report.status, 'ready');
  assert.equal(report.outstanding_blockers.length, 0);
  assert.deepEqual(
    report.hard_gates.map((gate) => [gate.id, gate.status]),
    [
      ['row-3', 'pass'],
      ['row-4', 'pass'],
      ['release-surface', 'pass'],
      ['external-tester-evidence', 'pass'],
    ]
  );
  assert.deepEqual(report.manual_gates, [
    {
      id: 'row-6',
      title: 'External release review',
      status: 'approved',
      summary: 'Manual review required.',
      owner_decision: {
        row_id: 'row-6',
        decision: 'approve',
        author: 'etht3x',
        reason: 'Reviewed external tester evidence.',
        decided_at: '2026-06-05T00:01:00.000Z',
      },
    },
  ]);

  const markdown = renderReleaseReadinessMarkdown(report);
  assert.match(markdown, new RegExp(escapeRegExp(REPORT_MARKER)));
  assert.match(markdown, /Status: ready/);
  assert.match(markdown, /External Tester Evidence/);
  assert.match(markdown, /external-alpha-smoke/);
});

test('blocks readiness when hard gates or external tester evidence fail', async () => {
  const { buildReleaseReadinessReport } = await loadReadiness();

  const report = buildReleaseReadinessReport({
    generatedAt: '2026-06-05T00:00:00.000Z',
    standardsRun: standardsRun([
      standardsResult('row-3', 'YOps stability', 'pass', 'YOps stability passed.'),
      standardsResult('row-4', 'API surface', 'fail', 'API surface changed unexpectedly.'),
    ]),
    releaseSurface: releaseSurface({
      errors: ['@t3x-dev/local publishConfig.access is public, expected restricted'],
    }),
    testerEvidence: [
      {
        id: 'external-alpha-smoke',
        tester: 'external-reviewer',
        status: 'fail',
        summary: 'Local installer failed.',
      },
    ],
    signoffState: { schema_version: 1, decisions: [] },
  });

  assert.equal(report.status, 'blocked');
  assert.deepEqual(
    report.outstanding_blockers.map((blocker) => blocker.code),
    ['standards.row-4.fail', 'release-surface.error', 'tester-evidence.external-alpha-smoke.fail']
  );
});

test('keeps readiness manual-pending when manual rows have no owner decision', async () => {
  const { buildReleaseReadinessReport } = await loadReadiness();

  const report = buildReleaseReadinessReport({
    generatedAt: '2026-06-05T00:00:00.000Z',
    standardsRun: standardsRun([
      standardsResult('row-3', 'YOps stability', 'pass', 'YOps stability passed.'),
      standardsResult('row-6', 'External release review', 'manual', 'Manual review required.'),
    ]),
    releaseSurface: releaseSurface(),
    testerEvidence: [],
    signoffState: { schema_version: 1, decisions: [] },
  });

  assert.equal(report.status, 'manual_pending');
  assert.deepEqual(
    report.manual_gates.map((gate) => [gate.id, gate.status]),
    [['row-6', 'pending']]
  );
  assert.deepEqual(
    report.soft_warnings.map((warning) => warning.code),
    ['tester-evidence.missing']
  );
  assert.equal(report.outstanding_blockers.length, 0);
});

test('commits the markdown and JSON schema for the readiness report contract', () => {
  const releaseFlow = readFileSync(new URL('.github/release-flow.md', root), 'utf8');
  const schema = JSON.parse(
    readFileSync(new URL('release/readiness-report.schema.json', root), 'utf8')
  );

  assert.match(releaseFlow, /Release Readiness Report Schema/);
  assert.match(releaseFlow, /Hard gates/);
  assert.match(releaseFlow, /Manual gates/);
  assert.match(releaseFlow, /Soft warnings/);
  assert.match(releaseFlow, /Outstanding blockers/);
  assert.match(releaseFlow, /External tester evidence/);
  assert.match(releaseFlow, /Owner decisions/);
  assert.match(releaseFlow, /release\/readiness\/tester-evidence\/\*\.json/);

  assert.equal(schema.$id, 'https://t3x.dev/schemas/release-readiness-report.schema.json');
  assert.deepEqual(schema.required, [
    'schema_version',
    'generated_at',
    'status',
    'release',
    'hard_gates',
    'manual_gates',
    'soft_warnings',
    'outstanding_blockers',
    'external_tester_evidence',
    'owner_decisions',
  ]);
});

test('keeps a committed fixture report for report contract tests', async () => {
  const { renderReleaseReadinessMarkdown, validateReleaseReadinessReport } = await loadReadiness();
  const fixture = JSON.parse(
    readFileSync(new URL('tools/__fixtures__/release-readiness/ready-report.json', root), 'utf8')
  );

  assert.deepEqual(validateReleaseReadinessReport(fixture).errors, []);
  assert.equal(fixture.status, 'ready');
  assert.match(renderReleaseReadinessMarkdown(fixture), /Status: ready/);
});

function standardsRun(results) {
  return {
    mode: 'full',
    changedPaths: [],
    selectedRows: results.map((result) => result.row_id),
    results,
    summary: {
      passed: results.filter((result) => result.status === 'pass').length,
      failed: results.filter((result) => result.status === 'fail').length,
      manual: results.filter((result) => result.status === 'manual').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      total: results.length,
    },
    exitCode: results.some((result) => result.status === 'fail') ? 1 : 0,
  };
}

function standardsResult(row_id, title, status, summary) {
  return {
    row_id,
    title,
    status,
    summary,
    details: [],
  };
}

function releaseSurface(overrides = {}) {
  return {
    errors: [],
    warnings: [],
    npmPublishPackages: ['@t3x-dev/local', '@t3x-dev/yops'],
    packages: [],
    ...overrides,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
