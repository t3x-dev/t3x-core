/**
 * @yops-dev/core — Spec-Driven Engine
 *
 * Factory that creates an engine from an OpRegistry.
 * Dispatches ops via registry lookup with field validation.
 * Deep clones input so the original is never mutated.
 * Fail-fast: stops at the first error and returns partial state.
 */

import type { YValue, YOp, YOpsResult } from './types';
import { deepClone } from './paths';
import { yopsError, YOPS_ERRORS } from './errors';
import type { OpRegistry } from './registry';
import type { OpSpec } from './spec';

// ── Field Validation ──

function validateFields(
  opName: string,
  fields: Record<string, unknown>,
  spec: OpSpec,
  index: number,
): { code: string; message: string; op_index: number } | null {
  // Check required fields present
  for (const [name, fieldSpec] of Object.entries(spec.fields)) {
    if (fieldSpec.required && !(name in fields)) {
      return { code: 'INVALID_OP', message: `${opName}: missing required field "${name}"`, op_index: index };
    }
  }
  // Check no extra fields
  for (const key of Object.keys(fields)) {
    if (!(key in spec.fields)) {
      return { code: 'INVALID_OP', message: `${opName}: unknown field "${key}"`, op_index: index };
    }
  }
  // Check enum constraints
  for (const [name, fieldSpec] of Object.entries(spec.fields)) {
    if (fieldSpec.enum && name in fields) {
      if (!fieldSpec.enum.includes(fields[name] as string)) {
        return { code: 'INVALID_OP', message: `${opName}: field "${name}" must be one of [${fieldSpec.enum.join(', ')}]`, op_index: index };
      }
    }
  }
  return null;
}

// ── Engine Factory ──

export function createEngine(registry: OpRegistry) {
  function applyYOps(doc: YValue, ops: YOp[]): YOpsResult {
    let current = deepClone(doc);

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const opName = Object.keys(op)[0];
      const fields = (op as Record<string, unknown>)[opName] as Record<string, unknown>;

      // 1. Registry lookup
      const handler = registry.getHandler(opName);
      if (!handler) {
        return {
          ok: false, doc: current, applied: i,
          error: yopsError(YOPS_ERRORS.UNKNOWN_OP, `Unknown operation: ${opName}`, i),
        };
      }

      // 2. Field validation against spec
      const opSpec = registry.getOpSpec(opName)!;
      const fieldError = validateFields(opName, fields, opSpec, i);
      if (fieldError) {
        return { ok: false, doc: current, applied: i, error: fieldError };
      }

      // 3. Execute handler
      const result = handler(current, fields, i);
      if (result.error) {
        return {
          ok: false,
          doc: current,
          applied: i,
          error: result.error,
        };
      }
      current = result.doc;
    }

    return { ok: true, doc: current, applied: ops.length };
  }

  return { applyYOps };
}
