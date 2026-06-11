/**
 * State Index API — build and query project-level state indexes
 */

import type {
  EdgeEvidence,
  KnowledgeEdge,
  KnowledgeNode,
  NeighborNode,
  NodeMember,
} from '@/types/knowledgeGraph';
import { API_V1, buildQueryString, fetchWithTimeout, handleResponse } from './core';

// Re-export types for backward compat. Canonical home: @/types/knowledgeGraph.
export type { EdgeEvidence, KnowledgeEdge, KnowledgeNode, NeighborNode, NodeMember };

// ============================================================================
// State Index Operations
// ============================================================================

/**
 * List knowledge nodes in a project.
 */
export async function listKnowledgeNodes(projectId: string, limit = 50): Promise<KnowledgeNode[]> {
  const qs = buildQueryString({ limit });
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/knowledge-graph/nodes?${qs}`
  );
  const data = await handleResponse<{ nodes: KnowledgeNode[]; total: number }>(res);
  return data.nodes;
}

/**
 * Get a single knowledge node by ID.
 */
export async function getKnowledgeNode(projectId: string, nodeId: string): Promise<KnowledgeNode> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/knowledge-graph/nodes/${encodeURIComponent(nodeId)}`
  );
  return handleResponse<KnowledgeNode>(res);
}

/**
 * Get neighbors (adjacent nodes + edges) for a knowledge node.
 */
export async function getNodeNeighbors(projectId: string, nodeId: string): Promise<NeighborNode[]> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/knowledge-graph/nodes/${encodeURIComponent(nodeId)}/neighbors`
  );
  return handleResponse<NeighborNode[]>(res);
}

/**
 * Search knowledge nodes by text query.
 */
export async function searchKnowledgeNodes(
  projectId: string,
  query: string,
  limit = 20
): Promise<KnowledgeNode[]> {
  const qs = buildQueryString({ q: query, limit });
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/knowledge-graph/search?${qs}`
  );
  const data = await handleResponse<{ nodes: KnowledgeNode[]; total: number }>(res);
  return data.nodes;
}

/**
 * Delete the entire state index for a project.
 */
export async function deleteKnowledgeGraph(projectId: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/knowledge-graph`,
    { method: 'DELETE' }
  );
  await handleResponse(res);
}
