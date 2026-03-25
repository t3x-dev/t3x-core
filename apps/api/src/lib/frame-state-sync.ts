/**
 * Frame State Sync
 *
 * Applies delta changes to the frames + frame_relations tables.
 * Used by extraction, compression, manual edit, and undo routes.
 * All operations use the caller's transaction handle (tx) for atomicity.
 */

import type { Delta, DeltaSource, Frame, Relation, SemanticContent } from '@t3x-dev/core';
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
import type { AnyDB } from '@t3x-dev/storage';

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
        const f = change.frame;
        await upsertFrame(db, {
          conversationId,
          frameId: f.id,
          projectId,
          topicId: opts?.topicId,
          type: f.type,
          slots: f.slots,
          status: f.status ?? 'active',
          confidence: f.confidence,
          source,
          slotSources: f.slot_sources,
          manualEdited: isManual,
        });
        break;
      }
      case 'update': {
        const current = await getFrameByKey(db, conversationId, change.target);
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
            frameId: change.target,
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
        await deleteFrameRelationsByFrameId(db, conversationId, change.target);
        await deleteFrame(db, conversationId, change.target);
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

  // Insert frames
  for (const f of snapshot.frames) {
    await upsertFrame(db, {
      conversationId,
      frameId: f.id,
      projectId,
      topicId,
      type: f.type,
      slots: f.slots,
      status: f.status ?? 'active',
      confidence: f.confidence,
      source: 'pipeline',
      slotSources: f.slot_sources,
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
 */
export async function readDraftFromFrames(
  db: AnyDB,
  conversationId: string,
  topicId?: string
): Promise<SemanticContent> {
  const frameRows = await listFramesByConversation(db, conversationId, topicId);
  const relRows = await listFrameRelationsByConversation(db, conversationId, topicId);

  const framesResult: Frame[] = frameRows.map((r) => ({
    id: r.frameId,
    type: r.type,
    slots: r.slots as Record<string, unknown>,
    status: (r.status as 'active' | 'collapsed') ?? 'active',
    confidence: r.confidence ?? undefined,
    slot_sources: r.slotSources as Record<string, unknown> | undefined,
    manual_edited: r.manualEdited || undefined,
  }));

  const relationsResult: Relation[] = relRows.map((r) => ({
    from: r.fromFrameId,
    to: r.toFrameId,
    type: r.type as Relation['type'],
    confidence: r.confidence ?? undefined,
  }));

  return { frames: framesResult, relations: relationsResult };
}
