import { deriveLeafSemanticPoints, flattenTrees, type SemanticContent } from '@t3x-dev/core';
import type { LeafConfig } from '@/types/api';

export interface LeafSemanticPointItem {
  id: string;
  label: string;
  included: boolean;
  owner_node_id: string;
  root_tree_id: string;
}

export interface LeafSemanticPointSummary {
  total: number;
  included: number;
  excluded: number;
}

export function deriveLeafSemanticPointItems(
  content: SemanticContent,
  config?: Pick<LeafConfig, 'semantic_point_overrides'>
): LeafSemanticPointItem[] {
  const nodeIds = new Set(flattenTrees(content.trees).map((node) => node.id));
  const overrides = new Map(
    (config?.semantic_point_overrides ?? []).map((override) => [override.point_id, override.state])
  );

  return deriveLeafSemanticPoints(content).map((point) => {
    const ownerPath = nodeIds.has(point.id)
      ? point.id
      : point.id.slice(0, point.id.lastIndexOf('/'));
    return {
      ...point,
      included: overrides.get(point.id) !== 'excluded',
      owner_node_id: ownerPath.replaceAll('/', '.'),
      root_tree_id: ownerPath.split('/')[0],
    };
  });
}

export function buildLeafSemanticPointSummary(
  points: LeafSemanticPointItem[]
): LeafSemanticPointSummary {
  const included = points.filter((point) => point.included).length;
  return {
    total: points.length,
    included,
    excluded: points.length - included,
  };
}

export function buildLeafSemanticPointSummaryByNode(
  points: LeafSemanticPointItem[]
): Map<string, LeafSemanticPointSummary> {
  const summaries = new Map<string, LeafSemanticPointSummary>();

  for (const point of points) {
    const current = summaries.get(point.owner_node_id) ?? {
      total: 0,
      included: 0,
      excluded: 0,
    };

    current.total += 1;
    if (point.included) {
      current.included += 1;
    } else {
      current.excluded += 1;
    }

    summaries.set(point.owner_node_id, current);
  }

  return summaries;
}

export function setLeafSemanticPointIncluded(
  config: LeafConfig,
  pointId: string,
  included: boolean
): LeafConfig {
  const existingOverrides = (config.semantic_point_overrides ?? []).filter(
    (override) => override.point_id !== pointId
  );

  return {
    ...config,
    semantic_point_overrides: included
      ? existingOverrides
      : [...existingOverrides, { point_id: pointId, state: 'excluded' }],
  };
}
