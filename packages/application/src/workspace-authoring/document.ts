import type { NativeYOp as YOp } from '@t3x-dev/core';
import {
  applyNativeYOps as applyYOps,
  canonicalNativeYValue as canonicalYValue,
  type NativeYValue as YValue,
} from '@t3x-dev/core';
import type { DraftDocument } from './types';

export function cloneDocument<T>(value: T): T {
  return structuredClone(value);
}
export function canonicalJson(value: unknown): string {
  return canonicalYValue(value as YValue);
}
export function isMapping(
  value: DraftDocument | undefined
): value is { [key: string]: DraftDocument } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function applyDraftYOps(
  document: DraftDocument,
  operations: readonly YOp[]
): { ok: true; doc: DraftDocument } | { ok: false; doc: DraftDocument; message: string } {
  const result = applyYOps(document as YValue, structuredClone(operations) as YOp[]);
  return result.ok
    ? { ok: true, doc: result.doc as DraftDocument }
    : {
        ok: false,
        doc: document,
        message: result.error?.message ?? 'YOps apply failed',
      };
}
