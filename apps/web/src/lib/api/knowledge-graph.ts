/**
 * Knowledge Graph API — build and query project-level knowledge graphs
 */

import { API_V1, buildQueryString, fetchWithTimeout, handleResponse } from './core';

// ============================================================================
// Types
// ============================================================================

export interface KnowledgeNode {
  id: string;
  project_id: string;
  label: string;
  type: string;
  summary: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface NodeMember {
  node_id: string;
  node_key: string;
  commit_hash: string;
}

export interface EdgeEvidence {
  source_node: string;
  target_node_key: string;
  relation_type: string;
}

export interface KnowledgeEdge {
  id: string;
  project_id: string;
  source_node_id: string;
  target_node_id: string;
  type: string;
  weight: number;
  evidence: EdgeEvidence[] | null;
  created_at: string;
}

export interface NeighborNode {
  node: KnowledgeNode;
  edge: KnowledgeEdge;
  direction: 'outgoing' | 'incoming';
}

export interface BuildResult {
  total_nodes: number;
  nodes_created: number;
  edges_created: number;
  build_time_ms: number;
}

// ============================================================================
// Knowledge Graph Operations
// ============================================================================

/**
 * Build (or rebuild) the knowledge graph for a project.
 */
export async function buildKnowledgeGraph(projectId: string): Promise<BuildResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/knowledge-graph/build`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
  return handleResponse<BuildResult>(res);
}

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
 * Delete the entire knowledge graph for a project.
 */
export async function deleteKnowledgeGraph(projectId: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/knowledge-graph`,
    { method: 'DELETE' }
  );
  await handleResponse(res);
}
