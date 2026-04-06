/**
 * @yops-dev/core — DCL Operations
 *
 * assert: Validate a condition against the document. Fail-fast — no mutation.
 */

import { yopsError, YOPS_ERRORS } from '../errors';
import { resolvePath } from '../paths';
import type { YValue, YOpsError, AssertOp } from '../types';

type OpResult = { doc: YValue; error?: YOpsError };

// ── assert ───────────────────────────────────────────────────────────────────

export function applyAssert(doc: YValue, op: AssertOp, index: number): OpResult {
  const { path, equals, exists, type } = op;

  // equals condition
  if (equals !== undefined) {
    const value = resolvePath(doc, path);
    if (value === undefined) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.ASSERTION_FAILED,
          `Path "${path}" does not exist`,
          index,
        ),
      };
    }
    if (JSON.stringify(value) !== JSON.stringify(equals)) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.ASSERTION_FAILED,
          `Expected "${JSON.stringify(equals)}" at path "${path}" but got "${JSON.stringify(value)}"`,
          index,
        ),
      };
    }
    return { doc };
  }

  // exists condition
  if (exists !== undefined) {
    const value = resolvePath(doc, path);
    const pathExists = value !== undefined;
    if (exists && !pathExists) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.ASSERTION_FAILED,
          `Expected path "${path}" to exist but it does not`,
          index,
        ),
      };
    }
    if (!exists && pathExists) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.ASSERTION_FAILED,
          `Expected path "${path}" to not exist but it does`,
          index,
        ),
      };
    }
    return { doc };
  }

  // type condition
  if (type !== undefined) {
    const value = resolvePath(doc, path);
    if (value === undefined) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.ASSERTION_FAILED,
          `Path "${path}" does not exist`,
          index,
        ),
      };
    }
    const actualType = Array.isArray(value)
      ? 'sequence'
      : value !== null && typeof value === 'object'
        ? 'mapping'
        : 'scalar';
    if (actualType !== type) {
      return {
        doc,
        error: yopsError(
          YOPS_ERRORS.ASSERTION_FAILED,
          `Expected type "${type}" at path "${path}" but got "${actualType}"`,
          index,
        ),
      };
    }
    return { doc };
  }

  // No condition — pass through
  return { doc };
}
