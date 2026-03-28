/**
 * Tree State Sync
 *
 * Applies delta changes to the trees + tree_relations tables.
 * Used by extraction, compression, manual edit, and undo routes.
 * All operations use the caller's transaction handle (tx) for atomicity.
 *
 * NOTE: The Delta type now uses tree-primary TreeChange (parent_path/target_path/node)
 * but the trees DB table still stores flat nodes. We map tree changes to flat node
 * upserts using the node key as the tree ID.
 */

import type { Delta, YOpsSource, Relation, SemanticContent } from '@t3x-dev/core';
import { flattenTrees } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  deleteTree,
  deleteTreeRelationByKey,
  deleteTreeRelationsByConversation,
  deleteTreeRelationsByTreeId,
  deleteTreesByConversation,
  getTreeByKey,
  listTreeRelationsByConversation,
  listTreesByConversation,
  upsertTree,
  upsertTreeRelation,
} from '@t3x-dev/storage';

/**
 * Apply a delta's changes to the trees table.
 * The `db` parameter should be a transaction handle (tx) from the caller.
 */
export async function syncDeltaToTrees(
  db: AnyDB,
  conversationId: string,
  projectId: string,
  delta: Delta,
  source: YOpsSource,
  opts?: { topicId?: string }
): Promise<void> {
  const isManual = source === 'manual';

  for (const change of delta.changes) {
    switch (change.action) {
      case 'add': {
        const n = change.node;
        await upsertTree(db, {
          conversationId,
          treeId: n.key,
          projectId,
          topicId: opts?.topicId,
          type: n.key,
          slots: n.slots,
          status: 'active',
          confidence: n.confidence,
          source,
          slotSources: n.slot_quotes,
          manualEdited: isManual,
        });
        break;
      }
      case 'update': {
        const current = await getTreeByKey(db, conversationId, change.target_path);
        if (current) {
          const mergedSlots = { ...(current.slots as Record<string, unknown>) };
          for (const [k, v] of Object.entries(change.slots)) {
            if (v === null) {
              delete mergedSlots[k];
            } else {
              mergedSlots[k] = v;
            }
          }
          await upsertTree(db, {
            conversationId,
            treeId: change.target_path,
            projectId,
            topicId: opts?.topicId ?? current.topicId ?? undefined,
            type: current.type,
            slots: mergedSlots,
            status: (current.status as string) ?? 'active',
            confidence: current.confidence ?? undefined,
            source,
            slotSources: current.slotSources,
            manualEdited: isManual || current.manualEdited,
          });
        }
        break;
      }
      case 'remove': {
        await deleteTreeRelationsByTreeId(db, conversationId, change.target_path);
        await deleteTree(db, conversationId, change.target_path);
        break;
      }
    }
  }

  // Handle new relations
  if (delta.new_relations) {
    for (const rel of delta.new_relations) {
      await upsertTreeRelation(db, {
        conversationId,
        topicId: opts?.topicId,
        fromTreeId: rel.from,
        toTreeId: rel.to,
        type: rel.type,
        confidence: rel.confidence,
      });
    }
  }

  // Handle removed relations (match specific from+to+type)
  if (delta.remove_relations) {
    for (const rel of delta.remove_relations) {
      await deleteTreeRelationByKey(db, conversationId, rel.from, rel.to, rel.type);
    }
  }
}

/** @deprecated Use syncDeltaToTrees */
export const syncDeltaToFrames = syncDeltaToTrees;

/**
 * Rebuild trees table from a SemanticContent snapshot.
 * Used by undo (delete delta → rebuild from remaining deltas).
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
