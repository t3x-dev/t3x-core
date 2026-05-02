/**
 * Validator–engine alignment property tests.
 *
 * Two directions:
 *
 *   1. **No false negatives.** For every payload that the runtime
 *      schema (`validateOps`) rejects, the new pre-flight validator
 *      (`validateYOpsOps`) must emit at least one `severity: 'error'`
 *      diagnostic. Without this guarantee, callers using the validator
 *      as a preflight gate would still hit `INVALID_OP` at apply time.
 *
 *   2. **No false positives.** For every payload that the runtime
 *      engine (`applyYOps`) accepts, the validator must not emit any
 *      `severity: 'error'` diagnostic. Otherwise the validator
 *      would block inputs the engine would happily apply.
 *
 * The test bundles a representative fixture per op covering missing
 * required fields, unknown fields, type mismatches, enum violations,
 * empty/rootable paths, and op-specific cross-field refinements. Adding
 * a new op or refinement should add a fixture here so the alignment
 * stays exhaustive over time.
 */

import { describe, expect, it } from 'vitest';
import { applyYOps } from '../src/index';
import { validateOps } from '../src/schema';
import type { YValue } from '../src/types';
import { validateYOpsOps } from '../src/validator';

type AlignmentCase = {
  name: string;
  op: unknown;
};

// ── No-false-negatives bundle ─────────────────────────────────────────────
// Every fixture here is a payload that the runtime schema rejects.
// validateYOpsOps must emit at least one error diagnostic for each.

const SCHEMA_REJECTS: AlignmentCase[] = [
  // Document/envelope shape covered separately by validator.test.ts.

  // ── Required-field-missing across all ops ───────────────────────────────
  { name: 'define missing path', op: { define: {} } },
  { name: 'drop missing path', op: { drop: {} } },
  { name: 'rename missing path', op: { rename: { to: 'x' } } },
  { name: 'rename missing to', op: { rename: { path: 'x' } } },
  { name: 'set missing value', op: { set: { path: 'x' } } },
  { name: 'set missing path', op: { set: { value: 1 } } },
  { name: 'unset missing path', op: { unset: {} } },
  { name: 'populate missing values', op: { populate: { path: 'x' } } },
  { name: 'append missing value', op: { append: { path: 'x' } } },
  { name: 'move missing from', op: { move: { to: 'x' } } },
  { name: 'move missing to', op: { move: { from: 'x' } } },
  { name: 'clone missing from', op: { clone: { to: 'x' } } },
  { name: 'clone missing to', op: { clone: { from: 'x' } } },
  { name: 'nest missing under', op: { nest: { path: 'x', keys: ['a'] } } },
  { name: 'nest missing keys', op: { nest: { path: 'x', under: 'g' } } },
  { name: 'split missing into', op: { split: { path: 'x' } } },
  { name: 'fold missing path', op: { fold: {} } },
  { name: 'merge missing into', op: { merge: { path: 'x', keys: ['a'] } } },
  { name: 'merge missing keys', op: { merge: { path: 'x', into: 'g' } } },
  { name: 'sort missing path', op: { sort: { order: 'asc' } } },
  { name: 'unique missing path', op: { unique: {} } },
  { name: 'pick missing keys', op: { pick: { path: 'x' } } },
  { name: 'omit missing keys', op: { omit: { path: 'x' } } },

  // ── Unknown-field across a few ops ──────────────────────────────────────
  { name: 'set with bogus field', op: { set: { path: 'x', value: 1, bogus: true } } },
  { name: 'rename with extra field', op: { rename: { path: 'x', to: 'y', extra: 1 } } },

  // ── Type mismatches ─────────────────────────────────────────────────────
  { name: 'define with numeric path', op: { define: { path: 42 } } },
  { name: 'sort with non-string by', op: { sort: { path: 'x', by: 123 } } },
  { name: 'pick keys must be array', op: { pick: { path: 'x', keys: 'a' } } },

  // ── Enum violations ─────────────────────────────────────────────────────
  { name: 'sort.order outside enum', op: { sort: { path: 'x', order: 'sideways' } } },
  { name: 'assert.type outside enum', op: { assert: { path: 'a', type: 'unicorn' } } },

  // ── Path-shape rejections ───────────────────────────────────────────────
  { name: 'set with empty path', op: { set: { path: '', value: 1 } } },
  { name: 'define with empty path', op: { define: { path: '' } } },
  { name: 'rename with empty to', op: { rename: { path: 'x', to: '' } } },
  { name: 'move with empty to', op: { move: { from: 'x', to: '' } } },
  { name: 'clone with empty to', op: { clone: { from: 'x', to: '' } } },
  { name: 'nest with empty under', op: { nest: { path: 'x', keys: ['a'], under: '' } } },
  { name: 'merge with empty into', op: { merge: { path: 'x', keys: ['a'], into: '' } } },

  // ── Cross-field refinements ─────────────────────────────────────────────
  { name: 'assert with no condition', op: { assert: { path: 'a' } } },

  // ── Unknown op ──────────────────────────────────────────────────────────
  { name: 'unknown operation', op: { frobnicate: { path: 'x' } } },
];

