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

/**
 * F6 — Best-effort coercion of a loose provider draft into the strict
 * ProviderExtractionDraft shape. Deterministic shape normalizer that handles
 * observed drift from Claude (sonnet + opus on longer fixtures):
 *
 * - schema: "ProviderExtractionDraft" / "ExtractionDraft" → "t3x/provider-extraction-draft"
 * - version: "1.0" | "1" | 1.0 → 1
 * - mode: default to "bootstrap" when missing or invalid
 * - items missing required fields (id/intent/confidence/reasoning_type/target_ref)
 *   get sensible defaults (add / 0.8 / direct / all-nulls)
 * - candidate.name → candidate.key (like F1, but at item level)
 * - item-level children_json → candidate.children_json (Claude often puts it
 *   at the item level rather than inside candidate)
 * - evidence is preserved verbatim; items without evidence get [] (will be
 *   rejected by Zod's min(1) — intentional, do not fabricate provenance)
 *
 * Non-ProviderExtractionDraft keys (type, label, kind, etc.) are dropped.
 * Returns the normalized object, which is still validated against
 * ProviderExtractionDraftSchema by the caller — this function only coerces.
 */
function coerceVersion(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw) || 1;
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return 1;
}

function coerceMode(raw: unknown): 'bootstrap' | 'incremental' {
  return raw === 'incremental' ? 'incremental' : 'bootstrap';
}

function coerceIntent(raw: unknown): 'add' | 'update' | 'remove' | 'reinforce' | 'noop' {
  if (
    raw === 'add' ||
    raw === 'update' ||
    raw === 'remove' ||
    raw === 'reinforce' ||
    raw === 'noop'
  ) {
    return raw;
  }
  return 'add';
}

function coerceReasoningType(raw: unknown): 'direct' | 'paraphrase' | 'cross_turn' | 'implicit' {
  if (raw === 'direct' || raw === 'paraphrase' || raw === 'cross_turn' || raw === 'implicit') {
    return raw;
  }
  return 'direct';
}

function pickStringOrNull(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function coerceTargetRef(raw: unknown): {
  node_key: string | null;
  path: string | null;
  existing_node_id: string | null;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { node_key: null, path: null, existing_node_id: null };
  }
  const input = raw as Record<string, unknown>;
  return {
    node_key: pickStringOrNull(input, ['node_key']),
    path: pickStringOrNull(input, ['path']),
    existing_node_id: pickStringOrNull(input, ['existing_node_id']),
  };
}

function coerceCandidate(
  rawCandidate: unknown,
  rawItem: Record<string, unknown>
): {
  key: string | null;
  path_hint: string | null;
  slot: string | null;
  value_json: string | null;
  values_json: string | null;
  children_json: string | null;
} {
  const input =
    rawCandidate && typeof rawCandidate === 'object' && !Array.isArray(rawCandidate)
      ? (rawCandidate as Record<string, unknown>)
      : {};
  // Pull children_json from item level as a fallback — Claude often puts it
  // there when drifting from the provider shape.
  const childrenFromItem = pickStringOrNull(rawItem, ['children_json']);
  return {
    key: pickStringOrNull(input, ['key', 'name']),
    path_hint: pickStringOrNull(input, ['path_hint']),
    slot: pickStringOrNull(input, ['slot']),
    value_json: pickStringOrNull(input, ['value_json']),
    values_json: pickStringOrNull(input, ['values_json']),
    children_json: pickStringOrNull(input, ['children_json']) ?? childrenFromItem,
  };
}

function coerceEvidenceEntry(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const input = raw as Record<string, unknown>;
  const role = input.role === 'primary' || input.role === 'supporting' ? input.role : 'primary';
  return {
    turn_tag: input.turn_tag,
    quote: input.quote,
    role,
  };
}

function coerceItem(raw: unknown, index: number): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const input = raw as Record<string, unknown>;

  const id = typeof input.id === 'string' && input.id.length > 0 ? input.id : `item_${index + 1}`;
  const confidence =
    typeof input.confidence === 'number' && input.confidence >= 0 && input.confidence <= 1
      ? input.confidence
      : 0.8;

  const rawEvidence = Array.isArray(input.evidence) ? input.evidence : [];
  return {
    id,
    intent: coerceIntent(input.intent),
    confidence,
    reasoning_type: coerceReasoningType(input.reasoning_type),
    target_ref: coerceTargetRef(input.target_ref),
    candidate: coerceCandidate(input.candidate, input),
    evidence: rawEvidence.map(coerceEvidenceEntry),
  };
}

