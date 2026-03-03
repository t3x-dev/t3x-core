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
  inference_type?: string;
  confidence?: number;
  zone?: string;
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
    inferenceType: input.inference_type,
    confidence: input.confidence,
    zone: input.zone,
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
