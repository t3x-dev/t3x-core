import { z } from 'zod';
import type { SourcedYOp, YValue } from '../../t3x-yops/types';

export const EXTRACTION_DRAFT_SCHEMA = 't3x/extraction-draft' as const;
export const EXTRACTION_MODES = ['bootstrap', 'incremental'] as const;

export const TurnTagSchema = z.string().regex(/^T[1-9]\d*$/);
export const ExtractionModeSchema = z.enum(EXTRACTION_MODES);
export const DraftIntentSchema = z.enum(['add', 'update', 'remove', 'reinforce', 'noop']);
export const ReasoningTypeSchema = z.enum(['direct', 'paraphrase', 'cross_turn', 'implicit']);
export const EvidenceRoleSchema = z.enum(['primary', 'supporting']);

const DraftTargetRefSchema = z
  .object({
    node_key: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    existing_node_id: z.string().min(1).optional(),
  })
  .strict();

const DraftCandidateChildSchema = z
  .object({
    key: z.string().min(1),
    values: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const DraftValueSchema: z.ZodType<YValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(DraftValueSchema),
    z.record(z.string(), DraftValueSchema),
  ])
);

const DraftCandidateSchema = z
  .object({
    key: z.string().min(1).optional(),
    path_hint: z.string().min(1).optional(),
    slot: z.string().min(1).optional(),
    value: DraftValueSchema.optional(),
    values: z.record(z.string(), DraftValueSchema).optional(),
    children: z.array(DraftCandidateChildSchema).optional(),
  })
  .strict();

export const DraftEvidenceSchema = z
  .object({
    turn_tag: TurnTagSchema,
    quote: z.string().min(1),
    role: EvidenceRoleSchema,
  })
  .strict();

export const ExtractionDraftItemSchema = z
  .object({
    id: z.string().min(1),
    intent: DraftIntentSchema,
    confidence: z.number().min(0).max(1),
    reasoning_type: ReasoningTypeSchema,
    target_ref: DraftTargetRefSchema.optional(),
    candidate: DraftCandidateSchema,
    evidence: z.array(DraftEvidenceSchema).min(1),
  })
  .strict();

export const ExtractionDraftSchema = z
  .object({
    schema: z.literal(EXTRACTION_DRAFT_SCHEMA),
    version: z.literal(1),
    mode: ExtractionModeSchema,
    items: z.array(ExtractionDraftItemSchema),
    warnings: z.array(z.string()).optional(),
  })
  .strict();

export type ExtractionMode = z.infer<typeof ExtractionModeSchema>;
export type DraftIntent = z.infer<typeof DraftIntentSchema>;
export type ReasoningType = z.infer<typeof ReasoningTypeSchema>;
export type DraftEvidence = z.infer<typeof DraftEvidenceSchema>;
export type ExtractionDraftItem = z.infer<typeof ExtractionDraftItemSchema>;
export type ExtractionDraft = z.infer<typeof ExtractionDraftSchema>;

export interface CompileInput {
  draft: ExtractionDraft;
  sourceModel: string;
  extractedAt: string;
  turnHashByTag: Record<string, string>;
  /**
   * Resilience escape hatch. When `true`, `compileExtractionDraft` does not
   * fail-fast on the first malformed item: it drops that item, appends a
   * warning naming the dropped item id + the underlying failure message,
   * and keeps compiling the rest. Returns `{ ok: true, ops, warnings }`
   * with whatever survived (empty `ops` is allowed; the caller decides
   * whether an empty partial is acceptable).
   *
   * Default `false` preserves the strict per-item contract every existing
   * caller (golden tests, the strict pipeline path) relies on. Only the
   * pipeline's post-reask salvage path opts in.
   */
  allowPartial?: boolean;
}

export interface CompiledMutationPlan {
  ops: SourcedYOp[];
  warnings: string[];
}
