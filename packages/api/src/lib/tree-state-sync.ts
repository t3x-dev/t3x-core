/**
 * Tree State Sync
 *
 * Syncs state tree data to the trees + tree_relations tables.
 * Used by extraction, compression, manual edit, and undo routes.
 * All operations use the caller's transaction handle (tx) for atomicity.
 *
 * After appending a YOps entry, call syncYOpsToTrees to replay the full
 * yops log and rebuild the trees table from the resulting snapshot.
 */

import type { Relation, SemanticContent, SlotValue } from '@t3x-dev/core';

/**
 * Internal extension of TreeNode used by tree-state persistence.
 * The DB schema stores `source` and `slot_quotes` per node; these extra
 * fields are present at runtime even though public TreeNode does not declare them.
 */
interface EnrichedTreeNode {
  key: string;
  slots: Record<string, SlotValue>;
  children: EnrichedTreeNode[];
  source?: string;
  slot_quotes?: Record<string, string>;
}

import type { AnyDB } from '@t3x-dev/storage';
import {
  deleteTreeRelationsByConversation,
  deleteTreesByConversation,
  listActiveYOpsLogByConversation,
  listTreeRelationsByConversation,
  listTreesByConversation,
  upsertTree,
  upsertTreeRelation,
} from '@t3x-dev/storage';
import {
  getConversationInheritedBaseline,
  replayEntriesOnBaselineFailFast,
} from './yops-log-utils';

/**
 * Replay the **active** yops log slice (committed entries + non-superseded
 * draft entries) for a conversation and rebuild the trees table. The
 * `db` parameter should be a transaction handle (tx) from the caller.
 *
 * Superseded entries are intentionally excluded — the materialized
 * trees table is the workspace's "current state" view, and a
 * superseded prior LLM suggestion is by definition no longer current.
 * The full audit history still lives in `yops_log` for the GET /yops
 * endpoint and replay diagnostics.
 */
export async function syncYOpsToTrees(
  db: AnyDB,
  conversationId: string,
  projectId: string,
  opts?: { topicId?: string }
): Promise<void> {
  const records = await listActiveYOpsLogByConversation(db, conversationId);
  const inheritedBaseline = await getConversationInheritedBaseline(db, conversationId);
  const snapshot = replayEntriesOnBaselineFailFast(inheritedBaseline, records);
  await rebuildTreesFromSnapshot(db, conversationId, projectId, snapshot, opts?.topicId);
}

/**
 * Rebuild trees table from a SemanticContent snapshot.
 * Used by undo (delete entry → rebuild from remaining entries).
 */
export async function rebuildTreesFromSnapshot(
  db: AnyDB,
  conversationId: string,
  projectId: string,
  snapshot: SemanticContent,
  topicId?: string
): Promise<void> {
  // Clear existing
  await deleteTreeRelationsByConversation(db, conversationId);
  await deleteTreesByConversation(db, conversationId);

  // Walk trees and store each node with full metadata.
  // Cast to EnrichedTreeNode: extracted trees carry source + slot_quotes at
  // runtime (set by the extraction pipeline) even though public TreeNode does not.
  async function walkAndStore(node: EnrichedTreeNode, parentPath: string): Promise<void> {
    const path = parentPath ? `${parentPath}/${node.key}` : node.key;
    await upsertTree(db, {
      conversationId,
      treeId: path,
      projectId,
      topicId,
      type: node.key,
      slots: node.slots,
      status: 'active',
      source: node.source ?? 'unknown',
      slotQuotes: node.slot_quotes ?? null,
      manualEdited: false,
    });
    for (const child of node.children) {
      await walkAndStore(child, path);
    }
  }

  for (const tree of snapshot.trees as EnrichedTreeNode[]) {
    await walkAndStore(tree, '');
  }

  // Insert relations
  for (const rel of snapshot.relations) {
    await upsertTreeRelation(db, {
      conversationId,
      topicId,
      fromTreeId: rel.from,
      toTreeId: rel.to,
      type: rel.type,
    });
  }
}

/**
 * Build a SemanticContent from the trees table (replaces buildDraft for reads).
 *
 * NOTE: Returns flat trees (one TreeNode per tree row) since the DB doesn't
 * store tree hierarchy. Use unflattenToTrees() from core if nesting is needed.
 */
export async function readDraftFromTrees(
  db: AnyDB,
  conversationId: string,
  topicId?: string
): Promise<SemanticContent> {
  const treeRows = await listTreesByConversation(db, conversationId, topicId);
  const relRows = await listTreeRelationsByConversation(db, conversationId, topicId);

  // Reconstruct hierarchical tree from flat rows (rows have path-based treeId like "root/child").
  // We build EnrichedTreeNode objects (which include source + slot_quotes from the DB) and
  // return them as SemanticContent. Callers that need source tracing can cast to EnrichedTreeNode.
  const nodeMap = new Map<string, EnrichedTreeNode>();

  // First pass: create all nodes
  for (const r of treeRows) {
    nodeMap.set(r.treeId, {
      key: r.type,
      slots: (r.slots ?? {}) as Record<string, SlotValue>,
      children: [],
      source: r.source !== 'unknown' ? r.source : undefined,
      slot_quotes: (r.slotQuotes ?? undefined) as Record<string, string> | undefined,
    });
  }

  // Second pass: attach children to parents
  const rootTrees: EnrichedTreeNode[] = [];
  for (const r of treeRows) {
    const node = nodeMap.get(r.treeId)!;
    const lastSlash = r.treeId.lastIndexOf('/');
    if (lastSlash === -1) {
      // Root node
      rootTrees.push(node);
    } else {
      // Child node — find parent
      const parentPath = r.treeId.substring(0, lastSlash);
      const parent = nodeMap.get(parentPath);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphan — treat as root
        rootTrees.push(node);
      }
    }
  }

  const relationsResult: Relation[] = relRows.map((r) => ({
    from: r.fromTreeId,
    to: r.toTreeId,
    type: r.type as Relation['type'],
  }));

  return { trees: rootTrees, relations: relationsResult };
}
