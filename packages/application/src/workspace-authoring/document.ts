import { applyYOps, treesToYValue, type YOp, yvalueToTrees } from '@t3x-dev/core';
import type { DraftDocument } from './types';

const WRAP = 'document';

export function cloneDocument<T extends DraftDocument>(value: T): T {
  return structuredClone(value);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = canonicalize(record[key]);
  }
  return sorted;
}

export function isMapping(
  value: DraftDocument | undefined
): value is { [key: string]: DraftDocument } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function prefixPath(path: string): string {
  if (path === WRAP || path.startsWith(`${WRAP}/`)) return path;
  return `${WRAP}/${path}`;
}

function prefixOp(op: YOp): YOp {
  if ('set' in op) return { set: { ...op.set, path: prefixPath(op.set.path) } };
  if ('unset' in op) return { unset: { ...op.unset, path: prefixPath(op.unset.path) } };
  if ('drop' in op) return { drop: { ...op.drop, path: prefixPath(op.drop.path) } };
  if ('define' in op) return { define: { ...op.define, path: prefixPath(op.define.path) } };
  if ('rename' in op) {
    return { rename: { path: prefixPath(op.rename.path), to: op.rename.to } };
  }
  if ('move' in op) {
    return { move: { from: prefixPath(op.move.from), to: prefixPath(op.move.to) } };
  }
  return op;
}

export function applyDraftYOps(
  document: DraftDocument,
  operations: readonly YOp[]
): { ok: true; doc: DraftDocument } | { ok: false; doc: DraftDocument; message: string } {
  const wrapped = { [WRAP]: document };
  const applied = applyYOps(
    { trees: yvalueToTrees(wrapped), relations: [] },
    operations.map(prefixOp)
  );
  if (!applied.ok) {
    return {
      ok: false,
      doc: document,
      message: applied.error?.message ?? 'YOps apply failed',
    };
  }
  const next = treesToYValue(applied.trees);
  if (!isMapping(next) || !Object.hasOwn(next, WRAP)) {
    return { ok: false, doc: document, message: 'YOps apply lost the wrapped document' };
  }
  return { ok: true, doc: next[WRAP] };
}
