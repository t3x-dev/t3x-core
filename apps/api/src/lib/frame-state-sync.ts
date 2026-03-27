/**
 * Frame State Sync
 *
 * Applies delta changes to the frames + frame_relations tables.
 * Used by extraction, compression, manual edit, and undo routes.
 * All operations use the caller's transaction handle (tx) for atomicity.
 *
 * NOTE: The Delta type now uses tree-primary TreeChange (parent_path/target_path/node)
 * but the frames DB table still stores flat frames. We map tree changes to flat frame
 * upserts using the node key as the frame ID.
 */

import type { Delta, DeltaSource, Relation, SemanticContent } from '@t3x-dev/core';
import { flattenTrees } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  deleteFrame,
  deleteFrameRelationByKey,
  deleteFrameRelationsByConversation,
  deleteFrameRelationsByFrameId,
  deleteFramesByConversation,
  getFrameByKey,
  listFrameRelationsByConversation,
  listFramesByConversation,
  upsertFrame,
  upsertFrameRelation,
} from '@t3x-dev/storage';

/**
 * Apply a delta's changes to the frames table.
 * The `db` parameter should be a transaction handle (tx) from the caller.
 */
export async function syncDeltaToFrames(
  db: AnyDB,
  conversationId: string,
  projectId: string,
  delta: Delta,
  source: DeltaSource,
  opts?: { topicId?: string }
): Promise<void> {
  const isManual = source === 'manual';

  for (const change of delta.changes) {
    switch (change.action) {
      case 'add': {
        const n = change.node;
        await upsertFrame(db, {
          conversationId,
          frameId: n.key,
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
        const current = await getFrameByKey(db, conversationId, change.target_path);
        if (current) {
          const mergedSlots = { ...(current.slots as Record<string, unknown>) };
          for (const [k, v] of Object.entries(change.slots)) {
            if (v === null) {
              delete mergedSlots[k];
            } else {
              mergedSlots[k] = v;
            }
          }
          await upsertFrame(db, {
            conversationId,
            frameId: change.target_path,
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
        await deleteFrameRelationsByFrameId(db, conversationId, change.target_path);
        await deleteFrame(db, conversationId, change.target_path);
        break;
      }
    }
  }

  // Handle new relations
  if (delta.new_relations) {
    for (const rel of delta.new_relations) {
      await upsertFrameRelation(db, {
        conversationId,
        topicId: opts?.topicId,
        fromFrameId: rel.from,
        toFrameId: rel.to,
        type: rel.type,
        confidence: rel.confidence,
      });
    }
  }

  // Handle removed relations (match specific from+to+type)
  if (delta.remove_relations) {
    for (const rel of delta.remove_relations) {
      await deleteFrameRelationByKey(db, conversationId, rel.from, rel.to, rel.type);
    }
  }
}

/**
 * Rebuild frames table from a SemanticContent snapshot.
 * Used by undo (delete delta → rebuild from remaining deltas).
 */
export async function rebuildFramesFromSnapshot(
  db: AnyDB,
  conversationId: string,
  projectId: string,
  snapshot: SemanticContent,
  topicId?: string
): Promise<void> {
  // Clear existing
  await deleteFrameRelationsByConversation(db, conversationId);
  await deleteFramesByConversation(db, conversationId);

  // Flatten trees to FlatNode[] for DB storage
  const flatNodes = flattenTrees(snapshot.trees);
  for (const f of flatNodes) {
    await upsertFrame(db, {
      conversationId,
      frameId: f.id,
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
    await upsertFrameRelation(db, {
      conversationId,
      topicId,
      fromFrameId: rel.from,
      toFrameId: rel.to,
      type: rel.type,
      confidence: rel.confidence,
    });
  }
}

/**
 * Build a SemanticContent from the frames table (replaces buildDraft for reads).
 *
 * NOTE: Returns flat trees (one TreeNode per frame row) since the DB doesn't
 * store tree hierarchy. Use unflattenToTrees() from core if nesting is needed.
 */
export async function readDraftFromFrames(
  db: AnyDB,
  conversationId: string,
  topicId?: string
): Promise<SemanticContent> {
  const frameRows = await listFramesByConversation(db, conversationId, topicId);
  const relRows = await listFrameRelationsByConversation(db, conversationId, topicId);

  const trees = frameRows.map((r) => ({
    key: r.frameId,
    slots: r.slots as Record<string, string>,
    children: [] as import('@t3x-dev/core').TreeNode[],
    source: r.source ?? undefined,
    confidence: r.confidence ?? undefined,
    slot_quotes: r.slotSources as Record<string, string> | undefined,
  }));

  const relationsResult: Relation[] = relRows.map((r) => ({
    from: r.fromFrameId,
    to: r.toFrameId,
    type: r.type as Relation['type'],
    confidence: r.confidence ?? undefined,
  }));

  return { trees, relations: relationsResult };
}
