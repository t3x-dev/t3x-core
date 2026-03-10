/**
 * Knowledge Graph Builder
 *
 * Orchestrates the full graph build pipeline:
 * 1. Cluster sentences into entity/topic nodes
 * 2. Promote Ring 4 relations to edges between nodes
 * 3. Promote knowledge conflicts to contradicts edges
 * 4. Aggregate duplicate edges
 *
 * All functions are pure — no DB, no IO, no side effects.
 */

import { type ClusterOptions, clusterSentences, type SentenceInput } from './cluster';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphBuildInput {
  sentences: SentenceInput[];
  relations: Array<{
    source_id: string;
    target_id: string;
    type: string;
    confidence: number;
  }>;
  conflicts: Array<{
    new_sentence_id: string;
    existing_sentence_id: string;
    cosine: number;
  }>;
}

export interface GraphBuildNode {
  label: string;
  type: 'topic';
  member_sentence_ids: Array<{ sentence_id: string; commit_hash: string }>;
}

export interface GraphBuildEdge {
  /** Index into the nodes array */
  source_node_index: number;
  /** Index into the nodes array */
  target_node_index: number;
  type: string;
  weight: number;
  evidence: Array<{
    source_sentence_id: string;
    target_sentence_id: string;
    relation_type: string;
    confidence: number;
  }>;
}

export interface GraphBuildOutput {
  nodes: GraphBuildNode[];
  edges: GraphBuildEdge[];
  stats: {
    total_sentences: number;
    nodes_created: number;
    edges_created: number;
    build_time_ms: number;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawEdge {
  source_node_index: number;
  target_node_index: number;
  type: string;
  weight: number;
  evidence: Array<{
    source_sentence_id: string;
    target_sentence_id: string;
    relation_type: string;
    confidence: number;
  }>;
}

/**
 * Upsert a raw edge into the map, aggregating weight (max) and evidence.
 */
function upsertEdge(
  edgeMap: Map<string, RawEdge>,
  key: string,
  sourceNodeIndex: number,
  targetNodeIndex: number,
  type: string,
  confidence: number,
  sourceSentenceId: string,
  targetSentenceId: string,
  relationType: string
): void {
  const existing = edgeMap.get(key);
  if (existing) {
    existing.weight = Math.max(existing.weight, confidence);
    existing.evidence.push({
      source_sentence_id: sourceSentenceId,
      target_sentence_id: targetSentenceId,
      relation_type: relationType,
      confidence,
    });
  } else {
    edgeMap.set(key, {
      source_node_index: sourceNodeIndex,
      target_node_index: targetNodeIndex,
      type,
      weight: confidence,
      evidence: [
        {
          source_sentence_id: sourceSentenceId,
          target_sentence_id: targetSentenceId,
          relation_type: relationType,
          confidence,
        },
      ],
    });
  }
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build a knowledge graph from clustered sentences, relations, and conflicts.
 *
 * Pure function: takes raw data, returns structured output ready for DB insertion.
 */
export function buildKnowledgeGraph(
  input: GraphBuildInput,
  options?: ClusterOptions
): GraphBuildOutput {
  const start = performance.now();

  // Early return for empty input
  if (input.sentences.length === 0) {
    return {
      nodes: [],
      edges: [],
      stats: {
        total_sentences: 0,
        nodes_created: 0,
        edges_created: 0,
        build_time_ms: 0,
      },
    };
  }

  // Step 1: Cluster sentences into nodes
  const clusters = clusterSentences(input.sentences, options);

  // Step 2: Build sentence -> cluster index lookup
  const sentenceToCluster = new Map<string, number>();
  for (let i = 0; i < clusters.length; i++) {
    for (const member of clusters[i].members) {
      sentenceToCluster.set(member.sentence_id, i);
    }
  }

  // Step 3 & 4: Create raw edges from relations and conflicts, aggregating duplicates
  const rawEdges = new Map<string, RawEdge>();

  // Promote Ring 4 relations to inter-cluster edges
  for (const relation of input.relations) {
    const sourceCluster = sentenceToCluster.get(relation.source_id);
    const targetCluster = sentenceToCluster.get(relation.target_id);

    // Skip if either sentence is not in any cluster
    if (sourceCluster === undefined || targetCluster === undefined) continue;
    // Skip intra-cluster edges
    if (sourceCluster === targetCluster) continue;

    const key = `${sourceCluster}:${targetCluster}:${relation.type}`;
    upsertEdge(
      rawEdges,
      key,
      sourceCluster,
      targetCluster,
      relation.type,
      relation.confidence,
      relation.source_id,
      relation.target_id,
      relation.type
    );
  }

  // Promote knowledge conflicts to contradicts edges
  for (const conflict of input.conflicts) {
    const sourceCluster = sentenceToCluster.get(conflict.new_sentence_id);
    const targetCluster = sentenceToCluster.get(conflict.existing_sentence_id);

    // Skip if either sentence is not in any cluster
    if (sourceCluster === undefined || targetCluster === undefined) continue;
    // Skip intra-cluster edges
    if (sourceCluster === targetCluster) continue;

    const key = `${sourceCluster}:${targetCluster}:contradicts`;
    upsertEdge(
      rawEdges,
      key,
      sourceCluster,
      targetCluster,
      'contradicts',
      conflict.cosine,
      conflict.new_sentence_id,
      conflict.existing_sentence_id,
      'contradicts'
    );
  }

  // Step 5: Convert to output format
  const nodes: GraphBuildNode[] = clusters.map((c) => ({
    label: c.label,
    type: c.type,
    member_sentence_ids: c.members,
  }));

  const edges: GraphBuildEdge[] = Array.from(rawEdges.values());

  const elapsed = Math.round((performance.now() - start) * 100) / 100;

  return {
    nodes,
    edges,
    stats: {
      total_sentences: input.sentences.length,
      nodes_created: nodes.length,
      edges_created: edges.length,
      build_time_ms: elapsed,
    },
  };
}
