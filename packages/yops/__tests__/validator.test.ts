/**
 * Validator surface tests.
 *
 * Three categories:
 *
 *   1. Per-code triggering: every error-severity code has at least one
 *      input that produces it. Mirrors the `every-declared-code-is-tested`
 *      invariant from the error-contracts test.
 *   2. Diagnostic shape stability: snapshot-style assertion that every
 *      code returns a fully-populated `YOpsDiagnostic` with the expected
 *      shape. Catches accidental shape drift in a future PR.
 *   3. Engine alignment: the validator's op-key resolution matches
 *      `resolveOpName` so a `source`-first op or unknown op behaves
 *      consistently across validator and engine.
 *
 * Out of scope (deferred):
 *
 *   - Dry-run / preflight against a current document.
 *   - `source_span` population (always `null` in this version).
 *   - WebUI / API consumer integration.
 */

import { describe, expect, it } from 'vitest';
import {
  parseYOpsYaml,
  validateYOpsOps,
  validateYOpsYaml,
  YOPS_DIAGNOSTIC_CODES,
  type YOpsDiagnostic,
} from '../src/index';

// ── 1. Per-code triggering ───────────────────────────────────────────────

describe('validateYOpsYaml — document / envelope codes', () => {
  it('YOPS_INVALID_YAML', () => {
    const diags = validateYOpsYaml('{ unclosed: [');
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_INVALID_YAML);
  });

  it('YOPS_DOCUMENT_NOT_MAPPING_OR_ARRAY (top-level scalar)', () => {
    const diags = validateYOpsYaml('just-a-string');
    expect(diags.map((d) => d.code)).toContain(
      YOPS_DIAGNOSTIC_CODES.YOPS_DOCUMENT_NOT_MAPPING_OR_ARRAY
    );
  });

  it('YOPS_DOCUMENT_YOPS_NOT_ARRAY', () => {
    const diags = validateYOpsYaml('yops: not-an-array');
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_DOCUMENT_YOPS_NOT_ARRAY);
  });

  it('accepts a bare array of ops', () => {
    const diags = validateYOpsYaml('- define: { path: foo }');
    expect(diags).toEqual([]);
  });

  it('accepts the { yops: [...] } envelope', () => {
    const diags = validateYOpsYaml('yops:\n  - define:\n      path: foo');
    expect(diags).toEqual([]);
  });

  it('accepts JSON syntax and YAML 1.2 string scalars', () => {
    const jsonDiags = validateYOpsYaml('[{ "set": { "path": "feature/enabled", "value": true } }]');
    const stringScalarDiags = validateYOpsYaml(`
yops:
  - set: { path: flags/on, value: on }
  - set: { path: flags/off, value: off }
  - set: { path: flags/yes, value: yes }
  - set: { path: flags/no, value: no }
`);

    expect(jsonDiags).toEqual([]);
    expect(stringScalarDiags).toEqual([]);
  });

  it('accepts quoted literal merge-like keys as normal strings', () => {
    const diags = validateYOpsYaml(`
yops:
  - set:
      path: feature
      value: { "<<": literal }
`);
    expect(diags).toEqual([]);
  });

  it.each([
    [
      'anchors',
      `
yops:
  - set: &set_payload { path: feature/enabled, value: true }
`,
    ],
    [
      'aliases',
      `
yops:
  - set: &set_payload { path: feature/enabled, value: true }
  - set: *set_payload
`,
    ],
    [
      'merge keys',
      `
yops:
  - set:
      <<: { path: feature/enabled }
      value: true
`,
    ],
    [
      'multiple documents',
      `
---
yops: []
---
yops: []
`,
    ],
  ])('matches parseYOpsYaml rejection for unsupported YAML profile feature: %s', (_name, yamlInput) => {
    const parseResult = parseYOpsYaml(yamlInput);
    const diags = validateYOpsYaml(yamlInput);

    expect(parseResult.ok).toBe(false);
    expect(diags.map((d) => d.code)).toContain('YOPS_YAML_PROFILE_UNSUPPORTED');
  });
});

