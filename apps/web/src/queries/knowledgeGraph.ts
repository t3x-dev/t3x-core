/**
 * L3 — knowledge-graph read/write pass-through for `knowledgeGraphStore`.
 */

import {
  type BuildResult,
  type KnowledgeNode,
  type NeighborNode,
  buildKnowledgeGraph,
  deleteKnowledgeGraph,
  getKnowledgeNode,
  getNodeNeighbors,
  listKnowledgeNodes,
  searchKnowledgeNodes,
} from '@/infrastructure/knowledge-graph';

export function fetchKnowledgeNodes(projectId: string, limit = 50): Promise<KnowledgeNode[]> {
  return listKnowledgeNodes(projectId, limit);
}

export function fetchKnowledgeNode(
  projectId: string,
  nodeId: string
): Promise<KnowledgeNode> {
  return getKnowledgeNode(projectId, nodeId);
}

export function fetchNodeNeighbors(
  projectId: string,
  nodeId: string
): Promise<NeighborNode[]> {
  return getNodeNeighbors(projectId, nodeId);
}

export function searchKnowledgeNodesByQuery(
  projectId: string,
  query: string
): Promise<KnowledgeNode[]> {
  return searchKnowledgeNodes(projectId, query);
}

export function buildKnowledgeGraphFor(projectId: string): Promise<BuildResult> {
  return buildKnowledgeGraph(projectId);
}

export function deleteKnowledgeGraphFor(projectId: string): Promise<void> {
  return deleteKnowledgeGraph(projectId);
}

export type { BuildResult, KnowledgeNode, NeighborNode };
