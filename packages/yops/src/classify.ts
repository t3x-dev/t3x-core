/**
 * @yops-dev/core — Op Category Classification
 *
 * Classifies a YOp into one of four categories using the spec.
 * Initialized via initClassify() at bootstrap; falls back to 'dtl'.
 */

import type { YOp } from './types';
import type { YOpsSpec } from './spec';

export type YOpCategory = 'ddl' | 'dml' | 'dtl' | 'dcl';

let _spec: YOpsSpec | null = null;

export function initClassify(s: YOpsSpec): void {
  _spec = s;
}

export function classifyYOp(op: YOp): YOpCategory {
  const opName = Object.keys(op)[0];
  if (_spec) {
    const opSpec = _spec.operations[opName];
    if (opSpec) return opSpec.category as YOpCategory;
  }
  return 'dtl';
}
