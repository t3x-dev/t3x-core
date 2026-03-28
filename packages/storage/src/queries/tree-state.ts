/**
 * Tree State Queries
 *
 * CRUD operations for the trees + tree_relations tables.
 * These tables are the source-of-truth for current tree state.
 */

import { randomUUID } from 'node:crypto';
import { and, eq, isNull, or } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import type {
  TreeInsert,
  TreeRecord,
  TreeRelationInsert,
  TreeRelationRecord,
} from '../schema-tree-state';
import { treeRelations, trees } from '../schema-tree-state';

// ── Types ──

export interface UpsertTreeInput {
  conversationId: string;
  treeId: string;
  projectId: string;
  topicId?: string;
  type: string;
  slots: unknown;
  status?: string;
  confidence?: number;
  source: string;
  slotQuotes?: unknown;
  slotSources?: unknown;
  manualEdited?: boolean;
}

export interface UpsertTreeRelationInput {
  conversationId: string;
  topicId?: string;
  fromTreeId: string;
  toTreeId: string;
  type: string;
  confidence?: number;
}

// ── Tree Queries ──

export async function upsertTree(db: AnyDB, input: UpsertTreeInput): Promise<TreeRecord> {
  const row: TreeInsert = {
    conversationId: input.conversationId,
    treeId: input.treeId,
    projectId: input.projectId,
    topicId: input.topicId ?? null,
    type: input.type,
    slots: input.slots,
    status: input.status ?? 'active',
    confidence: input.confidence ?? null,
    source: input.source,
    slotQuotes: input.slotQuotes ?? null,
    slotSources: input.slotSources ?? null,
    manualEdited: input.manualEdited ?? false,
  };

  const [result] = await db
    .insert(trees)
    .values(row)
    .onConflictDoUpdate({
      target: [trees.conversationId, trees.treeId],
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

export async function getTreeByKey(
  db: AnyDB,
  conversationId: string,
  treeId: string
): Promise<TreeRecord | undefined> {
  const [result] = await db
    .select()
    .from(trees)
    .where(and(eq(trees.conversationId, conversationId), eq(trees.treeId, treeId)));
  return result;
}

export async function deleteTree(
  db: AnyDB,
  conversationId: string,
  treeId: string
): Promise<TreeRecord | undefined> {
  const [result] = await db
    .delete(trees)
    .where(and(eq(trees.conversationId, conversationId), eq(trees.treeId, treeId)))
    .returning();
  return result;
}

export async function listTreesByConversation(
  db: AnyDB,
  conversationId: string,
  topicId?: string
): Promise<TreeRecord[]> {
  if (topicId) {
    return db
      .select()
      .from(trees)
      .where(
        and(
          eq(trees.conversationId, conversationId),
          or(eq(trees.topicId, topicId), isNull(trees.topicId))
        )
      );
  }
  return db.select().from(trees).where(eq(trees.conversationId, conversationId));
}

export async function deleteTreesByConversation(db: AnyDB, conversationId: string): Promise<void> {
  await db.delete(trees).where(eq(trees.conversationId, conversationId));
}

export async function clearManualEditedFlags(db: AnyDB, conversationId: string): Promise<void> {
  await db
    .update(trees)
    .set({ manualEdited: false, updatedAt: new Date() })
    .where(and(eq(trees.conversationId, conversationId), eq(trees.manualEdited, true)));
}

// ── Tree Relation Queries ──

export async function upsertTreeRelation(
  db: AnyDB,
  input: UpsertTreeRelationInput
): Promise<TreeRelationRecord> {
  const id = `trel_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const row: TreeRelationInsert = {
    id,
    conversationId: input.conversationId,
    topicId: input.topicId ?? null,
    fromTreeId: input.fromTreeId,
    toTreeId: input.toTreeId,
    type: input.type,
    confidence: input.confidence ?? null,
  };

  const [result] = await db.insert(treeRelations).values(row).returning();
  return result;
}

export async function listTreeRelationsByConversation(
  db: AnyDB,
  conversationId: string,
  topicId?: string
): Promise<TreeRelationRecord[]> {
  if (topicId) {
    return db
      .select()
      .from(treeRelations)
      .where(
        and(
          eq(treeRelations.conversationId, conversationId),
          or(eq(treeRelations.topicId, topicId), isNull(treeRelations.topicId))
        )
      );
  }
  return db.select().from(treeRelations).where(eq(treeRelations.conversationId, conversationId));
}

export async function deleteTreeRelationsByConversation(
  db: AnyDB,
  conversationId: string
): Promise<void> {
  await db.delete(treeRelations).where(eq(treeRelations.conversationId, conversationId));
}

export async function deleteTreeRelationsByTreeId(
  db: AnyDB,
  conversationId: string,
  treeId: string
): Promise<void> {
  await db
    .delete(treeRelations)
    .where(
      and(
        eq(treeRelations.conversationId, conversationId),
        or(eq(treeRelations.fromTreeId, treeId), eq(treeRelations.toTreeId, treeId))
      )
    );
}

export async function deleteTreeRelationByKey(
  db: AnyDB,
  conversationId: string,
  fromTreeId: string,
  toTreeId: string,
  type: string
): Promise<void> {
  await db
    .delete(treeRelations)
    .where(
      and(
        eq(treeRelations.conversationId, conversationId),
        eq(treeRelations.fromTreeId, fromTreeId),
        eq(treeRelations.toTreeId, toTreeId),
        eq(treeRelations.type, type)
      )
    );
}
