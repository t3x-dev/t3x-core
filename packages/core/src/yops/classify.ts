/**
 * YOp Classification — DDL (schema) vs DML (content)
 *
 * Schema ops change tree structure: define, drop, rename, move, nest, split, fold, merge
 * Content ops change slot data: populate, set, unset, relate, unrelate
 */
import type { YOp } from './types';

export type YOpCategory = 'schema' | 'content';

export function classifyYOp(yop: YOp): YOpCategory {
  if ('define' in yop) return 'schema';
  if ('drop' in yop) return 'schema';
  if ('rename' in yop) return 'schema';
  if ('move' in yop) return 'schema';
  if ('nest' in yop) return 'schema';
  if ('split' in yop) return 'schema';
  if ('fold' in yop) return 'schema';
  if ('merge' in yop) return 'schema';
  return 'content';
}
