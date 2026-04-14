import type { TreeNode, Relation, SlotValue } from '@t3x-dev/core';
import type { CompatNode } from '@/domain/tree/treeCompat';

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
  return `${r.from} -[${r.type}]-> ${r.to}`;
}

/** YAML syntax color tokens — reused across all YAML diff views */
export const YAML_COLORS = {
  key: 'var(--yaml-key, #2563eb)',
  string: 'var(--yaml-string, #16a34a)',
  number: 'var(--yaml-number, #d97706)',
  ref: 'var(--yaml-ref, #7c3aed)',
  bracket: 'var(--yaml-punctuation, #6b7280)',
  type: 'var(--yaml-key, #2563eb)',
  comment: 'var(--yaml-comment, #9ca3af)',
} as const;
