/**
 * Pins Queries
 *
 * CRUD operations for pins table using Drizzle ORM.
 * Pins mark items as selected for commit sources and conversation context.
 *
 * One mechanism, dual purpose:
 * 1. Commit: pinned items become sources for next commit
 * 2. Conversation: pinned items become LLM background context
 *
 * @see docs/specification/semantic-layer-architecture.md
 */

import type { CreatePinInput, Pin, PinType } from '@t3x-dev/core';
import { generatePinId } from '@t3x-dev/core';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type PinRecord, pins } from '../schema-frames';

// ============================================================
// Types
// ============================================================

export interface ListPinsOptions {
  limit?: number;
  offset?: number;
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new Pin
 *
 * @param db - Database instance
 * @param input - Pin data
 * @returns Created pin
 * @throws Error if pin already exists (unique constraint violation)
 */
export async function createPin(db: AnyDB, input: CreatePinInput): Promise<Pin> {
  const id = generatePinId();
  const now = new Date();

  const [row] = await db
    .insert(pins)
    .values({
      id,
      projectId: input.project_id,
      type: input.type,
      refId: input.ref_id,
      selectedAssertionIds: input.selected_assertion_ids ?? null,
      pinnedAt: now,
      pinnedBy: input.pinned_by ?? null,
    })
    .returning();

  return rowToPin(row);
}

/**
 * Find a Pin by ID
 */
export async function findPinById(db: AnyDB, id: string): Promise<Pin | null> {
  const [row] = await db.select().from(pins).where(eq(pins.id, id)).limit(1);

  return row ? rowToPin(row) : null;
}

/**
 * Find all Pins for a project
 *
 * Returns pins ordered by pinnedAt descending.
 */
export async function findPinsByProject(
  db: AnyDB,
  projectId: string,
  options: ListPinsOptions = {}
): Promise<Pin[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const rows = await db
    .select()
    .from(pins)
    .where(eq(pins.projectId, projectId))
    .orderBy(desc(pins.pinnedAt), pins.id)
    .limit(limit)
    .offset(offset);

  return rows.map(rowToPin);
}

/**
 * Find a Pin by project, type, and ref_id
 *
 * Used to check if an item is already pinned.
 */
export async function findPinByRef(
  db: AnyDB,
  projectId: string,
  type: PinType,
  refId: string
): Promise<Pin | null> {
  const [row] = await db
    .select()
    .from(pins)
    .where(and(eq(pins.projectId, projectId), eq(pins.type, type), eq(pins.refId, refId)))
    .limit(1);

  return row ? rowToPin(row) : null;
}

/**
 * Update selected assertion IDs for a pin
 *
 * Only applicable for leaf pins.
 *
 * @param db - Database instance
 * @param id - Pin ID
 * @param assertionIds - New assertion IDs (or undefined to clear)
 * @returns Updated pin or null if not found
 */
export async function updatePinAssertions(
  db: AnyDB,
  id: string,
  assertionIds: string[] | undefined
): Promise<Pin | null> {
  const [updated] = await db
    .update(pins)
    .set({ selectedAssertionIds: assertionIds ?? null })
    .where(eq(pins.id, id))
    .returning();

  return updated ? rowToPin(updated) : null;
}

/**
 * Delete a Pin by ID
 *
 * @returns true if deleted, false if not found
 */
export async function deletePin(db: AnyDB, id: string): Promise<boolean> {
  const result = await db.delete(pins).where(eq(pins.id, id)).returning();

  return result.length > 0;
}

/**
 * Delete a Pin by project, type, and ref_id
 *
 * Useful for "unpin" operations where you know the item but not the pin ID.
 *
 * @returns true if deleted, false if not found
 */
export async function deletePinByRef(
  db: AnyDB,
  projectId: string,
  type: PinType,
  refId: string
): Promise<boolean> {
  const result = await db
    .delete(pins)
    .where(and(eq(pins.projectId, projectId), eq(pins.type, type), eq(pins.refId, refId)))
    .returning();

  return result.length > 0;
}

/**
 * Get multiple Pins by IDs
 *
 * Batch query utility to avoid N+1 when fetching multiple pins.
 * Returns pins in the same order as the input IDs array.
 * Missing IDs are skipped (no nulls in result).
 */
export async function getPinsByIds(db: AnyDB, ids: string[]): Promise<Pin[]> {
  if (ids.length === 0) return [];

  const rows = await db.select().from(pins).where(inArray(pins.id, ids));

  // Create a map for O(1) lookup
  const pinMap = new Map<string, Pin>();
  for (const row of rows) {
    pinMap.set(row.id, rowToPin(row));
  }

  // Return in the original order of input IDs
  const result: Pin[] = [];
  for (const id of ids) {
    const pin = pinMap.get(id);
    if (pin) result.push(pin);
  }

  return result;
}

/**
 * Find Pins by type within a project
 *
 * Returns all pins of a specific type (conversation or leaf).
 */
export async function findPinsByType(
  db: AnyDB,
  projectId: string,
  type: PinType,
  options: ListPinsOptions = {}
): Promise<Pin[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const rows = await db
    .select()
    .from(pins)
    .where(and(eq(pins.projectId, projectId), eq(pins.type, type)))
    .orderBy(desc(pins.pinnedAt), pins.id)
    .limit(limit)
    .offset(offset);

  return rows.map(rowToPin);
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert database row to Pin type
 */
function rowToPin(row: PinRecord): Pin {
  return {
    id: row.id,
    project_id: row.projectId,
    type: row.type as PinType,
    ref_id: row.refId,
    selected_assertion_ids: row.selectedAssertionIds ?? undefined,
    pinned_at: row.pinnedAt.toISOString(),
    pinned_by: row.pinnedBy ?? undefined,
  };
}
