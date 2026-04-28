/**
 * @yops-dev/core — Op Category Classification
 *
 * Classifies a YOp into one of four categories using the spec.
 * Initialized via initClassify() at bootstrap; falls back to 'dtl'.
 *
 * Op-key resolution is shared with the engine via `opShape.resolveOpName`
 * so a `source`-first op like `{ source, set: ... }` classifies as DML
 * (the engine applies it as `set`), not as DTL via the `source` literal.
 */

import { resolveOpName } from './opShape';
import type { YOpsSpec } from './spec';
import type { YOp } from './types';

export type YOpCategory = 'ddl' | 'dml' | 'dtl' | 'dcl';

let _spec: YOpsSpec | null = null;

export function initClassify(s: YOpsSpec): void {
  _spec = s;
}

export function classifyYOp(op: YOp): YOpCategory {
  const opName = resolveOpName(op);
  if (_spec && opName !== null) {
    const opSpec = _spec.operations[opName];
    if (opSpec) return opSpec.category as YOpCategory;
  }
  return 'dtl';
}