export function normalizeLooseProviderDraft(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const input = raw as Record<string, unknown>;

  const items = Array.isArray(input.items) ? input.items : [];

  return {
    schema: PROVIDER_EXTRACTION_DRAFT_SCHEMA,
    version: coerceVersion(input.version),
    mode: coerceMode(input.mode),
    items: items.map((item, index) => coerceItem(item, index)),
    warnings: Array.isArray(input.warnings) ? input.warnings : [],
  };
}

export type LiftProviderDraftResult =
  | { ok: true; draft: ExtractionDraft }
  | { ok: false; failure: ExtractionFailure };

function repairMalformedJsonField(fieldName: string, raw: string): unknown | undefined {
  // Deterministic repair for fields where small models commonly emit a plain
  // scalar instead of a JSON-encoded string (e.g. `abc/def` instead of `"abc/def"`).
  // Only attempts repair for candidate.value_json, which accepts any scalar.
  // Object- and array-shaped fields (values_json, children_json) are not
  // repaired here — their shape contract is too strict to guess safely.
  if (fieldName !== 'candidate.value_json') return undefined;

  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;

  // If it looks like an attempted JSON object/array/string, don't guess — the
  // LLM tried to emit structured JSON and got it wrong; safer to fail and reask.
  const firstChar = trimmed[0];
  if (firstChar === '{' || firstChar === '[' || firstChar === '"') return undefined;

  // Plain scalar text that wasn't JSON-escaped — treat as a string literal.
  return raw;
}

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
    const repaired = repairMalformedJsonField(fieldName, raw);
    if (repaired !== undefined) {
      return { ok: true, value: repaired };
    }
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

function canonicalizeChildShape(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((child) => {
    // Wrap raw string children as { key: <string> }. Observed on Claude when
    // it emits children_json as ["a","b",…] instead of [{"key":"a"},…].
    if (typeof child === 'string' && child.length > 0) {
      return { key: child };
    }
    if (!child || typeof child !== 'object' || Array.isArray(child)) return child;
    const input = child as Record<string, unknown>;

    const keyCandidate =
      typeof input.key === 'string' && input.key.length > 0
        ? input.key
        : typeof input.name === 'string' && input.name.length > 0
          ? input.name
          : undefined;

    const existingValues =
      input.values && typeof input.values === 'object' && !Array.isArray(input.values)
        ? (input.values as Record<string, unknown>)
        : undefined;

    const folded: Record<string, unknown> = { ...(existingValues ?? {}) };
    for (const [k, v] of Object.entries(input)) {
      if (k === 'key' || k === 'name' || k === 'values' || k === 'children') continue;
      if (!(k in folded)) folded[k] = v;
    }

    const out: Record<string, unknown> = {};
    if (keyCandidate !== undefined) {
      out.key = keyCandidate;
    } else {
      // F11: synthesize a key from the first short string field when neither
      // key nor name are present. Observed on openai structured output when
      // emitting children_json as [{title: "x", …}] with no key.
      const firstStringValue = Object.values(folded).find(
        (v): v is string => typeof v === 'string' && v.length > 0 && v.length < 80
      );
      if (firstStringValue) {
        out.key = firstStringValue;
      }
    }
    if (Object.keys(folded).length > 0) out.values = folded;
    return out;
  });
}

function normalizeParsedJsonField(fieldName: string, value: unknown): unknown {
  if (fieldName === 'candidate.children_json') {
    const arrayed = value && typeof value === 'object' && !Array.isArray(value) ? [value] : value;
    return canonicalizeChildShape(arrayed);
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

    // F11: when the model put an array (or scalar) inside values_json — the
    // canonical ExtractionDraftSchema requires `values` to be a record — promote
    // that payload into the `value` slot (which accepts any YValue) so the
    // canonical shape validates. Observed on every Claude model and gemini
    // flash when they conflated the two _json fields after F9 dropped the
    // "use value_json for arrays" prompt rule.
    let liftedValue = normalizeParsedJsonField('candidate.value_json', parsedValue.value);
    let liftedValues = normalizeParsedJsonField('candidate.values_json', parsedValues.value);
    const valuesIsRecord =
      liftedValues !== undefined &&
      liftedValues !== null &&
      typeof liftedValues === 'object' &&
      !Array.isArray(liftedValues);
    if (liftedValues !== undefined && liftedValues !== null && !valuesIsRecord) {
      if (liftedValue === undefined || liftedValue === null) {
        liftedValue = liftedValues;
      }
      liftedValues = undefined;
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
        value: liftedValue,
        values: liftedValues,
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
