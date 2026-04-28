/**
 * Spec ↔ handler error-contract drift detection.
 *
 * For every op declared in `yops.yaml`, three sources should agree on which
 * error codes belong to it:
 *
 *   1. The handler source under `src/handlers/<op>.ts` — what the engine
 *      can actually produce at runtime.
 *   2. The op's `errors:` block in `yops.yaml` — what the spec declares.
 *   3. The `error_reference[<code>].thrown_by` list in `yops.yaml` — the
 *      reverse index used by docs and consumers.
 *
 * Any divergence is a contract bug: docs lie, consumers can't pattern-match
 * on the right code, and external implementations of YOps following the
 * spec will produce different errors from this engine.
 *
 * The test reads handler source statically (instead of driving each
 * handler at runtime) so it covers code paths that aren't easy to
 * trigger from a test fixture (e.g. `INVALID_PATH` deep inside `setAtPath`).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSpec } from '../src/spec';

const HANDLERS_DIR = join(__dirname, '..', 'src', 'handlers');
const SPEC_PATH = join(__dirname, '..', 'yops.yaml');

// `INVALID_OP` and `UNKNOWN_OP` are engine-level codes (op key is unknown
// or the payload shape is wrong), not per-op contract errors. Handlers
// emit `INVALID_OP` for cross-field validation that doesn't fit any
// other code (e.g. sort/unique enum mismatches, split duplicate-source
// guard) — those are correctly listed on the op rather than via this
// allow-list. Anything in this set is intentionally excluded from the
// per-op declared errors check.
const ENGINE_LEVEL_CODES = new Set(['UNKNOWN_OP']);

function emittedErrorsFor(opName: string): Set<string> {
  const file = join(HANDLERS_DIR, `${opName}.ts`);
  const src = readFileSync(file, 'utf-8');
  const matches = src.matchAll(/YOPS_ERRORS\.([A-Z_]+)/g);
  const codes = new Set<string>();
  for (const m of matches) codes.add(m[1]);
  return codes;
}

const spec = parseSpec(readFileSync(SPEC_PATH, 'utf-8'));
const handlerFiles = new Set(
  readdirSync(HANDLERS_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => f.replace(/\.ts$/, ''))
);

describe('spec.operations[op].errors matches handler emissions', () => {
  for (const opName of Object.keys(spec.operations)) {
    if (!handlerFiles.has(opName)) continue;
    it(`${opName}: declared errors equal handler-emitted errors`, () => {
      const emitted = emittedErrorsFor(opName);
      const declared = new Set(spec.operations[opName].errors);
      const handlerCodes = new Set([...emitted].filter((c) => !ENGINE_LEVEL_CODES.has(c)));
      const declaredCodes = new Set([...declared].filter((c) => !ENGINE_LEVEL_CODES.has(c)));

      const missingFromSpec = [...handlerCodes].filter((c) => !declaredCodes.has(c)).sort();
      const missingFromHandler = [...declaredCodes].filter((c) => !handlerCodes.has(c)).sort();

      expect(
        { missingFromSpec, missingFromHandler },
        `${opName} drift — spec missing: ${missingFromSpec.join(',') || '∅'}; ` +
          `handler missing: ${missingFromHandler.join(',') || '∅'}`
      ).toEqual({ missingFromSpec: [], missingFromHandler: [] });
    });
  }
});

describe('error_reference[code].thrown_by matches handler emissions', () => {
  const raw = readFileSync(SPEC_PATH, 'utf-8');
  const yaml = require('js-yaml') as typeof import('js-yaml');
  const fullSpec = yaml.load(raw) as {
    error_reference?: Record<string, { thrown_by?: string[] }>;
  };
  const reference = fullSpec.error_reference ?? {};

  for (const [code, body] of Object.entries(reference)) {
    if (ENGINE_LEVEL_CODES.has(code)) continue;
    if (Array.isArray(body.thrown_by) && body.thrown_by.includes('engine')) continue;

    it(`${code}: thrown_by lists every handler that emits it`, () => {
      const referenced = new Set((body.thrown_by ?? []).filter((op) => op !== 'engine'));
      const actual = new Set<string>();
      for (const op of handlerFiles) {
        if (emittedErrorsFor(op).has(code)) actual.add(op);
      }

      const missingFromReference = [...actual].filter((op) => !referenced.has(op)).sort();
      const extraInReference = [...referenced].filter((op) => !actual.has(op)).sort();

      expect(
        { missingFromReference, extraInReference },
        `${code} reference drift — missing: ${missingFromReference.join(',') || '∅'}; ` +
          `extra: ${extraInReference.join(',') || '∅'}`
      ).toEqual({ missingFromReference: [], extraInReference: [] });
    });
  }
});
