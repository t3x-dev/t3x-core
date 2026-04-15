/**
 * cleanupOldEvents — DELETE events older than retentionDays from the events outbox.
 *
 * The events table is an append-only outbox for cross-process realtime sync.
 * Each write produces a row; retention prevents unbounded growth. Default 7
 * days is enough for any realistic client reconnect window — clients that
 * disconnect for longer get an empty replay (correct behavior).
 *
 * Intended to be called periodically (e.g., hourly cron) from apps/api.
 */
import { sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';

export interface CleanupOptions {
  /** Days of history to retain (default: 7) */
  retentionDays?: number;
}

const DEFAULT_RETENTION_DAYS = 7;

/**
 * Delete events older than `retentionDays` days.
 * Returns the number of rows deleted.
 *
 * `retentionDays` is numeric and supplied by the caller (not user input); it is
 * safely inlined into the INTERVAL expression because Postgres cannot bind
 * INTERVAL literals as parameters.
 */
export async function cleanupOldEvents(
  db: AnyDB,
  options: CleanupOptions = {}
): Promise<number> {
  const days = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_RETENTION_DAYS;
  const result = await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
    sql`DELETE FROM events WHERE created_at < NOW() - (${sql.raw(String(safeDays))} || ' days')::interval`
  );
  const r = result as { count?: number; rowCount?: number };
  return (r.count ?? r.rowCount ?? 0) as number;
}
