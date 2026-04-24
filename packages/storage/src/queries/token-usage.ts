/**
 * Token Usage Queries
 *
 * CRUD and aggregation operations for token_usage table.
 * Tracks per-call LLM token consumption for metering and cost estimation.
 */

import { randomUUID } from 'node:crypto';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { tokenUsage } from '../schema-trees';

// ============================================================
// Constants
// ============================================================

const ID_PREFIX = 'tu_';
const ID_RANDOM_LENGTH = 12;

// ============================================================
// Types
// ============================================================

export interface RecordUsageInput {
  user_id?: string;
  project_id: string;
  endpoint: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost?: number;
}

export interface UsageSummaryRow {
  period: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

export interface UsageTotal {
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

export interface UsageSummaryOptions {
  user_id: string;
  from: Date;
  to: Date;
  group_by: 'day' | 'week' | 'month';
}

export interface UsageTotalOptions {
  user_id: string;
  from: Date;
  to: Date;
}

export interface TokenUsageOutput {
  id: string;
  user_id: string | null;
  project_id: string;
  endpoint: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  created_at: string;
}

// ============================================================
// Model Pricing (USD per token)
// ============================================================

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5-20250514': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-sonnet-4-5': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-haiku-3-5': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
  'claude-haiku-3-5-20241022': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
  'claude-opus-4-5': { input: 10 / 1_000_000, output: 50 / 1_000_000 },
  'claude-opus-4-5-20250520': { input: 10 / 1_000_000, output: 50 / 1_000_000 },
  'claude-sonnet-4-20250514': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'gpt-4o': { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  'gpt-4-turbo': { input: 10 / 1_000_000, output: 30 / 1_000_000 },
  o1: { input: 15 / 1_000_000, output: 60 / 1_000_000 },
  'o1-mini': { input: 3 / 1_000_000, output: 12 / 1_000_000 },
  'gemini-2.0-flash': { input: 0.1 / 1_000_000, output: 0.4 / 1_000_000 },
  'gemini-2.5-flash': { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  'gemini-1.5-pro': { input: 1.25 / 1_000_000, output: 5 / 1_000_000 },
};

const FALLBACK_PRICING = { input: 3 / 1_000_000, output: 15 / 1_000_000 };

// ============================================================
// Internal Helpers
// ============================================================

function generateTokenUsageId(): string {
  return `${ID_PREFIX}${randomUUID().replace(/-/g, '').slice(0, ID_RANDOM_LENGTH)}`;
}

function rowToOutput(row: typeof tokenUsage.$inferSelect): TokenUsageOutput {
  return {
    id: row.id,
    user_id: row.userId,
    project_id: row.projectId,
    endpoint: row.endpoint,
    model: row.model,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    estimated_cost: Number(row.estimatedCost ?? 0),
    created_at: row.createdAt.toISOString(),
  };
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Record a single LLM token usage event.
 */
export async function recordUsage(db: AnyDB, input: RecordUsageInput): Promise<TokenUsageOutput> {
  const id = generateTokenUsageId();
  const cost =
    input.estimated_cost ?? estimateCost(input.model, input.input_tokens, input.output_tokens);

  const [row] = await db
    .insert(tokenUsage)
    .values({
      id,
      userId: input.user_id ?? null,
      projectId: input.project_id,
      endpoint: input.endpoint,
      model: input.model,
      inputTokens: input.input_tokens,
      outputTokens: input.output_tokens,
      estimatedCost: String(cost),
      createdAt: new Date(),
    })
    .returning();

  return rowToOutput(row);
}

/**
 * Get usage summary grouped by time period.
 *
 * Returns aggregated token counts and costs per period.
 */
export async function getUsageSummary(
  db: AnyDB,
  options: UsageSummaryOptions
): Promise<UsageSummaryRow[]> {
  const { user_id, from, to, group_by } = options;

  // date_trunc's first arg must be a literal, not a parameter binding
  const truncExpr =
    group_by === 'day'
      ? sql`date_trunc('day', ${tokenUsage.createdAt})`
      : group_by === 'week'
        ? sql`date_trunc('week', ${tokenUsage.createdAt})`
        : sql`date_trunc('month', ${tokenUsage.createdAt})`;

  const results = await db
    .select({
      period: truncExpr,
      inputTokens: sql<number>`coalesce(sum(${tokenUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${tokenUsage.outputTokens}), 0)::int`,
      estimatedCost: sql<string>`coalesce(sum(${tokenUsage.estimatedCost}), 0)`,
    })
    .from(tokenUsage)
    .where(
      and(
        eq(tokenUsage.userId, user_id),
        gte(tokenUsage.createdAt, from),
        lte(tokenUsage.createdAt, to)
      )
    )
    .groupBy(truncExpr)
    .orderBy(truncExpr);

  return results.map((r) => ({
    period: r.period instanceof Date ? r.period.toISOString() : String(r.period),
    input_tokens: Number(r.inputTokens),
    output_tokens: Number(r.outputTokens),
    estimated_cost: Number(r.estimatedCost),
  }));
}

/**
 * Get total usage aggregation for a user within a time range.
 */
export async function getUsageTotal(db: AnyDB, options: UsageTotalOptions): Promise<UsageTotal> {
  const { user_id, from, to } = options;

  const [result] = await db
    .select({
      inputTokens: sql<number>`coalesce(sum(${tokenUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${tokenUsage.outputTokens}), 0)::int`,
      estimatedCost: sql<string>`coalesce(sum(${tokenUsage.estimatedCost}), 0)`,
    })
    .from(tokenUsage)
    .where(
      and(
        eq(tokenUsage.userId, user_id),
        gte(tokenUsage.createdAt, from),
        lte(tokenUsage.createdAt, to)
      )
    );

  return {
    input_tokens: Number(result?.inputTokens ?? 0),
    output_tokens: Number(result?.outputTokens ?? 0),
    estimated_cost: Number(result?.estimatedCost ?? 0),
  };
}

export interface UsageByEndpointRow {
  endpoint: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

/**
 * Get usage aggregated by endpoint for a user within a time range.
 */
export async function getUsageByEndpoint(
  db: AnyDB,
  options: UsageTotalOptions
): Promise<UsageByEndpointRow[]> {
  const { user_id, from, to } = options;

  const results = await db
    .select({
      endpoint: tokenUsage.endpoint,
      inputTokens: sql<number>`coalesce(sum(${tokenUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${tokenUsage.outputTokens}), 0)::int`,
      estimatedCost: sql<string>`coalesce(sum(${tokenUsage.estimatedCost}), 0)`,
    })
    .from(tokenUsage)
    .where(
      and(
        eq(tokenUsage.userId, user_id),
        gte(tokenUsage.createdAt, from),
        lte(tokenUsage.createdAt, to)
      )
    )
    .groupBy(tokenUsage.endpoint)
    .orderBy(sql`coalesce(sum(${tokenUsage.estimatedCost}), 0) desc`);

  return results.map((r) => ({
    endpoint: r.endpoint,
    input_tokens: Number(r.inputTokens),
    output_tokens: Number(r.outputTokens),
    estimated_cost: Number(r.estimatedCost),
  }));
}

/**
 * Estimate cost for a given model and token counts.
 *
 * Pure function — no DB access. Uses a built-in pricing table
 * with fallback for unknown models.
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  if (inputTokens < 0 || outputTokens < 0) {
    console.warn(
      `[estimateCost] Negative token count: input=${inputTokens}, output=${outputTokens}`
    );
    inputTokens = Math.max(0, inputTokens);
    outputTokens = Math.max(0, outputTokens);
  }
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    console.warn(
      `[estimateCost] Unknown model "${model}", using fallback pricing ($3/$15 per MTok)`
    );
  }
  return (
    inputTokens * (pricing ?? FALLBACK_PRICING).input +
    outputTokens * (pricing ?? FALLBACK_PRICING).output
  );
}
