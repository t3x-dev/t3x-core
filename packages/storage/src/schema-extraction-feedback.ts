/**
 * Extraction Feedback Schema (Anchoring L4)
 *
 * Persists user actions (accept/reject/edit/undo) on extraction proposals.
 * Used for adaptive threshold calibration and extraction quality analysis.
 *
 * @see docs/llm-extraction-anchoring-assessment.md (Layer 4: User Feedback)
 */

import { index, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';
import { projects } from './schema';

export const extractionFeedback = pgTable(
  'extraction_feedback',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    draftId: text('draft_id').notNull(),
    spId: text('sp_id').notNull(),
    action: text('action').notNull(), // accept | reject | edit | undo
    inferenceType: text('inference_type'), // direct | paraphrase | inference
    confidence: real('confidence'),
    zone: text('zone'), // ready | review
    editedText: text('edited_text'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_extraction_feedback_project').on(table.projectId),
    index('idx_extraction_feedback_draft').on(table.draftId),
  ],
);
