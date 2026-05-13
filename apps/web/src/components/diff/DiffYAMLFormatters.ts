import type { Relation, SlotValue } from '@t3x-dev/core';

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
  key: 'var(--yaml-key)',
  string: 'var(--yaml-string)',
  number: 'var(--yaml-number)',
  ref: 'var(--yaml-ref)',
  bracket: 'var(--yaml-punctuation)',
  type: 'var(--yaml-key)',
  comment: 'var(--yaml-comment)',
} as const;
