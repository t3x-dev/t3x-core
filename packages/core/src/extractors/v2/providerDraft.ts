import { z } from 'zod';
import { createExtractionFailure, type ExtractionFailure } from './failures';
import { type ExtractionDraft, ExtractionDraftSchema, ExtractionModeSchema } from './types';

export const PROVIDER_EXTRACTION_DRAFT_SCHEMA = 't3x/provider-extraction-draft' as const;

const ProviderNullableStringSchema = z.string().min(1).nullable();

export const ProviderDraftTargetRefSchema = z
  .object({
    node_key: ProviderNullableStringSchema,
    path: ProviderNullableStringSchema,
    existing_node_id: ProviderNullableStringSchema,
  })
  .strict();

export const ProviderDraftCandidateSchema = z
  .object({
    key: ProviderNullableStringSchema,
    path_hint: ProviderNullableStringSchema,
    slot: ProviderNullableStringSchema,
    value_json: ProviderNullableStringSchema,
    values_json: ProviderNullableStringSchema,
    children_json: ProviderNullableStringSchema,
  })
  .strict();

export const ProviderDraftEvidenceSchema = z
  .object({
    turn_tag: z.string().regex(/^T[1-9]\d*$/),
    quote: z.string().min(1),
    role: z.enum(['primary', 'supporting']),
  })
  .strict();

export const ProviderExtractionDraftItemSchema = z
  .object({
    id: z.string().min(1),
    intent: z.enum(['add', 'update', 'remove', 'reinforce', 'noop']),
    confidence: z.number().min(0).max(1),
    reasoning_type: z.enum(['direct', 'paraphrase', 'cross_turn', 'implicit']),
    target_ref: ProviderDraftTargetRefSchema,
    candidate: ProviderDraftCandidateSchema,
    evidence: z.array(ProviderDraftEvidenceSchema).min(1),
  })
  .strict();

export const ProviderExtractionDraftSchema = z
  .object({
    schema: z.literal(PROVIDER_EXTRACTION_DRAFT_SCHEMA),
    version: z.number().int().min(1).max(1),
    mode: ExtractionModeSchema,
    items: z.array(ProviderExtractionDraftItemSchema),
    warnings: z.array(z.string()),
  })
  .strict();

export type ProviderExtractionDraft = z.infer<typeof ProviderExtractionDraftSchema>;

export type LiftProviderDraftResult =
  | { ok: true; draft: ExtractionDraft }
  | { ok: false; failure: ExtractionFailure };

function parseJsonField(
  fieldName: string,
  raw: string | null
): { ok: true; value: unknown } | { ok: false; failure: ExtractionFailure } {
  if (raw === null) {
    return { ok: true, value: undefined };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return {
      ok: false,
      failure: createExtractionFailure(
        'draft_parse',
        `Provider field ${fieldName} is not valid JSON`,
        {
          details: { field: fieldName, raw },
        }
      ),
    };
  }
}

function normalizeParsedJsonField(fieldName: string, value: unknown): unknown {
  if (
    fieldName === 'candidate.children_json' &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return [value];
  }

  return value;
}

function omitNullish<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null && value !== undefined)
  ) as Partial<T>;
}

export function liftProviderDraftToExtractionDraft(
  input: ProviderExtractionDraft
): LiftProviderDraftResult {
  const items: unknown[] = [];

  for (const item of input.items) {
    const parsedValue = parseJsonField('candidate.value_json', item.candidate.value_json);
    if (!parsedValue.ok) {
      return parsedValue;
    }

    const parsedValues = parseJsonField('candidate.values_json', item.candidate.values_json);
    if (!parsedValues.ok) {
      return parsedValues;
    }

    const parsedChildren = parseJsonField('candidate.children_json', item.candidate.children_json);
    if (!parsedChildren.ok) {
      return parsedChildren;
    }

    items.push({
      id: item.id,
      intent: item.intent,
      confidence: item.confidence,
      reasoning_type: item.reasoning_type,
      target_ref: (() => {
        const targetRef = omitNullish(item.target_ref);
        return Object.keys(targetRef).length > 0 ? targetRef : undefined;
      })(),
      candidate: omitNullish({
        key: item.candidate.key,
        path_hint: item.candidate.path_hint,
        slot: item.candidate.slot,
        value: normalizeParsedJsonField('candidate.value_json', parsedValue.value),
        values: normalizeParsedJsonField('candidate.values_json', parsedValues.value),
        children: normalizeParsedJsonField('candidate.children_json', parsedChildren.value),
      }),
      evidence: item.evidence,
    });
  }

  const candidateDraft = {
    schema: 't3x/extraction-draft',
    version: 1,
    mode: input.mode,
    items,
    ...(input.warnings.length > 0 ? { warnings: input.warnings } : {}),
  };

  const validated = ExtractionDraftSchema.safeParse(candidateDraft);
  if (!validated.success) {
    return {
      ok: false,
      failure: createExtractionFailure(
        'draft_schema',
        validated.error.issues.map((issue) => issue.message).join('; '),
        { details: { issues: validated.error.issues } }
      ),
    };
  }

  return { ok: true, draft: validated.data };
}
