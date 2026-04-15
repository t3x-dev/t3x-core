/**
 * Conformance Tests — driven by yops.yaml
 *
 * Reads every test case from the spec and runs it through the engine.
 * Any language can run these same tests against their own engine.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyYOps } from '../src/index';
import { parseSpec } from '../src/spec';
import type { YOp, YValue } from '../src/types';

const yamlStr = readFileSync(join(__dirname, '..', 'yops.yaml'), 'utf-8');
const spec = parseSpec(yamlStr);

describe('yops.yaml conformance tests', () => {
  for (const [opName, opSpec] of Object.entries(spec.operations)) {
    if (opSpec.tests.length === 0) continue;

    describe(opName, () => {
      for (const testCase of opSpec.tests) {
        it(testCase.name, () => {
          const result = applyYOps(testCase.input as YValue, testCase.ops as YOp[]);

          if (testCase.error) {
            expect(result.ok).toBe(false);
            expect(result.error?.code).toBe(testCase.error);
          } else {
            expect(result.ok).toBe(true);
            expect(result.doc).toEqual(testCase.output);
          }
        });
      }
    });
  }
});
