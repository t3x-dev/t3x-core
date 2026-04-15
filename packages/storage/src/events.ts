/**
 * recordEvent — the ONLY application-level way to emit realtime events.
 *
 * Simple CRUD events (commit.created, draft.changed, yops.applied,
 * conversation.renamed) are emitted automatically by database triggers —
 * callers don't invoke recordEvent for those.
 *
 * Complex business events with semantic payload (extraction.started/done)
 * MUST be emitted via this helper from the code path that understands
 * the business context.
 *
 * Do not add new event types without updating ALLOWED_EVENT_TYPES and
 * passing a PR review.
 */
import type { AnyDB } from './adapters';
import { events } from './schema-events';

export const ALLOWED_EVENT_TYPES = [
  'commit.created',
  'draft.changed',
  'yops.applied',
  'conversation.renamed',
  'extraction.started',
  'extraction.done',
] as const;

export type EventType = (typeof ALLOWED_EVENT_TYPES)[number];

export interface RecordEventInput {
  type: EventType;
  projectId: string;
  conversationId?: string | null;
  payload?: Record<string, unknown> | null;
}

export async function recordEvent(db: AnyDB, input: RecordEventInput): Promise<bigint> {
  const [row] = await db
    .insert(events)
    .values({
      type: input.type,
      projectId: input.projectId,
      conversationId: input.conversationId ?? null,
      payload: input.payload ?? null,
    })
    .returning({ id: events.id });
  return row.id as bigint;
}
