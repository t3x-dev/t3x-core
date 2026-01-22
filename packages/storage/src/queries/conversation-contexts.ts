/**
 * Conversation Contexts Queries
 *
 * CRUD operations for conversation_contexts table using Drizzle ORM.
 * This stores per-conversation context configuration - which pins to use.
 *
 * Default behavior (no row): use all project pins.
 * null selectedPinIds: use all project pins.
 * [] selectedPinIds: no pins (fresh start).
 * [...ids] selectedPinIds: specific pins only.
 *
 * @see docs/specification/semantic-layer-architecture.md
 */

import type { ConversationContext } from '@t3x/core';
import { eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  type ConversationContextRecord,
  conversationContexts,
} from '../schema-v4';

// ============================================================
// Query Functions
// ============================================================

/**
 * Get conversation context by conversation ID
 *
 * @param db - Database instance
 * @param conversationId - The conversation ID
 * @returns ConversationContext or null if not found
 */
export async function getConversationContext(
  db: AnyDB,
  conversationId: string
): Promise<ConversationContext | null> {
  const [row] = await db
    .select()
    .from(conversationContexts)
    .where(eq(conversationContexts.conversationId, conversationId))
    .limit(1);

  return row ? rowToConversationContext(row) : null;
}

/**
 * Set conversation context (upsert)
 *
 * Creates a new context if none exists, updates if one already exists.
 *
 * @param db - Database instance
 * @param conversationId - The conversation ID
 * @param pinIds - Selected pin IDs (null = use all project pins)
 * @returns The created/updated ConversationContext
 */
export async function setConversationContext(
  db: AnyDB,
  conversationId: string,
  pinIds: string[] | null
): Promise<ConversationContext> {
  const now = new Date();

  const [row] = await db
    .insert(conversationContexts)
    .values({
      conversationId,
      selectedPinIds: pinIds,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: conversationContexts.conversationId,
      set: {
        selectedPinIds: pinIds,
        updatedAt: now,
      },
    })
    .returning();

  return rowToConversationContext(row);
}

/**
 * Delete conversation context
 *
 * After deletion, the conversation will use default behavior (all project pins).
 *
 * @param db - Database instance
 * @param conversationId - The conversation ID
 * @returns true if deleted, false if not found
 */
export async function deleteConversationContext(
  db: AnyDB,
  conversationId: string
): Promise<boolean> {
  const result = await db
    .delete(conversationContexts)
    .where(eq(conversationContexts.conversationId, conversationId))
    .returning();

  return result.length > 0;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert database row to ConversationContext type
 */
function rowToConversationContext(
  row: ConversationContextRecord
): ConversationContext {
  return {
    conversation_id: row.conversationId,
    selected_pin_ids: row.selectedPinIds ?? null,
    updated_at: row.updatedAt.toISOString(),
  };
}
