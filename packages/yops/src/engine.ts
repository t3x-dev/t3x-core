/**
 * @yops-dev/core — Spec-Driven Engine
 *
 * Factory that creates an engine from an OpRegistry.
 * Dispatches ops via registry lookup with field validation.
 * Deep clones input so the original is never mutated.
 * Fail-fast: stops at the first error and returns partial state.
 */

import { YOPS_ERRORS, yopsError } from './errors';
import { isMappingObject, resolveOpName } from './opShape';
import { deepClone } from './paths';
import type { OpRegistry } from './registry';
import { YOpSchema } from './schema';
import type { OpSpec } from './spec';
import type { YOp, YOpsResult, YValue } from './types';

// ── Field Validation ──

function validateFields(
  opName: string,
  fields: Record<string, unknown>,
  spec: OpSpec,
  index: number
): { code: string; message: string; op_index: number } | null {
  // Check required fields present
  for (const [name, fieldSpec] of Object.entries(spec.fields)) {
    if (fieldSpec.required && !(name in fields)) {
      return {
        code: 'INVALID_OP',
        message: `${opName}: missing required field "${name}"`,
        op_index: index,
      };
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
        return {
          code: 'INVALID_OP',
          message: `${opName}: field "${name}" must be one of [${fieldSpec.enum.join(', ')}]`,
          op_index: index,
        };
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
      const rawOp = ops[i] as unknown;

      // 1. Outer-shape guard. `parseYOpsYaml` returns unvalidated ops, so
      //    a literal `null`, a scalar, or an array can reach here. Treat
      //    them as a typed INVALID_OP rather than letting downstream
      //    code throw a TypeError on `Object.keys(null)` or `'x' in 'x'`.
      if (!isMappingObject(rawOp)) {
        return {
          ok: false,
          doc: current,
          applied: i,
          error: yopsError(
            YOPS_ERRORS.INVALID_OP,
            `Op at index ${i} must be a mapping, got ${rawOp === null ? 'null' : typeof rawOp}`,
            i
          ),
        };
      }
      const op = rawOp;

      // 2. Resolve the op key (first non-metadata key).
      const opName = resolveOpName(op);
      if (opName === null) {
        return {
          ok: false,
          doc: current,
          applied: i,
          error: yopsError(YOPS_ERRORS.INVALID_OP, `Op at index ${i} has no operation key`, i),
        };
      }

      // 3. Registry lookup. Distinguishes "no such op" from any later
      //    shape/contract error so consumers get UNKNOWN_OP instead of
      //    a generic INVALID_OP.
      const handler = registry.getHandler(opName);
      if (!handler) {
        return {
          ok: false,
          doc: current,
          applied: i,
          error: yopsError(YOPS_ERRORS.UNKNOWN_OP, `Unknown operation: ${opName}`, i),
        };
      }

      // 4. Inner-shape guard for the op payload before any contract
      //    checks touch it. `{ set: null }` and `{ set: 'x' }` are valid
      //    YAML but violate every op schema; rejecting here keeps
      //    `validateFields` and the handlers free of null-payload
      //    defenses.
      const payload = op[opName];
      if (!isMappingObject(payload)) {
        return {
          ok: false,
          doc: current,
          applied: i,
          error: yopsError(
            YOPS_ERRORS.INVALID_OP,
            `${opName}: payload must be a mapping, got ${
              payload === null ? 'null' : typeof payload
            }`,
            i
          ),
        };
      }
      const fields = payload;

      // 5. Per-spec field validation (required / extra / enum). The
      //    earlier shape guards already reject non-object payloads, so
      //    `validateFields` cannot be reached with `null` or a scalar
      //    for `fields` — its checks here are purely contract-level.
      const opSpec = registry.getOpSpec(opName) as OpSpec;
      const fieldError = validateFields(opName, fields, opSpec, i);
      if (fieldError) {
        return { ok: false, doc: current, applied: i, error: fieldError };
      }

      // 6. Schema validation against the same public Zod contract a
      //    consumer sees — type mismatches in field values, etc.
      const schemaResult = YOpSchema.safeParse(op);
      if (!schemaResult.success) {
        const issue = schemaResult.error.issues[0];
        return {
          ok: false,
          doc: current,
          applied: i,
          error: yopsError(
            YOPS_ERRORS.INVALID_OP,
            issue?.message ?? `${opName}: invalid operation shape`,
            i
          ),
        };
      }

      // 7. Execute handler.
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
