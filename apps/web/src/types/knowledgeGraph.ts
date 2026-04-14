/**
 * Knowledge-graph API contract types.
 *
 * Lives in @/types/ so components, store, queries, and hooks can import
 * without crossing @/infrastructure boundaries. Infrastructure and
 * queries both re-export for backward compat.
 */

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
