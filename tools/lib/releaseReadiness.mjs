import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REPORT_MARKER = '<!-- t3x-release-readiness-report:v1 -->';

const REPORT_STATUS = new Set(['ready', 'blocked', 'manual_pending']);
const HARD_GATE_STATUS = new Set(['pass', 'fail', 'skipped']);
const TESTER_EVIDENCE_STATUS = new Set(['pass', 'fail', 'missing']);

export function buildReleaseReadinessReport({
  generatedAt = new Date().toISOString(),
  release = {},
  standardsRun = emptyStandardsRun(),
  releaseSurface = emptyReleaseSurface(),
  testerEvidence = [],
  signoffState = { schema_version: 1, decisions: [] },
} = {}) {
  const ownerDecisions = normalizeOwnerDecisions(signoffState.decisions);
  const decisionByRowId = new Map(ownerDecisions.map((decision) => [decision.row_id, decision]));
  const standardsResults = Array.isArray(standardsRun.results) ? standardsRun.results : [];

  const hardGates = standardsResults
    .filter((result) => result.status !== 'manual')
    .map((result) => standardHardGate(result));
  hardGates.push(releaseSurfaceGate(releaseSurface));
  hardGates.push(externalTesterEvidenceGate(testerEvidence));

  const manualGates = standardsResults
    .filter((result) => result.status === 'manual')
    .map((result) => manualGate(result, decisionByRowId.get(result.row_id)));

  const softWarnings = [
    ...releaseSurfaceWarnings(releaseSurface),
    ...skippedStandardsWarnings(hardGates),
    ...testerEvidenceWarnings(testerEvidence),
  ];
  const outstandingBlockers = [
    ...hardGateBlockers(hardGates),
    ...testerEvidenceBlockers(testerEvidence),
    ...ownerDecisionBlockers(ownerDecisions),
  ];

  const status =
    outstandingBlockers.length > 0
      ? 'blocked'
      : manualGates.some((gate) => gate.status === 'pending')
        ? 'manual_pending'
        : 'ready';

  return {
    schema_version: 1,
    generated_at: generatedAt,
    status,
    release: normalizeRelease(release),
    hard_gates: hardGates,
    manual_gates: manualGates,
    soft_warnings: softWarnings,
    outstanding_blockers: outstandingBlockers,
    external_tester_evidence: normalizeTesterEvidence(testerEvidence),
    owner_decisions: ownerDecisions,
    release_surface: {
      package_count: Array.isArray(releaseSurface.packages) ? releaseSurface.packages.length : 0,
      npm_publish_packages: Array.isArray(releaseSurface.npmPublishPackages)
        ? releaseSurface.npmPublishPackages
        : [],
      warnings: Array.isArray(releaseSurface.warnings) ? releaseSurface.warnings : [],
    },
  };
}

export function renderReleaseReadinessMarkdown(report) {
  const normalized = normalizeReport(report);
  const hardGateRows = normalized.hard_gates.map(
    (gate) =>
      `| \`${escapeMarkdownTable(gate.id)}\` | ${gate.status} | ${escapeMarkdownTable(
        gate.title
      )} | ${escapeMarkdownTable(gate.summary)} |`
  );
  const manualGateRows = normalized.manual_gates.map((gate) => {
    const decision = gate.owner_decision
      ? `${gate.owner_decision.decision} by @${gate.owner_decision.author}`
      : 'pending';
    return `| \`${escapeMarkdownTable(gate.id)}\` | ${gate.status} | ${escapeMarkdownTable(
      gate.title
    )} | ${escapeMarkdownTable(decision)} | ${escapeMarkdownTable(gate.summary)} |`;
  });
  const warningRows = normalized.soft_warnings.map(
    (warning) =>
      `| \`${escapeMarkdownTable(warning.code)}\` | ${escapeMarkdownTable(warning.message)} |`
  );
  const blockerRows = normalized.outstanding_blockers.map(
    (blocker) =>
      `| \`${escapeMarkdownTable(blocker.code)}\` | ${escapeMarkdownTable(
        blocker.source
      )} | ${escapeMarkdownTable(blocker.message)} |`
  );
  const evidenceRows = normalized.external_tester_evidence.map(
    (evidence) =>
      `| \`${escapeMarkdownTable(evidence.id)}\` | ${evidence.status} | ${escapeMarkdownTable(
        evidence.tester
      )} | ${escapeMarkdownTable(evidence.summary)} | ${escapeMarkdownTable(evidence.url || '')} |`
  );
  const decisionRows = normalized.owner_decisions.map(
    (decision) =>
      `| \`${escapeMarkdownTable(decision.row_id)}\` | ${decision.decision} | @${escapeMarkdownTable(
        decision.author
      )} | ${escapeMarkdownTable(decision.reason)} | ${escapeMarkdownTable(decision.decided_at)} |`
  );

  return `${REPORT_MARKER}
# Release Readiness Report

## Summary

- Status: ${normalized.status}
- Generated at: ${normalized.generated_at}
- PR: ${normalized.release.pr_number ?? 'unknown'}
- Base: ${normalized.release.base_ref || 'unknown'}
- Head: ${normalized.release.head_ref || 'unknown'}
- Product version: ${normalized.release.product_version || 'unknown'}

## Hard Gates

${tableOrNone(['| Gate | Status | Title | Summary |', '|---|---|---|---|'], hardGateRows)}

## Manual Gates

${tableOrNone(
  ['| Gate | Status | Title | Owner decision | Summary |', '|---|---|---|---|---|'],
  manualGateRows
)}

## Soft Warnings

${tableOrNone(['| Code | Message |', '|---|---|'], warningRows)}

## Outstanding Blockers

${tableOrNone(['| Code | Source | Message |', '|---|---|---|'], blockerRows)}

## External Tester Evidence

${tableOrNone(
  ['| Evidence | Status | Tester | Summary | URL |', '|---|---|---|---|---|'],
  evidenceRows
)}

## Owner Decisions

${tableOrNone(
  ['| Gate | Decision | Author | Reason | Decided at |', '|---|---|---|---|---|'],
  decisionRows
)}
`;
}

