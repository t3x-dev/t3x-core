/**
 * @yops-dev/core — Op Category Classification
 *
 * Classifies a YOp into one of four categories:
 *   ddl  — structure declarations (define, drop, rename)
 *   dml  — value mutations (set, unset, populate, append)
 *   dtl  — data transformations (move, clone, nest, split, fold, merge, sort, unique, pick, omit)
 *   dcl  — data control / assertions (assert)
 */

import type { YOp } from './types';

export type YOpCategory = 'ddl' | 'dml' | 'dtl' | 'dcl';

export function classifyYOp(op: YOp): YOpCategory {
  if ('define' in op || 'drop' in op || 'rename' in op) return 'ddl';
  if ('set' in op || 'unset' in op || 'populate' in op || 'append' in op) return 'dml';
  if ('assert' in op) return 'dcl';
  return 'dtl';
}