// ── No-false-positives bundle ─────────────────────────────────────────────
// Every fixture here is a payload that applyYOps successfully applies.
// validateYOpsOps must NOT emit any error-severity diagnostics.

type AlignmentApplyCase = {
  name: string;
  doc: YValue;
  op: unknown;
};

const ENGINE_ACCEPTS: AlignmentApplyCase[] = [
  // Ordinary happy paths
  { name: 'define at root key', doc: {}, op: { define: { path: 'foo' } } },
  { name: 'set with deep path', doc: {}, op: { set: { path: 'a/b/c', value: 1 } } },
  {
    name: 'populate at existing mapping',
    doc: { config: {} },
    op: { populate: { path: 'config', values: { host: 'localhost' } } },
  },
  {
    name: 'append to existing sequence',
    doc: { items: [1, 2] },
    op: { append: { path: 'items', value: 3 } },
  },

  // Engine accepts non-snake-case keys (mirrors edge-case fixtures)
  { name: 'hyphens-and-dots key', doc: {}, op: { define: { path: 'my-config.v2' } } },
  { name: 'whitespace key', doc: {}, op: { define: { path: 'my key' } } },

  // Rootable-path ops accept empty path
  {
    name: 'nest with root path',
    doc: { a: 1, b: 2 },
    op: { nest: { path: '', keys: ['a'], under: 'wrapped' } },
  },
  {
    name: 'pick with root path',
    doc: { a: 1, b: 2 },
    op: { pick: { path: '', keys: ['a'] } },
  },
  {
    name: 'omit with root path',
    doc: { a: 1, b: 2 },
    op: { omit: { path: '', keys: ['b'] } },
  },
  {
    name: 'merge with root path',
    doc: { a: { x: 1 }, b: { y: 2 } },
    op: { merge: { path: '', keys: ['a', 'b'], into: 'combined' } },
  },
  {
    name: 'split with root path',
    doc: { a: 1, b: 2, c: 3 },
    op: { split: { path: '', into: { ab: ['a', 'b'], c_only: ['c'] } } },
  },

  // Optional fields omitted
  { name: 'sort without by/order', doc: { items: [3, 1, 2] }, op: { sort: { path: 'items' } } },

  // Each assert condition individually accepted
  { name: 'assert with equals only', doc: { a: 1 }, op: { assert: { path: 'a', equals: 1 } } },
  {
    name: 'assert with exists only',
    doc: { a: 1 },
    op: { assert: { path: 'a', exists: true } },
  },
  {
    name: 'assert with type only',
    doc: { a: { x: 1 } },
    op: { assert: { path: 'a', type: 'mapping' } },
  },

  // Path with a quoted segment
  {
    name: 'quoted segment path',
    doc: {},
    op: { set: { path: 'config/"db/prod"/host', value: 'x' } },
  },
];

// ── Property tests ────────────────────────────────────────────────────────

describe('validator–engine alignment: schema rejections must surface as validator errors', () => {
  for (const { name, op } of SCHEMA_REJECTS) {
    it(name, () => {
      const schema = validateOps([op]);
      // Sanity: every fixture here must actually be a schema rejection.
      expect(schema.valid).toBe(false);

      const validator = validateYOpsOps([op]);
      const errors = validator.filter((d) => d.severity === 'error');
      expect(errors.length, `validator missed: ${JSON.stringify(op)}`).toBeGreaterThan(0);
    });
  }
});

describe('validator–engine alignment: engine acceptances must not raise validator errors', () => {
  for (const { name, doc, op } of ENGINE_ACCEPTS) {
    it(name, () => {
      // Sanity: every fixture here must actually apply cleanly.
      const apply = applyYOps(doc, [op] as Parameters<typeof applyYOps>[1]);
      expect(apply.ok, `fixture should apply cleanly: ${JSON.stringify(op)}`).toBe(true);

      const validator = validateYOpsOps([op]);
      const errors = validator.filter((d) => d.severity === 'error');
      expect(
        errors,
        `validator over-reports for: ${JSON.stringify(op)} -> ${JSON.stringify(errors)}`
      ).toEqual([]);
    });
  }
});