export function validateReleaseReadinessReport(report) {
  const errors = [];
  const required = [
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
  ];

  for (const field of required) {
    if (!(field in (report ?? {}))) {
      errors.push(`release readiness report missing ${field}`);
    }
  }

  if (report?.schema_version !== 1) {
    errors.push('release readiness report schema_version must be 1');
  }

  if (!REPORT_STATUS.has(report?.status)) {
    errors.push('release readiness report status must be ready, blocked, or manual_pending');
  }

  return { errors };
}

export function loadTesterEvidence({ rootDir = process.cwd(), relativeDir } = {}) {
  if (!relativeDir) {
    return [];
  }

  const evidenceDir = join(rootDir, relativeDir);
  if (!existsSync(evidenceDir)) {
    return [];
  }

  return readdirSync(evidenceDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => loadTesterEvidenceFile(join(evidenceDir, name), name));
}

function standardHardGate(result) {
  const status = HARD_GATE_STATUS.has(result.status) ? result.status : 'fail';
  return {
    id: result.row_id,
    title: result.title || result.row_id,
    status,
    summary: result.summary || '',
    details: Array.isArray(result.details) ? result.details : [],
  };
}

function manualGate(result, decision) {
  const status =
    decision?.decision === 'approve'
      ? 'approved'
      : decision?.decision === 'block'
        ? 'blocked'
        : 'pending';
  return {
    id: result.row_id,
    title: result.title || result.row_id,
    status,
    summary: result.summary || '',
    ...(decision ? { owner_decision: decision } : {}),
  };
}

function releaseSurfaceGate(releaseSurface) {
  const errors = Array.isArray(releaseSurface.errors) ? releaseSurface.errors : [];
  return {
    id: 'release-surface',
    title: 'Release surface metadata',
    status: errors.length > 0 ? 'fail' : 'pass',
    summary:
      errors.length > 0
        ? `${errors.length} release surface error(s).`
        : 'Release surface metadata passed.',
    details: errors,
  };
}

function externalTesterEvidenceGate(testerEvidence) {
  const evidence = normalizeTesterEvidence(testerEvidence);
  if (evidence.length === 0) {
    return {
      id: 'external-tester-evidence',
      title: 'External tester evidence',
      status: 'skipped',
      summary: 'No external tester evidence files were found.',
      details: [],
    };
  }

  const failures = evidence.filter(
    (entry) => entry.status === 'fail' || entry.status === 'missing'
  );
  return {
    id: 'external-tester-evidence',
    title: 'External tester evidence',
    status: failures.length > 0 ? 'fail' : 'pass',
    summary:
      failures.length > 0
        ? `${failures.length} external tester evidence item(s) need attention.`
        : `${evidence.length} external tester evidence item(s) passed.`,
    details: failures.map((entry) => `${entry.id}: ${entry.summary}`),
  };
}

function releaseSurfaceWarnings(releaseSurface) {
  return (Array.isArray(releaseSurface.warnings) ? releaseSurface.warnings : []).map((message) => ({
    code: 'release-surface.warning',
    message,
  }));
}

function skippedStandardsWarnings(hardGates) {
  return hardGates
    .filter((gate) => gate.id.startsWith('row-') && gate.status === 'skipped')
    .map((gate) => ({
      code: `standards.${gate.id}.skipped`,
      message: gate.summary || `${gate.id} was skipped.`,
    }));
}

