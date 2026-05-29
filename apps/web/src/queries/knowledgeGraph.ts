/**
 * L3 — knowledge-graph readers (read-only per v2 §2.3).
 *
 * Deletes live in @/commands/knowledgeGraph per v2 §2.4.
 */

import {
  getKnowledgeNode,
  getNodeNeighbors,
  listKnowledgeNodes,
  searchKnowledgeNodes,
} from '@/infrastructure/knowledge-graph';
import type { KnowledgeNode, NeighborNode } from '@/types/knowledgeGraph';

export function fetchKnowledgeNodes(projectId: string, limit = 50): Promise<KnowledgeNode[]> {
  return listKnowledgeNodes(projectId, limit);
}

export function fetchKnowledgeNode(projectId: string, nodeId: string): Promise<KnowledgeNode> {
  return getKnowledgeNode(projectId, nodeId);
}

export function fetchNodeNeighbors(projectId: string, nodeId: string): Promise<NeighborNode[]> {
  return getNodeNeighbors(projectId, nodeId);
}

export function searchKnowledgeNodesByQuery(
  projectId: string,
  query: string
): Promise<KnowledgeNode[]> {
  return searchKnowledgeNodes(projectId, query);
}

export type { KnowledgeNode, NeighborNode };
