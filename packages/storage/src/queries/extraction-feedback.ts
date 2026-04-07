/**
 * Extraction Feedback Queries (Anchoring L4)
 *
 * CRUD operations for user feedback on extraction proposals.
 * Tracks accept/reject/edit/undo per SemanticPoint for adaptive calibration.
 */

import { and, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { extractionFeedback } from '../schema-extraction-feedback';

export interface InsertExtractionFeedbackInput {
  id: string;
  project_id: string;
  draft_id: string;
  sp_id: string;
  action: 'accept' | 'reject' | 'edit' | 'undo';
  original_text?: string;
  inference_type?: string;
  zone?: string;
  low_coverage?: boolean;
  edited_text?: string;
}

export async function insertExtractionFeedback(
  db: AnyDB,
  input: InsertExtractionFeedbackInput
): Promise<void> {
  await db.insert(extractionFeedback).values({
    id: input.id,
    projectId: input.project_id,
    draftId: input.draft_id,
    spId: input.sp_id,
    action: input.action,
    originalText: input.original_text,
    inferenceType: input.inference_type,
    zone: input.zone,
    lowCoverage: input.low_coverage,
    editedText: input.edited_text,
  });
}

export interface ExtractionFeedbackStats {
  total: number;
  by_action: Record<string, number>;
  by_inference_type: Record<string, Record<string, number>>;
}

export async function getExtractionFeedbackStats(
  db: AnyDB,
  projectId: string
): Promise<ExtractionFeedbackStats> {
  const rows = await db
    .select()
    .from(extractionFeedback)
    .where(eq(extractionFeedback.projectId, projectId));

  const byAction: Record<string, number> = {};
  const byType: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    byAction[row.action] = (byAction[row.action] ?? 0) + 1;

    const t = row.inferenceType ?? 'unknown';
    if (!byType[t]) byType[t] = {};
    byType[t][row.action] = (byType[t][row.action] ?? 0) + 1;
  }

  return { total: rows.length, by_action: byAction, by_inference_type: byType };
}

/**
 * Aggregate feedback stats formatted for the adaptive learning API response.
 *
 * Returns per-inference-type totals (accepted, edited, rejected) and overall rates.
 */
export interface AdaptiveFeedbackStats {
  byInferenceType: Record<
    string,
    { total: number; accepted: number; edited: number; rejected: number }
  >;
  overall: {
    total: number;
    acceptRate: number;
    editRate: number;
    rejectRate: number;
  };
}

export async function getAdaptiveFeedbackStats(
  db: AnyDB,
  projectId: string
): Promise<AdaptiveFeedbackStats> {
  const rows = await db
    .select()
    .from(extractionFeedback)
    .where(eq(extractionFeedback.projectId, projectId));

  const byType: Record<
    string,
    { total: number; accepted: number; edited: number; rejected: number }
  > = {};

  let totalAccepted = 0;
  let totalEdited = 0;
  let totalRejected = 0;

  for (const row of rows) {
    const t = row.inferenceType ?? 'unknown';
    if (!byType[t]) byType[t] = { total: 0, accepted: 0, edited: 0, rejected: 0 };
    byType[t].total += 1;

    // Map actions: accept/undo→accepted, edit→edited, reject/dismiss→rejected
    if (row.action === 'accept') {
      byType[t].accepted += 1;
      totalAccepted += 1;
    } else if (row.action === 'edit') {
      byType[t].edited += 1;
      totalEdited += 1;
    } else if (row.action === 'reject') {
      byType[t].rejected += 1;
      totalRejected += 1;
    }
    // 'undo' is excluded from rate calculations (it's a retraction, not a judgment)
  }

  const total = totalAccepted + totalEdited + totalRejected;
  return {
    byInferenceType: byType,
    overall: {
      total,
      acceptRate: total > 0 ? totalAccepted / total : 0,
      editRate: total > 0 ? totalEdited / total : 0,
      rejectRate: total > 0 ? totalRejected / total : 0,
    },
  };
}


export async function listExtractionFeedback(
  db: AnyDB,
  projectId: string,
  options?: { draftId?: string; limit?: number }
) {
  let query = db
    .select()
    .from(extractionFeedback)
    .where(eq(extractionFeedback.projectId, projectId))
    .orderBy(extractionFeedback.createdAt);

  if (options?.draftId) {
    query = db
      .select()
      .from(extractionFeedback)
      .where(
        and(
          eq(extractionFeedback.projectId, projectId),
          eq(extractionFeedback.draftId, options.draftId)
        )
      )
      .orderBy(extractionFeedback.createdAt);
  }

  if (options?.limit) {
    return query.limit(options.limit);
  }

  return query;
}
