'use client';

export const LEAF_CHANGED_EVENT = 't3x:leaf-changed';

export type LeafChangedReason = 'created' | 'generated' | 'updated' | 'deleted';

export interface LeafChangedDetail {
  projectId: string;
  leafId?: string;
  commitHash?: string;
  reason: LeafChangedReason;
}

export function dispatchLeafChanged(detail: LeafChangedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LeafChangedDetail>(LEAF_CHANGED_EVENT, { detail }));
}
