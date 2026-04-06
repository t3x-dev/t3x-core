/**
 * @yops-dev/core — Sequential YOps Executor
 *
 * Applies a list of YOp operations to a document in order.
 * Deep clones the input so the original is never mutated.
 * Fail-fast: stops at the first error and returns partial state.
 */

import type { YValue, YOp, YOpsResult } from './types';
import { deepClone } from './paths';
import { yopsError, YOPS_ERRORS } from './errors';
import { applyDefine, applyDrop, applyRename } from './ops/ddl';
import { applySet, applyUnset, applyPopulate, applyAppend } from './ops/dml';

export function applyYOps(doc: YValue, ops: YOp[]): YOpsResult {
  // Deep clone so the caller's document is never mutated
  let current = deepClone(doc);

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];

    let result: { doc: YValue; error?: ReturnType<typeof yopsError> };

    if ('define' in op) {
      result = applyDefine(current, op.define, i);
    } else if ('drop' in op) {
      result = applyDrop(current, op.drop, i);
    } else if ('rename' in op) {
      result = applyRename(current, op.rename, i);
    } else if ('set' in op) {
      result = applySet(current, op.set, i);
    } else if ('unset' in op) {
      result = applyUnset(current, op.unset, i);
    } else if ('populate' in op) {
      result = applyPopulate(current, op.populate, i);
    } else if ('append' in op) {
      result = applyAppend(current, op.append, i);
    } else {
      // Unknown op
      return {
        ok: false,
        doc: current,
        applied: i,
        error: yopsError(YOPS_ERRORS.UNKNOWN_OP, `Unknown operation at index ${i}`, i),
      };
    }

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

  return {
    ok: true,
    doc: current,
    applied: ops.length,
  };
}
