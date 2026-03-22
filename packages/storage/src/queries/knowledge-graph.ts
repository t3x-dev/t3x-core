/**
 * Knowledge Graph Queries
 *
 * CRUD operations for knowledge_nodes, knowledge_node_members, knowledge_edges tables.
 * Supports graph traversal and node search.
 */

import { randomUUID } from 'crypto';
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  type KnowledgeEdgeRecord,
  type KnowledgeNodeMemberRecord,
  type KnowledgeNodeRecord,
  knowledgeEdges,
  knowledgeNodeMembers,
  knowledgeNodes,
} from '../schema-frames';

// ============================================================
// Output Types (snake_case for API consistency)
// ============================================================

export interface KnowledgeNodeOutput {
  id: string;
  project_id: string;
  label: string;
  type: string;
  summary: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface NodeMemberOutput {
  node_id: string;
  sentence_id: string;
  commit_hash: string;
}

export interface KnowledgeEdgeOutput {
  id: string;
  project_id: string;
  source_node_id: string;
  target_node_id: string;
  type: string;
  weight: number;
  evidence: Array<{
    source_sentence_id: string;
    target_sentence_id: string;
    relation_type: string;
    confidence: number;
  }> | null;
  created_at: string;
}

export interface NeighborNodeOutput {
  node: KnowledgeNodeOutput;
  edge: KnowledgeEdgeOutput;
  direction: 'outgoing' | 'incoming';
}

// ============================================================
// ID Generation
// ============================================================

function generateNodeId(): string {
  return `kn_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function generateEdgeId(): string {
  return `ke_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

// ============================================================
// Row-to-Output Converters
// ============================================================

function nodeRowToOutput(row: KnowledgeNodeRecord): KnowledgeNodeOutput {
  return {
    id: row.id,
    project_id: row.projectId,
    label: row.label,
    type: row.type,
    summary: row.summary,
    member_count: row.memberCount,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function memberRowToOutput(row: KnowledgeNodeMemberRecord): NodeMemberOutput {
  return {
    node_id: row.nodeId,
    sentence_id: row.sentenceId,
    commit_hash: row.commitHash,
  };
}

function edgeRowToOutput(row: KnowledgeEdgeRecord): KnowledgeEdgeOutput {
  return {
    id: row.id,
    project_id: row.projectId,
    source_node_id: row.sourceNodeId,
    target_node_id: row.targetNodeId,
    type: row.type,
    weight: row.weight,
    evidence: row.evidence ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

// ============================================================
// Node CRUD
// ============================================================

/**
 * Insert a single knowledge node.
 */
export async function insertKnowledgeNode(
  db: AnyDB,
  input: {
    project_id: string;
    label: string;
    type?: string;
    summary?: string;
    member_count: number;
  }
): Promise<KnowledgeNodeOutput> {
  const id = generateNodeId();

  const [row] = await db
    .insert(knowledgeNodes)
    .values({
      id,
      projectId: input.project_id,
      label: input.label,
      type: input.type ?? 'topic',
      summary: input.summary,
      memberCount: input.member_count,
    })
    .returning();

  return nodeRowToOutput(row);
}

/**
 * Batch insert multiple knowledge nodes.
 */
export async function insertKnowledgeNodes(
  db: AnyDB,
  inputs: Array<{
    project_id: string;
    label: string;
    type?: string;
    summary?: string;
    member_count: number;
  }>
): Promise<KnowledgeNodeOutput[]> {
  if (inputs.length === 0) return [];

  const values = inputs.map((input) => ({
    id: generateNodeId(),
    projectId: input.project_id,
    label: input.label,
    type: input.type ?? 'topic',
    summary: input.summary,
    memberCount: input.member_count,
  }));

  const rows = await db.insert(knowledgeNodes).values(values).returning();

  return rows.map(nodeRowToOutput);
}

/**
 * Find all nodes for a project, sorted by member_count desc.
 */
export async function findKnowledgeNodesByProject(
  db: AnyDB,
  projectId: string,
  options?: { limit?: number }
): Promise<KnowledgeNodeOutput[]> {
  const limit = options?.limit ?? 10000;

  const rows = await db
    .select()
    .from(knowledgeNodes)
    .where(eq(knowledgeNodes.projectId, projectId))
    .orderBy(desc(knowledgeNodes.memberCount))
    .limit(limit);

  return rows.map(nodeRowToOutput);
}

/**
 * Find a single node by ID.
 */
export async function findKnowledgeNodeById(
  db: AnyDB,
  nodeId: string
): Promise<KnowledgeNodeOutput | null> {
  const [row] = await db
    .select()
    .from(knowledgeNodes)
    .where(eq(knowledgeNodes.id, nodeId))
    .limit(1);

  return row ? nodeRowToOutput(row) : null;
}

/**
 * Delete entire knowledge graph for a project.
 * Cascade deletes members and edges via FK ON DELETE CASCADE.
 */
export async function deleteKnowledgeGraphByProject(
  db: AnyDB,
  projectId: string
): Promise<{ nodes_deleted: number }> {
  const result = await db
    .delete(knowledgeNodes)
    .where(eq(knowledgeNodes.projectId, projectId))
    .returning();

  return { nodes_deleted: result.length };
}

// ============================================================
// Member CRUD
// ============================================================

/**
 * Batch insert node members.
 */
export async function insertNodeMembers(
  db: AnyDB,
  members: Array<{ node_id: string; sentence_id: string; commit_hash: string }>
): Promise<void> {
  if (members.length === 0) return;

  const values = members.map((m) => ({
    nodeId: m.node_id,
    sentenceId: m.sentence_id,
    commitHash: m.commit_hash,
  }));

  await db.insert(knowledgeNodeMembers).values(values);
}

/**
 * Find all members of a node.
 */
export async function findMembersByNode(db: AnyDB, nodeId: string): Promise<NodeMemberOutput[]> {
  const rows = await db
    .select()
    .from(knowledgeNodeMembers)
    .where(eq(knowledgeNodeMembers.nodeId, nodeId));

  return rows.map(memberRowToOutput);
}

/**
 * Reverse lookup: find which node a sentence belongs to.
 * Returns the node ID, or null if sentence is not a member of any node.
 */
export async function findNodeBySentence(db: AnyDB, sentenceId: string): Promise<string | null> {
  const [row] = await db
    .select({ nodeId: knowledgeNodeMembers.nodeId })
    .from(knowledgeNodeMembers)
    .where(eq(knowledgeNodeMembers.sentenceId, sentenceId))
    .limit(1);

  return row ? row.nodeId : null;
}

// ============================================================
// Edge CRUD
// ============================================================

/**
 * Insert a single knowledge edge.
 */
export async function insertKnowledgeEdge(
  db: AnyDB,
  input: {
    project_id: string;
    source_node_id: string;
    target_node_id: string;
    type: string;
    weight: number;
    evidence?: Array<{
      source_sentence_id: string;
      target_sentence_id: string;
      relation_type: string;
      confidence: number;
    }>;
  }
): Promise<KnowledgeEdgeOutput> {
  const id = generateEdgeId();

  const [row] = await db
    .insert(knowledgeEdges)
    .values({
      id,
      projectId: input.project_id,
      sourceNodeId: input.source_node_id,
      targetNodeId: input.target_node_id,
      type: input.type,
      weight: input.weight,
      evidence: input.evidence,
    })
    .returning();

  return edgeRowToOutput(row);
}

/**
 * Batch insert multiple knowledge edges.
 */
export async function insertKnowledgeEdges(
  db: AnyDB,
  inputs: Array<{
    project_id: string;
    source_node_id: string;
    target_node_id: string;
    type: string;
    weight: number;
    evidence?: Array<{
      source_sentence_id: string;
      target_sentence_id: string;
      relation_type: string;
      confidence: number;
    }>;
  }>
): Promise<KnowledgeEdgeOutput[]> {
  if (inputs.length === 0) return [];

  const values = inputs.map((input) => ({
    id: generateEdgeId(),
    projectId: input.project_id,
    sourceNodeId: input.source_node_id,
    targetNodeId: input.target_node_id,
    type: input.type,
    weight: input.weight,
    evidence: input.evidence,
  }));

  const rows = await db.insert(knowledgeEdges).values(values).returning();

  return rows.map(edgeRowToOutput);
}

/**
 * Find all edges connected to a node (both directions).
 */
export async function findEdgesByNode(db: AnyDB, nodeId: string): Promise<KnowledgeEdgeOutput[]> {
  const rows = await db
    .select()
    .from(knowledgeEdges)
    .where(or(eq(knowledgeEdges.sourceNodeId, nodeId), eq(knowledgeEdges.targetNodeId, nodeId)));

  return rows.map(edgeRowToOutput);
}

/**
 * Find neighbor nodes of a given node (with edge info and direction).
 *
 * Approach:
 * 1. Find outgoing edges (source = nodeId) -> load target nodes
 * 2. Find incoming edges (target = nodeId) -> load source nodes
 * 3. Combine with direction labels
 */
export async function findNeighborNodes(db: AnyDB, nodeId: string): Promise<NeighborNodeOutput[]> {
  // Fetch all edges in both directions (2 queries)
  const outgoingEdges = await db
    .select()
    .from(knowledgeEdges)
    .where(eq(knowledgeEdges.sourceNodeId, nodeId));

  const incomingEdges = await db
    .select()
    .from(knowledgeEdges)
    .where(eq(knowledgeEdges.targetNodeId, nodeId));

  // Batch-load all neighbor node IDs in a single query (deduplicated)
  const neighborIds = [
    ...new Set([
      ...outgoingEdges.map((e) => e.targetNodeId),
      ...incomingEdges.map((e) => e.sourceNodeId),
    ]),
  ];

  if (neighborIds.length === 0) return [];

  const neighborRows = await db
    .select()
    .from(knowledgeNodes)
    .where(inArray(knowledgeNodes.id, neighborIds));

  const nodeMap = new Map(neighborRows.map((n) => [n.id, n]));

  const results: NeighborNodeOutput[] = [];

  for (const edge of outgoingEdges) {
    const targetNode = nodeMap.get(edge.targetNodeId);
    if (targetNode) {
      results.push({
        node: nodeRowToOutput(targetNode),
        edge: edgeRowToOutput(edge),
        direction: 'outgoing',
      });
    }
  }

  for (const edge of incomingEdges) {
    const sourceNode = nodeMap.get(edge.sourceNodeId);
    if (sourceNode) {
      results.push({
        node: nodeRowToOutput(sourceNode),
        edge: edgeRowToOutput(edge),
        direction: 'incoming',
      });
    }
  }

  return results;
}

// ============================================================
// Search
// ============================================================

/**
 * Search nodes by label (case-insensitive substring match).
 */
export async function searchKnowledgeNodes(
  db: AnyDB,
  projectId: string,
  query: string,
  options?: { limit?: number }
): Promise<KnowledgeNodeOutput[]> {
  const limit = options?.limit ?? 10000;

  const rows = await db
    .select()
    .from(knowledgeNodes)
    .where(
      and(
        eq(knowledgeNodes.projectId, projectId),
        ilike(knowledgeNodes.label, `%${query.replace(/[%_\\]/g, '\\$&')}%`)
      )
    )
    .orderBy(desc(knowledgeNodes.memberCount))
    .limit(limit);

  return rows.map(nodeRowToOutput);
}
