import type { SlotValue, TreeNode } from '@t3x-dev/core';

/** Local FlatNode type matching core's internal FlatNode */
export interface FlatNode {
  id: string;
  type: string;
  slots: Record<string, SlotValue>;
  source?: string;
  confidence?: number;
}

// ── Slot conflict resolution state ──

export type SlotChoice = 'source' | 'target';

export interface ConflictResolution {
  /** Per-slot choices: key → 'source' | 'target' */
  slotChoices: Record<string, SlotChoice>;
}

// ── Helpers ──

/** Canonical JSON for order-independent comparison of slot values. */
export function canonicalJson(v: unknown): string {
  if (v === undefined) return '"__undefined__"';
  if (v === null) return 'null';
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const sorted = Object.keys(v as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`);
  return `{${sorted.join(',')}}`;
}

export function toTitleCase(s: string): string {
  return s
    .split('_')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

export function formatSlotValue(v: SlotValue | undefined): string {
  if (v === undefined) return '(none)';
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'number') return v.toLocaleString();
  if (Array.isArray(v)) return `[${v.map(formatSlotValue).join(', ')}]`;
  if (typeof v === 'object' && v !== null && 'ref' in v) return `-> ${(v as { ref: string }).ref}`;
  if (typeof v === 'object' && v !== null && 'type' in v)
    return `{${(v as { type: string }).type}}`;
  return String(v);
}

export function lookupNode(flatNodes: FlatNode[], path: string): FlatNode | undefined {
  return flatNodes.find((n) => n.id === path);
}

export function findNodeByPathLocal(trees: TreeNode[], path: string): TreeNode | null {
  const segments = path.split('/');
  const root = trees.find((t) => t.key === segments[0]);
  if (!root) return null;
  let current = root;
  for (let i = 1; i < segments.length; i++) {
    const child = current.children.find((c) => c.key === segments[i]);
    if (!child) return null;
    current = child;
  }
  return current;
}