describe('validateYOpsOps — op-level codes', () => {
  it('YOPS_OP_NOT_MAPPING (null)', () => {
    const diags = validateYOpsOps([null]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_OP_NOT_MAPPING);
  });

  it('YOPS_OP_NOT_MAPPING (scalar)', () => {
    const diags = validateYOpsOps(['x']);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_OP_NOT_MAPPING);
  });

  it('YOPS_OP_NOT_MAPPING (array)', () => {
    const diags = validateYOpsOps([[1, 2, 3]]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_OP_NOT_MAPPING);
  });

  it('YOPS_OP_NO_KEY (only metadata)', () => {
    const diags = validateYOpsOps([{ source: { type: 'human', author: 't' } }]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_OP_NO_KEY);
  });

  it('YOPS_OP_UNKNOWN', () => {
    const diags = validateYOpsOps([{ frobnicate: { path: 'x' } }]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_OP_UNKNOWN);
  });

  it('YOPS_OP_PAYLOAD_NOT_MAPPING (null payload)', () => {
    const diags = validateYOpsOps([{ define: null }]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_OP_PAYLOAD_NOT_MAPPING);
  });

  it('YOPS_OP_FIELD_MISSING', () => {
    const diags = validateYOpsOps([{ define: {} }]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_OP_FIELD_MISSING);
  });

  it('YOPS_OP_FIELD_UNKNOWN', () => {
    const diags = validateYOpsOps([{ define: { path: 'foo', extra_unexpected_field: 1 } }]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_OP_FIELD_UNKNOWN);
  });

  it('YOPS_OP_FIELD_TYPE_MISMATCH', () => {
    const diags = validateYOpsOps([{ define: { path: 42 } }]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_OP_FIELD_TYPE_MISMATCH);
  });

  it('YOPS_OP_ENUM_VIOLATION', () => {
    const diags = validateYOpsOps([{ sort: { path: 'items', order: 'sideways' } }]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_OP_ENUM_VIOLATION);
  });

  it('clean op produces zero diagnostics', () => {
    const diags = validateYOpsOps([{ define: { path: 'foo' } }]);
    expect(diags).toEqual([]);
  });

  it('YOPS_OP_REFINEMENT_VIOLATION (assert with no condition)', () => {
    const diags = validateYOpsOps([{ assert: { path: 'a' } }]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_OP_REFINEMENT_VIOLATION);
  });

  it('assert with at least one condition validates clean', () => {
    const equalsClean = validateYOpsOps([{ assert: { path: 'a', equals: 1 } }]);
    const existsClean = validateYOpsOps([{ assert: { path: 'a', exists: true } }]);
    const typeClean = validateYOpsOps([{ assert: { path: 'a', type: 'mapping' } }]);
    expect(equalsClean).toEqual([]);
    expect(existsClean).toEqual([]);
    expect(typeClean).toEqual([]);
  });

  it('engine accepts hyphens, dots, and whitespace in plain keys — validator must agree', () => {
    // Mirrors `applyYOps` edge-case fixtures for `my-config.v2` and
    // `my key`: the runtime engine creates these keys verbatim, so
    // the validator must not reject them as INVALID_KEY.
    const hyphensAndDots = validateYOpsOps([{ define: { path: 'my-config.v2' } }]);
    const whitespace = validateYOpsOps([{ define: { path: 'my key' } }]);
    expect(hyphensAndDots).toEqual([]);
    expect(whitespace).toEqual([]);
  });
});

