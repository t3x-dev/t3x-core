/**
 * Frame State Queries
 *
 * CRUD operations for the frames + frame_relations tables.
 * These tables are the source-of-truth for current frame state.
 */

import { randomUUID } from 'node:crypto';
import { and, eq, isNull, or } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import type {
  FrameInsert,
  FrameRecord,
  FrameRelationInsert,
  FrameRelationRecord,
} from '../schema-frame-state';
import { frameRelations, frames } from '../schema-frame-state';

// ── Types ──

export interface UpsertFrameInput {
  conversationId: string;
  frameId: string;
  projectId: string;
  topicId?: string;
  type: string;
  slots: unknown;
  status?: string;
  confidence?: number;
  source: string;
  slotSources?: unknown;
  manualEdited?: boolean;
}

export interface UpsertFrameRelationInput {
  conversationId: string;
  topicId?: string;
  fromFrameId: string;
  toFrameId: string;
  type: string;
  confidence?: number;
}

// ── Frame Queries ──

export async function upsertFrame(db: AnyDB, input: UpsertFrameInput): Promise<FrameRecord> {
  const row: FrameInsert = {
    conversationId: input.conversationId,
    frameId: input.frameId,
    projectId: input.projectId,
    topicId: input.topicId ?? null,
    type: input.type,
    slots: input.slots,
    status: input.status ?? 'active',
    confidence: input.confidence ?? null,
    source: input.source,
    slotSources: input.slotSources ?? null,
    manualEdited: input.manualEdited ?? false,
  };

  const [result] = await db
    .insert(frames)
    .values(row)
    .onConflictDoUpdate({
      target: [frames.conversationId, frames.frameId],
      set: {
        type: input.type,
        slots: input.slots,
        status: input.status ?? 'active',
        confidence: input.confidence ?? null,
        source: input.source,
        slotSources: input.slotSources ?? null,
        manualEdited: input.manualEdited ?? false,
        updatedAt: new Date(),
      },
    })
    .returning();
  return result;
}

export async function getFrameByKey(
  db: AnyDB,
  conversationId: string,
  frameId: string
): Promise<FrameRecord | undefined> {
  const [result] = await db
    .select()
    .from(frames)
    .where(and(eq(frames.conversationId, conversationId), eq(frames.frameId, frameId)));
  return result;
}

export async function deleteFrame(
  db: AnyDB,
  conversationId: string,
  frameId: string
): Promise<FrameRecord | undefined> {
  const [result] = await db
    .delete(frames)
    .where(and(eq(frames.conversationId, conversationId), eq(frames.frameId, frameId)))
    .returning();
  return result;
}

export async function listFramesByConversation(
  db: AnyDB,
  conversationId: string,
  topicId?: string
): Promise<FrameRecord[]> {
  if (topicId) {
    return db
      .select()
      .from(frames)
      .where(
        and(
          eq(frames.conversationId, conversationId),
          or(eq(frames.topicId, topicId), isNull(frames.topicId))
        )
      );
  }
  return db.select().from(frames).where(eq(frames.conversationId, conversationId));
}

export async function deleteFramesByConversation(db: AnyDB, conversationId: string): Promise<void> {
  await db.delete(frames).where(eq(frames.conversationId, conversationId));
}

export async function clearManualEditedFlags(db: AnyDB, conversationId: string): Promise<void> {
  await db
    .update(frames)
    .set({ manualEdited: false, updatedAt: new Date() })
    .where(and(eq(frames.conversationId, conversationId), eq(frames.manualEdited, true)));
}

// ── Frame Relation Queries ──

export async function upsertFrameRelation(
  db: AnyDB,
  input: UpsertFrameRelationInput
): Promise<FrameRelationRecord> {
  const id = `frel_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const row: FrameRelationInsert = {
    id,
    conversationId: input.conversationId,
    topicId: input.topicId ?? null,
    fromFrameId: input.fromFrameId,
    toFrameId: input.toFrameId,
    type: input.type,
    confidence: input.confidence ?? null,
  };

  const [result] = await db.insert(frameRelations).values(row).returning();
  return result;
}

export async function listFrameRelationsByConversation(
  db: AnyDB,
  conversationId: string,
  topicId?: string
): Promise<FrameRelationRecord[]> {
  if (topicId) {
    return db
      .select()
      .from(frameRelations)
      .where(
        and(
          eq(frameRelations.conversationId, conversationId),
          or(eq(frameRelations.topicId, topicId), isNull(frameRelations.topicId))
        )
      );
  }
  return db.select().from(frameRelations).where(eq(frameRelations.conversationId, conversationId));
}

export async function deleteFrameRelationsByConversation(
  db: AnyDB,
  conversationId: string
): Promise<void> {
  await db.delete(frameRelations).where(eq(frameRelations.conversationId, conversationId));
}

export async function deleteFrameRelationsByFrameId(
  db: AnyDB,
  conversationId: string,
  frameId: string
): Promise<void> {
  await db
    .delete(frameRelations)
    .where(
      and(
        eq(frameRelations.conversationId, conversationId),
        or(eq(frameRelations.fromFrameId, frameId), eq(frameRelations.toFrameId, frameId))
      )
    );
}

export async function deleteFrameRelationByKey(
  db: AnyDB,
  conversationId: string,
  fromFrameId: string,
  toFrameId: string,
  type: string
): Promise<void> {
  await db
    .delete(frameRelations)
    .where(
      and(
        eq(frameRelations.conversationId, conversationId),
        eq(frameRelations.fromFrameId, fromFrameId),
        eq(frameRelations.toFrameId, toFrameId),
        eq(frameRelations.type, type)
      )
    );
}
