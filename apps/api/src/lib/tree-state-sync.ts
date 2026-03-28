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

  // Flatten trees to FlatNode[] for DB storage
  const flatNodes = flattenTrees(snapshot.trees);
  for (const f of flatNodes) {
    await upsertTree(db, {
      conversationId,
      treeId: f.id,
      projectId,
      topicId,
      type: f.type,
      slots: f.slots,
      status: 'active',
      confidence: f.confidence,
      source: 'pipeline',
      manualEdited: false,
    });
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

/** @deprecated Use rebuildTreesFromSnapshot */
export const rebuildFramesFromSnapshot = rebuildTreesFromSnapshot;

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

  const trees = treeRows.map((r) => ({
    key: r.treeId,
    slots: r.slots as Record<string, string>,
    children: [] as import('@t3x-dev/core').TreeNode[],
    source: r.source ?? undefined,
    confidence: r.confidence ?? undefined,
    slot_quotes: r.slotSources as Record<string, string> | undefined,
  }));

  const relationsResult: Relation[] = relRows.map((r) => ({
    from: r.fromTreeId,
    to: r.toTreeId,
    type: r.type as Relation['type'],
    confidence: r.confidence ?? undefined,
  }));

  return { trees, relations: relationsResult };
}

/** @deprecated Use readDraftFromTrees */
export const readDraftFromFrames = readDraftFromTrees;
