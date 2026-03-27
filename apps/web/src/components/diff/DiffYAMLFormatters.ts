import type { TreeNode, Relation, SlotValue } from '@t3x-dev/core';
import type { CompatNode } from '@/lib/treeCompat';

export function formatSlotValue(value: SlotValue | undefined): string {
  if (value === undefined) return '(none)';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && value !== null && 'ref' in value) {
    return `*${(value as { ref: string }).ref}`;
  }
  if (Array.isArray(value)) {
    return `[${(value as SlotValue[]).map(formatSlotValue).join(', ')}]`;
  }
  return JSON.stringify(value);
}

export function renderNodeSlots(node: { slots: Record<string, SlotValue> }): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(node.slots)) {
    lines.push(`  ${key}: ${formatSlotValue(value)}`);
  }
  return lines;
}

export function formatRelation(r: Relation): string {
  return `${r.from} -[${r.type}]-> ${r.to}${r.confidence != null ? ` (${Math.round(r.confidence * 100)}%)` : ''}`;
}

/** YAML syntax color tokens — reused across all YAML diff views */
export const YAML_COLORS = {
  key: '#7aa2f7',
  string: '#9ece6a',
  number: '#ff9e64',
  ref: '#bb9af7',
  bracket: '#89ddff',
  type: '#c0caf5',
  comment: '#565f89',
} as const;