describe('validateYOpsOps — path syntax codes', () => {
  it('YOPS_PATH_EMPTY (zero-length)', () => {
    const diags = validateYOpsOps([{ define: { path: '' } }]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_PATH_EMPTY);
  });

  it('YOPS_PATH_UNCLOSED_QUOTE', () => {
    const diags = validateYOpsOps([{ define: { path: 'config/"unclosed' } }]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_PATH_UNCLOSED_QUOTE);
  });

  it('YOPS_PATH_INVALID_ESCAPE', () => {
    const diags = validateYOpsOps([{ define: { path: '"a\\nb"' } }]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_PATH_INVALID_ESCAPE);
  });

  it('YOPS_PATH_INVALID_INDEX_SYNTAX', () => {
    // Bracket segment without `=`, doesn't match `[<digits>]` → index syntax error.
    const diags = validateYOpsOps([{ define: { path: 'items/[0' } }]);
    expect(diags.map((d) => d.code)).toContain(
      YOPS_DIAGNOSTIC_CODES.YOPS_PATH_INVALID_INDEX_SYNTAX
    );
  });

  it('YOPS_PATH_INVALID_MATCH_SYNTAX', () => {
    // Bracket with `=` but doesn't match `[<key>=<value>]` → match syntax error.
    const diags = validateYOpsOps([{ define: { path: 'users/[name=alice' } }]);
    expect(diags.map((d) => d.code)).toContain(
      YOPS_DIAGNOSTIC_CODES.YOPS_PATH_INVALID_MATCH_SYNTAX
    );
  });

  it('YOPS_PATH_LIKELY_DOUBLE_ESCAPED — advisory only', () => {
    const diags = validateYOpsOps([{ define: { path: 'config/\\"key\\"/host' } }]);
    const advisory = diags.find(
      (d) => d.code === YOPS_DIAGNOSTIC_CODES.YOPS_PATH_LIKELY_DOUBLE_ESCAPED
    );
    expect(advisory).toBeDefined();
    expect(advisory?.severity).toBe('info');
    expect(advisory?.message.toLowerCase()).toMatch(/may|likely|advisory/);
  });

  it('quoted segment with reserved characters validates clean', () => {
    const diags = validateYOpsOps([{ define: { path: 'config/"db/prod"/host' } }]);
    expect(diags).toEqual([]);
  });

  it('legitimate \\" inside a quoted segment does NOT fire LIKELY_DOUBLE_ESCAPED', () => {
    // Path is `"weird \"name\""` — one quoted segment whose key is
    // `weird "name"`. The `\"` sequences are documented escapes inside
    // the quoted region and must not trigger the advisory; the
    // heuristic only fires for `\"` outside any quoted segment.
    const diags = validateYOpsOps([{ define: { path: '"weird \\"name\\""' } }]);
    expect(diags.map((d) => d.code)).not.toContain(
      YOPS_DIAGNOSTIC_CODES.YOPS_PATH_LIKELY_DOUBLE_ESCAPED
    );
    expect(diags).toEqual([]);
  });
});

// ── 2. Engine-alignment regression ────────────────────────────────────────

describe('validator op-key resolution matches the engine', () => {
  it('skips `source` metadata when picking the op key', () => {
    const diags = validateYOpsOps([
      { source: { type: 'human', author: 'tester' }, set: { path: 'foo', value: 1 } },
    ]);
    expect(diags).toEqual([]);
  });

  it('treats { frobnicate: ..., set: ... } as YOPS_OP_UNKNOWN, not a fall-through to set', () => {
    // Engine semantics: resolveOpName picks 'frobnicate' as the first
    // non-metadata key; registry lookup fails. Validator must agree —
    // falling through to `set` would extract a path the engine refuses
    // to apply.
    const diags = validateYOpsOps([{ frobnicate: { x: 1 }, set: { path: 'foo', value: 1 } }]);
    expect(diags.map((d) => d.code)).toContain(YOPS_DIAGNOSTIC_CODES.YOPS_OP_UNKNOWN);
  });
});

// ── 3. Diagnostic shape stability ────────────────────────────────────────

const SHAPE_KEYS: Array<keyof YOpsDiagnostic> = [
  'severity',
  'code',
  'message',
  'op_index',
  'field',
  'path',
  'suggestion',
  'source_span',
];