function testerEvidenceWarnings(testerEvidence) {
  return normalizeTesterEvidence(testerEvidence).length === 0
    ? [
        {
          code: 'tester-evidence.missing',
          message:
            'No external tester evidence files were found under release/readiness/tester-evidence/*.json.',
        },
      ]
    : [];
}

function hardGateBlockers(hardGates) {
  return hardGates
    .filter((gate) => gate.status === 'fail')
    .flatMap((gate) =>
      gate.id === 'external-tester-evidence'
        ? []
        : gate.id === 'release-surface' && gate.details.length > 0
          ? gate.details.map((message) => ({
              code: 'release-surface.error',
              source: 'release-surface',
              message,
            }))
          : [
              {
                code: `standards.${gate.id}.fail`,
                source: gate.id,
                message: gate.summary,
              },
            ]
    );
}

function testerEvidenceBlockers(testerEvidence) {
  return normalizeTesterEvidence(testerEvidence)
    .filter((entry) => entry.status === 'fail' || entry.status === 'missing')
    .map((entry) => ({
      code: `tester-evidence.${entry.id}.${entry.status}`,
      source: 'external-tester-evidence',
      message: entry.summary,
    }));
}

function ownerDecisionBlockers(ownerDecisions) {
  return ownerDecisions
    .filter((decision) => decision.decision === 'block')
    .map((decision) => ({
      code: `owner-decision.${decision.row_id}.block`,
      source: decision.row_id,
      message: decision.reason,
    }));
}

function normalizeTesterEvidence(testerEvidence) {
  return (Array.isArray(testerEvidence) ? testerEvidence : []).map((entry, index) => {
    const status = TESTER_EVIDENCE_STATUS.has(entry?.status) ? entry.status : 'fail';
    return {
      id: stringOrDefault(entry?.id, `evidence-${index + 1}`),
      tester: stringOrDefault(entry?.tester, 'unknown'),
      status,
      summary: stringOrDefault(entry?.summary, 'Tester evidence is malformed.'),
      ...(typeof entry?.url === 'string' && entry.url.length > 0 ? { url: entry.url } : {}),
    };
  });
}

function normalizeOwnerDecisions(decisions) {
  return (Array.isArray(decisions) ? decisions : [])
    .filter((decision) => ['approve', 'block'].includes(decision?.decision))
    .map((decision) => ({
      row_id: decision.row_id,
      decision: decision.decision,
      author: decision.author,
      reason: decision.reason,
      decided_at: decision.decided_at,
    }))
    .sort((left, right) => left.row_id.localeCompare(right.row_id));
}

function normalizeRelease(release) {
  return {
    pr_number: release.pr_number ?? null,
    base_ref: release.base_ref ?? null,
    head_ref: release.head_ref ?? null,
    product_version:
      release.product_version ?? extractProductVersionFromRef(release.head_ref ?? '') ?? null,
  };
}

function normalizeReport(report) {
  return {
    schema_version: 1,
    generated_at: report.generated_at,
    status: report.status,
    release: report.release ?? {},
    hard_gates: Array.isArray(report.hard_gates) ? report.hard_gates : [],
    manual_gates: Array.isArray(report.manual_gates) ? report.manual_gates : [],
    soft_warnings: Array.isArray(report.soft_warnings) ? report.soft_warnings : [],
    outstanding_blockers: Array.isArray(report.outstanding_blockers)
      ? report.outstanding_blockers
      : [],
    external_tester_evidence: Array.isArray(report.external_tester_evidence)
      ? report.external_tester_evidence
      : [],
    owner_decisions: Array.isArray(report.owner_decisions) ? report.owner_decisions : [],
  };
}

function loadTesterEvidenceFile(path, name) {
  try {
    const entry = JSON.parse(readFileSync(path, 'utf8'));
    return entry;
  } catch (error) {
    return {
      id: name.replace(/\.json$/, ''),
      tester: 'unknown',
      status: 'fail',
      summary: `Tester evidence file is malformed: ${error.message}`,
    };
  }
}

function emptyStandardsRun() {
  return {
    results: [],
  };
}

function emptyReleaseSurface() {
  return {
    errors: [],
    warnings: [],
    packages: [],
    npmPublishPackages: [],
  };
}

function extractProductVersionFromRef(ref) {
  return ref.match(/^release\/v?(.+)$/)?.[1] ?? null;
}

function tableOrNone(headerRows, rows) {
  return rows.length > 0 ? [...headerRows, ...rows].join('\n') : 'None';
}

function stringOrDefault(value, fallback) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function escapeMarkdownTable(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}
