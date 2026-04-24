import { flattenTrees } from '../semantic/tree';
import type { SemanticContent, SlotValue } from '../semantic/types';
import type { LeafConfig, LeafSemanticPointOverride } from '../types';

export interface LeafSemanticPoint {
  id: string;
  label: string;
}

export function deriveLeafSemanticPoints(knowledge: SemanticContent): LeafSemanticPoint[] {
  const points: LeafSemanticPoint[] = [];
  const nodes = flattenTrees(knowledge.trees);

  for (const node of nodes) {
    const nodeLabel = toDisplayPath(node.id);
    points.push({
      id: node.id,
      label: nodeLabel,
    });

    for (const [slotKey, slotValue] of Object.entries(node.slots)) {
      appendSlotPoints(points, node.id, slotKey, slotValue);
    }
  }

  return points;
}

export function getIncludedLeafSemanticPoints(
  knowledge: SemanticContent,
  config?: Pick<LeafConfig, 'semantic_point_overrides'>
): LeafSemanticPoint[] {
  const overrides = buildOverrideMap(config?.semantic_point_overrides);

  return deriveLeafSemanticPoints(knowledge).filter(
    (point) => overrides.get(point.id) !== 'excluded'
  );
}

export function formatSelectedSemanticPoints(
  points: LeafSemanticPoint[],
  sectionTitle = '## Selected Semantic Points',
  hasExcludedPoints = false
): string {
  if (points.length === 0) {
    return '';
  }

  const parts = [sectionTitle, ''];

  if (hasExcludedPoints) {
    parts.push(
      'Treat unlisted source facts as deselected background context and do not actively surface them unless needed for coherence or hard constraints.'
    );
    parts.push('');
  }

  parts.push(...points.map((point) => `- ${point.label}`), '');

  return parts.join('\n');
}

function appendSlotPoints(
  points: LeafSemanticPoint[],
  nodePath: string,
  slotKey: string,
  slotValue: SlotValue
): void {
  if (isPrimitiveSlotValue(slotValue)) {
    points.push({
      id: `${nodePath}/${slotKey}`,
      label: `${toDisplayPath(nodePath)}.${slotKey} = ${formatSlotValue(slotValue)}`,
    });
    return;
  }

  if (!Array.isArray(slotValue)) {
    return;
  }

  for (let index = 0; index < slotValue.length; index++) {
    const item = slotValue[index];
    if (!isPrimitiveSlotValue(item)) {
      continue;
    }

    points.push({
      id: `${nodePath}/${slotKey}[${index}]`,
      label: `${toDisplayPath(nodePath)}.${slotKey} = ${formatSlotValue(item)}`,
    });
  }
}

function buildOverrideMap(
  overrides?: LeafSemanticPointOverride[]
): Map<string, LeafSemanticPointOverride['state']> {
  const states = new Map<string, LeafSemanticPointOverride['state']>();

  for (const override of overrides ?? []) {
    states.set(override.point_id, override.state);
  }

  return states;
}

function toDisplayPath(path: string): string {
  return path.replaceAll('/', '.');
}

function isPrimitiveSlotValue(value: SlotValue): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function formatSlotValue(value: string | number | boolean): string {
  return String(value);
}