describe('YOpsDiagnostic shape is stable', () => {
  it('every emitted diagnostic has exactly the documented field set', () => {
    // Drive the validator through inputs that exercise many codes at once.
    const sampleInputs: unknown[] = [
      null,
      { source: { type: 'human', author: 't' } },
      { frobnicate: { path: 'x' } },
      { define: null },
      { define: {} },
      { define: { path: 42 } },
      { define: { path: 'foo', extra: 1 } },
      { define: { path: '' } },
      { define: { path: 'config/"unclosed' } },
      { define: { path: '"a\\nb"' } },
      { define: { path: 'items/[0' } },
      { define: { path: 'users/[name=alice' } },
      { sort: { path: 'items', order: 'sideways' } },
      { define: { path: 'config/\\"k\\"/host' } },
      { assert: { path: 'a' } },
    ];
    const diags = validateYOpsOps(sampleInputs);
    expect(diags.length).toBeGreaterThan(0);

    for (const d of diags) {
      const keys = Object.keys(d).sort();
      expect(keys).toEqual([...SHAPE_KEYS].sort());
      // source_span reserved; v1 returns null for everything.
      expect(d.source_span).toBeNull();
      // Severity is one of three documented values.
      expect(['error', 'warning', 'info']).toContain(d.severity);
      // Code is from the stable constant set.
      expect(Object.values(YOPS_DIAGNOSTIC_CODES)).toContain(d.code);
    }
  });

  it('field uses dotted path format (document.* or <op_name>.*)', () => {
    const diags = validateYOpsOps([
      { define: { path: '' } },
      { sort: { path: 'items', order: 'sideways' } },
    ]);
    for (const d of diags) {
      if (d.field === null) continue;
      // Expect either 'document.<thing>' or '<op_name>.<thing>'.
      expect(d.field).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
    }
  });

  it('advisory codes are info, never error or warning', () => {
    const diags = validateYOpsOps([{ define: { path: 'config/\\"k\\"/host' } }]);
    const advisory = diags.find(
      (d) => d.code === YOPS_DIAGNOSTIC_CODES.YOPS_PATH_LIKELY_DOUBLE_ESCAPED
    );
    expect(advisory?.severity).toBe('info');
  });
});

// ── 4. Coverage check: every error-severity code is reachable ────────────

describe('every error-severity diagnostic code is reachable from a fixture', () => {
  it('the per-code tests above triggered every error-severity code', () => {
    // This collects every error code emitted by the fixture set used
    // throughout this file. It's a coverage assertion against the
    // declared code constants — adding a new error code without
    // adding a triggering fixture fails this test by name.
    const ADVISORY_CODES = new Set<string>([YOPS_DIAGNOSTIC_CODES.YOPS_PATH_LIKELY_DOUBLE_ESCAPED]);

    const fixtureBundle: { yaml?: string; ops?: unknown[] }[] = [
      { yaml: '{ unclosed: [' },
      { yaml: 'yops:\n  - set: &set_payload { path: feature/enabled, value: true }' },
      { yaml: 'just-a-string' },
      { yaml: 'yops: not-an-array' },
      { ops: [null] },
      { ops: ['x'] },
      { ops: [[1, 2, 3]] },
      { ops: [{ source: { type: 'human', author: 't' } }] },
      { ops: [{ frobnicate: { path: 'x' } }] },
      { ops: [{ define: null }] },
      { ops: [{ define: {} }] },
      { ops: [{ define: { path: 42 } }] },
      { ops: [{ define: { path: 'foo', extra: 1 } }] },
      { ops: [{ sort: { path: 'items', order: 'sideways' } }] },
      { ops: [{ define: { path: '' } }] },
      { ops: [{ define: { path: 'config/"unclosed' } }] },
      { ops: [{ define: { path: '"a\\nb"' } }] },
      { ops: [{ define: { path: 'items/[0' } }] },
      { ops: [{ define: { path: 'users/[name=alice' } }] },
      { ops: [{ assert: { path: 'a' } }] },
    ];

    const seen = new Set<string>();
    for (const { yaml: yamlInput, ops } of fixtureBundle) {
      const diags = yamlInput ? validateYOpsYaml(yamlInput) : validateYOpsOps(ops as unknown[]);
      for (const d of diags) {
        if (d.severity === 'error') seen.add(d.code);
      }
    }

    const expectedErrorCodes = Object.values(YOPS_DIAGNOSTIC_CODES).filter(
      (code) => !ADVISORY_CODES.has(code)
    );
    const missing = expectedErrorCodes.filter((code) => !seen.has(code)).sort();
    expect(missing, `missing fixtures for: ${missing.join(', ') || '∅'}`).toEqual([]);
  });
});
