/**
 * Tree State Sync
 *
 * Syncs semantic tree state to the trees + tree_relations tables.
 * Used by extraction, compression, manual edit, and undo routes.
 * All operations use the caller's transaction handle (tx) for atomicity.
 *
 * After appending a YOps entry, call syncYOpsToTrees to replay the full
 * yops log and rebuild the trees table from the resulting snapshot.
 */

import type { Relation, SemanticContent } from '@t3x-dev/core';
import { flattenTrees } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  deleteTreeRelationsByConversation,
  deleteTreesByConversation,
  listTreeRelationsByConversation,
  listTreesByConversation,
  listYOpsLogByConversation,
  upsertTree,
  upsertTreeRelation,
} from '@t3x-dev/storage';
import { replayYOpsLog, toYOpsLogEntries } from './yops-log-utils';

/**
 * Replay the full yops log for a conversation and rebuild the trees table.
 * The `db` parameter should be a transaction handle (tx) from the caller.
 */
export async function syncYOpsToTrees(
  db: AnyDB,
  conversationId: string,
  projectId: string,
  opts?: { topicId?: string }
): Promise<void> {
  const records = await listYOpsLogByConversation(db, conversationId);
  const snapshot = replayYOpsLog(toYOpsLogEntries(records));
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

  // Walk trees and store each node with full metadata
  async function walkAndStore(node: import('@t3x-dev/core').TreeNode, parentPath: string): Promise<void> {
    const path = parentPath ? `${parentPath}/${node.key}` : node.key;
    await upsertTree(db, {
      conversationId,
      treeId: path,
      projectId,
      topicId,
      type: node.key,
      slots: node.slots,
      status: 'active',
      confidence: node.confidence,
      source: node.source ?? 'unknown',
      slotQuotes: node.slot_quotes ?? null,
      manualEdited: false,
    });
    for (const child of node.children) {
      await walkAndStore(child, path);
    }
  }

  for (const tree of snapshot.trees) {
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
      confidence: rel.confidence,
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

  // Reconstruct hierarchical tree from flat rows (rows have path-based treeId like "root/child")
  type TNode = import('@t3x-dev/core').TreeNode;
  const nodeMap = new Map<string, TNode>();

  // First pass: create all nodes
  for (const r of treeRows) {
    nodeMap.set(r.treeId, {
      key: r.type,
      slots: (r.slots ?? {}) as Record<string, import('@t3x-dev/core').SlotValue>,
      children: [],
      source: r.source !== 'unknown' ? r.source : undefined,
      confidence: r.confidence ?? undefined,
      slot_quotes: (r.slotQuotes ?? undefined) as Record<string, string> | undefined,
    });
  }

  // Second pass: attach children to parents
  const rootTrees: TNode[] = [];
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
    confidence: r.confidence ?? undefined,
  }));

  return { trees: rootTrees, relations: relationsResult };
}

