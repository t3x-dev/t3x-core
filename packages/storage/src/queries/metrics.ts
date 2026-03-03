/**
 * Metrics Event Queries
 *
 * CRUD operations for metrics_events table using Drizzle ORM.
 * Tracks observable metric events (suggestion_coverage, confirmation, etc.)
 * for the S17 Observable Metrics feature.
 */

import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import type { AnyDB } from '../adapters';
import { metricsEvents } from '../schema-metrics';

// ============================================================
// Types
// ============================================================

export interface RecordMetricInput {
  project_id: string;
  event_type: string;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface MetricsEventOutput {
  id: string;
  project_id: string;
  event_type: string;
  value: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface MetricsSummaryRow {
  event_type: string;
  count: number;
  avg_value: number;
  min_value: number;
  max_value: number;
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Record a new metric event
 *
 * @param db - Database instance
 * @param input - Metric data
 * @returns Created metric event
 */
export async function recordMetric(
  db: AnyDB,
  input: RecordMetricInput
): Promise<MetricsEventOutput> {
  const id = `me_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

  const [row] = await db
    .insert(metricsEvents)
    .values({
      id,
      projectId: input.project_id,
      eventType: input.event_type,
      value: input.value,
      metadata: input.metadata ?? null,
    })
    .returning();

  return rowToOutput(row);
}

/**
 * Get metrics for a project, newest first
 *
 * @param db - Database instance
 * @param projectId - Project ID to filter by
 * @param options - Optional filters: event_type, limit
 * @returns Array of metric events
 */
export async function getMetricsByProject(
  db: AnyDB,
  projectId: string,
  options?: { event_type?: string; limit?: number }
): Promise<MetricsEventOutput[]> {
  const conditions = [eq(metricsEvents.projectId, projectId)];

  if (options?.event_type) {
    conditions.push(eq(metricsEvents.eventType, options.event_type));
  }

  const limit = options?.limit ?? 100;

  const rows = await db
    .select()
    .from(metricsEvents)
    .where(and(...conditions))
    .orderBy(desc(metricsEvents.createdAt))
    .limit(limit);

  return rows.map(rowToOutput);
}

/**
 * Get per-event-type aggregates for a project
 *
 * @param db - Database instance
 * @param projectId - Project ID to aggregate
 * @returns Array of summary rows with count, avg, min, max per event type
 */
export async function getMetricsSummary(
  db: AnyDB,
  projectId: string
): Promise<MetricsSummaryRow[]> {
  const results = await db
    .select({
      eventType: metricsEvents.eventType,
      count: sql<number>`count(*)::int`,
      avgValue: sql<number>`avg(${metricsEvents.value})`,
      minValue: sql<number>`min(${metricsEvents.value})`,
      maxValue: sql<number>`max(${metricsEvents.value})`,
    })
    .from(metricsEvents)
    .where(eq(metricsEvents.projectId, projectId))
    .groupBy(metricsEvents.eventType);

  return results.map((r) => ({
    event_type: r.eventType,
    count: r.count,
    avg_value: Number(r.avgValue),
    min_value: Number(r.minValue),
    max_value: Number(r.maxValue),
  }));
}

/**
 * Get metrics within a date range for a project
 *
 * @param db - Database instance
 * @param projectId - Project ID to filter by
 * @param start - Start of time range (inclusive)
 * @param end - End of time range (inclusive)
 * @returns Array of metric events within the range, newest first
 */
export async function getMetricsInTimeRange(
  db: AnyDB,
  projectId: string,
  start: Date,
  end: Date
): Promise<MetricsEventOutput[]> {
  const rows = await db
    .select()
    .from(metricsEvents)
    .where(
      and(
        eq(metricsEvents.projectId, projectId),
        gte(metricsEvents.createdAt, start),
        lte(metricsEvents.createdAt, end)
      )
    )
    .orderBy(desc(metricsEvents.createdAt));

  return rows.map(rowToOutput);
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert database row to output type
 */
function rowToOutput(row: typeof metricsEvents.$inferSelect): MetricsEventOutput {
  return {
    id: row.id,
    project_id: row.projectId,
    event_type: row.eventType,
    value: row.value,
    metadata: row.metadata ?? null,
    created_at: row.createdAt.toISOString(),
  };
}
