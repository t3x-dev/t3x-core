/**
 * Webhook Queries
 *
 * CRUD operations for webhooks table using Drizzle ORM.
 * Webhooks subscribe to T3X events and receive POST callbacks.
 *
 * @see packages/storage/src/schema-v4.ts – webhooks table
 */

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type WebhookRecord, webhooks } from '../schema-v4';

// ============================================================
// Constants
// ============================================================

const ID_PREFIX = 'wh_';
const ID_RANDOM_LENGTH = 12;

// ============================================================
// Types
// ============================================================

export interface WebhookOutput {
  webhook_id: string;
  project_id: string | null;
  url: string;
  events: string[];
  secret: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookInput {
  url: string;
  events: string[];
  secret?: string;
  projectId?: string;
}

export interface UpdateWebhookInput {
  url?: string;
  events?: string[];
  secret?: string;
  active?: boolean;
}

// ============================================================
// Internal Helpers
// ============================================================

function generateWebhookId(): string {
  return `${ID_PREFIX}${randomUUID().replace(/-/g, '').slice(0, ID_RANDOM_LENGTH)}`;
}

function rowToWebhook(row: WebhookRecord): WebhookOutput {
  return {
    webhook_id: row.webhookId,
    project_id: row.projectId ?? null,
    url: row.url,
    events: row.events as string[],
    secret: row.secret ?? null,
    active: row.active === 'true',
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new webhook subscription.
 */
export async function createWebhook(db: AnyDB, input: CreateWebhookInput): Promise<WebhookOutput> {
  const id = generateWebhookId();
  const now = new Date();

  const [row] = await db
    .insert(webhooks)
    .values({
      webhookId: id,
      projectId: input.projectId ?? null,
      url: input.url,
      events: input.events,
      secret: input.secret ?? null,
      active: 'true',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return rowToWebhook(row);
}

/**
 * List webhooks, optionally filtered by project.
 */
export async function listWebhooks(
  db: AnyDB,
  options: { projectId?: string } = {}
): Promise<WebhookOutput[]> {
  const conditions = [];

  if (options.projectId) {
    conditions.push(eq(webhooks.projectId, options.projectId));
  }

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(webhooks)
          .where(and(...conditions))
      : await db.select().from(webhooks);

  return rows.map(rowToWebhook);
}

/**
 * Find a webhook by ID.
 */
export async function findWebhookById(db: AnyDB, id: string): Promise<WebhookOutput | null> {
  const [row] = await db.select().from(webhooks).where(eq(webhooks.webhookId, id)).limit(1);

  return row ? rowToWebhook(row) : null;
}

/**
 * Update a webhook.
 */
export async function updateWebhook(
  db: AnyDB,
  id: string,
  input: UpdateWebhookInput
): Promise<WebhookOutput | null> {
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (input.url !== undefined) updates.url = input.url;
  if (input.events !== undefined) updates.events = input.events;
  if (input.secret !== undefined) updates.secret = input.secret;
  if (input.active !== undefined) updates.active = input.active ? 'true' : 'false';

  const [row] = await db
    .update(webhooks)
    .set(updates)
    .where(eq(webhooks.webhookId, id))
    .returning();

  return row ? rowToWebhook(row) : null;
}

/**
 * Delete a webhook.
 */
export async function deleteWebhook(db: AnyDB, id: string): Promise<boolean> {
  const [row] = await db.delete(webhooks).where(eq(webhooks.webhookId, id)).returning();
  return !!row;
}

/**
 * Find active webhooks matching a specific event, optionally filtered by project.
 */
export async function findWebhooksByEvent(
  db: AnyDB,
  event: string,
  projectId?: string
): Promise<WebhookOutput[]> {
  // Get all active webhooks first, then filter by event in JS
  // (JSONB containment is simpler this way for PGLite compatibility)
  const conditions = [eq(webhooks.active, 'true')];

  const rows = await db
    .select()
    .from(webhooks)
    .where(and(...conditions));

  return rows
    .filter((row) => {
      const events = row.events as string[];
      if (!events.includes(event) && !events.includes('*')) return false;
      // If webhook is project-scoped, only match when projectId matches exactly
      if (row.projectId && row.projectId !== projectId) return false;
      return true;
    })
    .map(rowToWebhook);
}
