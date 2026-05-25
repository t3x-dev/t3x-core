import type { LLMPrompt, LLMProvider } from '../../llm/types';
import { tryParseWithRepair } from '../../providers/llm/jsonRepair';
import { serializeForPrompt } from '../../semantic/serialize';
import type { SemanticContent } from '../../semantic/types';
import {
  type FailingOp,
  normalizeOpTurnHashes,
  repairOpQuotes,
  type ValidationTurn,
  validateSource,
} from '../../t3x-yops/sourceValidator';
import type { SourcedYOp } from '../../t3x-yops/types';
import {
  type ExtractionStyleConfig,
  matchPreset,
  PRESETS,
  type PresetName,
  styleSummaryLine,
} from '../extractionStyleConfig';
import { compileExtractionDraft } from './compiler';
import { createExtractionFailure, type ExtractionFailure } from './failures';
import { buildPromptTurnMap, normalizeExtractionText, type PromptTurnInput } from './normalization';
import { mapProviderErrorToExtractionFailure } from './providerAdapters';
import {
  liftProviderDraftToExtractionDraft,
  normalizeLooseProviderDraft,
  ProviderExtractionDraftSchema,
} from './providerDraft';
import type { CompiledMutationPlan, ExtractionDraft, ExtractionMode } from './types';

export interface ExtractionV2PipelineInput {
  turns: PromptTurnInput[];
  mode: ExtractionMode;
  providerId: string;
  provider: Pick<LLMProvider, 'generate' | 'generateFromPrompt' | 'generateStructured'>;
  model: string;
  snapshot?: SemanticContent;
  extractedAt?: string;
  contextText?: string;
  /**
   * Optional extraction style. When supplied, drives a style summary line
   * + granularity-specific budget rules in the system prompt. Omitted
   * (or `undefined`) preserves the historical "no style guidance" prompt.
   *
   * The preset is read by `buildDraftPrompt` only — compile, normalisation,
   * and persistence are unaffected. Callers that don't care about style
   * (tests, MCP, programmatic invocations) can leave it out.
   */
  style?: ExtractionStyleConfig;
}

export type ExtractionV2PipelineResult =
  | {
      ok: true;
      draft: ExtractionDraft;
      compiled: CompiledMutationPlan;
      variants?: Record<PresetName, CompiledMutationPlan>;
      turnHashByTag: Record<string, string>;
    }
  | {
      ok: false;
      failure: ExtractionFailure;
      turnHashByTag: Record<string, string>;
    };

function shouldTargetedReask(failure: ExtractionFailure): boolean {
  return (
    failure.retry.strategy === 'targeted_reask' ||
    (failure.code === 'compile' && failure.details?.reaskable === true)
  );
}

/**
 * Apply the style's `max_items` cap to a canonical extraction draft by
 * selecting the top-N items and dropping the rest with a warning.
 *
 * Operates at the **item** level — not at the compiled-op level — because
 * each item compiles into a group of dependent ops (parent define +
 * populate + nested children). Truncating ops post-compile would risk
 * leaving a `populate` whose parent `define` got dropped; selecting
 * items pre-compile keeps each surviving item's op group intact.
 *
 * Item is the smallest sortable / discardable semantic unit, not an
 * absolutely self-contained one — cross-item updates and same-path
 * dedupe still happen downstream in the compiler. The applyYOps-on-
 * empty-base test pins the dependency-correctness contract.
 *
 * Sort order (deterministic):
 *   1. confidence desc
 *   2. evidence count desc (more evidence = higher signal)
 *   3. original index asc (stable tie-break)
 *
 * Returns the trimmed draft + a list of dropped item ids. Both are then
 * surfaced through `compiled.warnings` so the caller sees what was cut
 * without having to diff before/after manually.
 *
 * `max_items === undefined` (Detailed) → no cap, original draft + empty
 * dropped list.
 */
function selectTopItemsByStyle(
  draft: ExtractionDraft,
  style: ExtractionStyleConfig | undefined
): { draft: ExtractionDraft; droppedIds: string[] } {
  const maxItems = style?.max_items;
  if (maxItems === undefined || draft.items.length <= maxItems) {
    return { draft, droppedIds: [] };
  }

  // Stable sort: track original index so equal-priority items keep
  // their input order. Object.entries preserves insertion; .sort is
  // not guaranteed stable on every engine, hence the explicit index.
  const indexed = draft.items.map((item, index) => ({ item, index }));
  indexed.sort((a, b) => {
    if (a.item.confidence !== b.item.confidence) {
      return b.item.confidence - a.item.confidence;
    }
    const aEv = a.item.evidence.length;
    const bEv = b.item.evidence.length;
    if (aEv !== bEv) {
      return bEv - aEv;
    }
    return a.index - b.index;
  });

  const kept = indexed.slice(0, maxItems);
  const dropped = indexed.slice(maxItems);
  // Restore original input order among kept items so the compiler sees
  // the same sequence the model emitted (relevant when items reference
  // each other by adjacency or rely on define-before-populate ordering
  // implicitly).
  kept.sort((a, b) => a.index - b.index);

  return {
    draft: { ...draft, items: kept.map((entry) => entry.item) },
    droppedIds: dropped.map((entry) => entry.item.id),
  };
}

/**
 * Build the warning message for an item-cap selection step. Centralised
 * so the wording is consistent everywhere selection runs.
 */
function selectionWarningLine(droppedIds: string[], maxItems: number, totalItems: number): string {
  return (
    `${PRESET_PREFIX}produced ${totalItems} items; kept top ${maxItems} by confidence. ` +
    `Dropped: ${droppedIds.join(', ')}.`
  );
}

const PRESET_PREFIX = 'Extraction style cap: ';

/**
 * Granularity-specific guidance prepended to the system prompt's quality
 * rules. Concise needs a hard ceiling and an explicit "skip secondary
 * specs" hint, otherwise weak models like gpt-5.4-nano happily produce
 * 60+ items even when told to be brief.
 *
 * Returned text is empty when no style is supplied — callers that want
 * the historical prompt shape get exactly that.
 */
function styleGuidanceBlock(style: ExtractionStyleConfig | undefined): string {
  if (!style) return '';
  const summary = styleSummaryLine(style);
  if (style.granularity === 'concise') {
    // Mirror the deterministic cap. If the caller supplied an explicit
    // max_items, the prompt cites that exact number AND the header
    // declares the budget a hard limit — otherwise prompt and
    // selection would diverge:
    //   - { granularity: 'concise', max_items: 10 } previously said
    //     "~6" while selection kept 10
    //   - { granularity: 'concise' } (no cap) previously said "~6"
    //     under a "hard limits" header while selection applied no
    //     cap at all
    // Now: when max_items is defined, prompt + selection agree on
    // the number AND the wording is honest about it being enforced;
    // when undefined, both the number AND the "hard limits" framing
    // are dropped — qualitative direction stays (brief, single-tree,
    // skip-secondary-specs) since those still hold without a cap.
    const hasCap = typeof style.max_items === 'number';
    const header = hasCap
      ? 'Concise budget — these are hard limits, not suggestions:\n'
      : 'Concise direction — qualitative guidance:\n';
    const itemBudgetLine = hasCap
      ? `- Emit at most ~${style.max_items} items total. Pick the highest-signal facts; drop the rest.\n`
      : '- Be brief. Pick the highest-signal facts; skip the rest.\n';
    return (
      `${summary}\n` +
      header +
      itemBudgetLine +
      '- Prefer one comparison tree (e.g. cameras/sony/{a7r_v, a7_v}/{slot}) over\n' +
      '  many parallel root nodes. Same-subject facts MUST share a path prefix; the\n' +
      '  suffix is the slot, not the node name (write `cameras/sony/a7r_v` with slot\n' +
      '  `sensor_resolution`, NOT a separate root `a7r_v_resolution`).\n' +
      '- Skip secondary specs (storage size, file management, "not designed for X")\n' +
      "  unless they are decisive for the user's actual question.\n" +
      '- Keep evidence quotes representative (a sentence fragment), not full paragraphs.\n'
    );
  }
  if (style.granularity === 'detailed') {
    return (
      `${summary}\n` +
      'Detailed mode — capture nuance, secondary specs, and qualifying claims;\n' +
      'keep hierarchy under existing tree paths, not a flat root.\n'
    );
  }
  // balanced or unknown — emit the summary alone; the four core quality
  // rules below carry most of the weight.
  return `${summary}\n`;
}

function buildDraftPrompt(input: {
  mode: ExtractionMode;
  providerId: string;
  turns: Array<{ turn_tag: string; role: string; content: string }>;
  snapshot?: SemanticContent;
  contextText?: string;
  style?: ExtractionStyleConfig;
}): LLMPrompt {
  // F9: one simple prompt for all providers. The shape drift we used to warn
  // the model about (schema prefix, version type, _json field types, singleton
  // arrays, candidate.name vs key, evidence.role, etc.) is now all handled
  // deterministically by providerDraft.ts::normalizeLooseProviderDraft and the
  // F3 repairers. The LLM's job is just "extract the knowledge; emit JSON."
  const turnsBlock = input.turns
    .map((turn) => `[${turn.turn_tag}][${turn.role}] ${turn.content}`)
    .join('\n');

  const snapshotBlock =
    input.mode === 'incremental' && input.snapshot
      ? `\nCurrent knowledge snapshot:\n${serializeForPrompt(input.snapshot)}\n`
      : '';
  const normalizedContextText = input.contextText?.trim();
  const contextBlock = normalizedContextText
    ? `\nSelected context guidance (not source evidence):\n${normalizedContextText}\n`
    : '';

  const styleBlock = styleGuidanceBlock(input.style);
  return {
    system:
      'You extract semantic knowledge from a conversation into a ProviderExtractionDraft JSON. ' +
      'Use T-tags (T1, T2, …) in evidence.turn_tag and quote the source verbatim. Return JSON only.\n' +
      '\n' +
      (styleBlock ? `${styleBlock}\n` : '') +
      'Quality rules — these are not optional:\n' +
      '1. Every item MUST carry at least one concrete fact. The provider schema uses\n' +
      '   JSON-string fields on `candidate`:\n' +
      '   - `values_json`: stringified object of slot → value, e.g.\n' +
      '       "values_json": "{\\"sensor_resolution\\": \\"61 megapixels\\", \\"burst_speed\\": \\"10 fps\\"}"\n' +
      '   - `value_json` + `slot`: stringified scalar for a single slot, e.g.\n' +
      '       "slot": "sensor_type", "value_json": "\\"BSI CMOS\\""\n' +
      '   - `children_json`: stringified array of `{key, values}` entries\n' +
      '       (note: child `values` here is a RAW object inside the JSON-string,\n' +
      '       NOT a nested values_json string), e.g.\n' +
      '       "children_json": "[{\\"key\\": \\"a7r_v\\", \\"values\\": {\\"resolution\\": \\"61 MP\\"}}]"\n' +
      '   Items that only declare a `key` with no values_json, no value_json, and no\n' +
      '   children_json carrying values are useless and will be dropped.\n' +
      '2. Do NOT extract section headers, paragraph titles, or rhetorical structure as\n' +
      '   empty nodes. "Key Differences", "The Verdict", "Choose X if:" are not facts;\n' +
      '   the facts they introduce are. Skip the heading and capture the underlying\n' +
      '   claim with concrete values.\n' +
      '3. When a `Current knowledge snapshot` is provided, extend it. Add new facts\n' +
      '   under existing paths, or add slots to existing nodes. Do NOT create parallel\n' +
      '   top-level nodes that duplicate categories already present in the snapshot.\n' +
      '4. If the conversation contains no new concrete facts to extract, return\n' +
      '   `items: []`. An empty draft is correct; an outline of empty buckets is not.',
    messages: [
      {
        role: 'user',
        content:
          `Mode: ${input.mode}\n${snapshotBlock}${contextBlock}Conversation turns:\n${turnsBlock}\n\n` +
          'Extract the knowledge as a ProviderExtractionDraft. Return JSON only.',
      },
    ],
  };
}

function buildDraftParseFailure(message: string, rawText?: string): ExtractionFailure {
  return createExtractionFailure(
    'draft_parse',
    message,
    rawText ? { details: { rawText } } : undefined
  );
}

function _buildDraftSchemaFailure(message: string, rawText?: string): ExtractionFailure {
  return createExtractionFailure(
    'draft_schema',
    message,
    rawText ? { details: { rawText } } : undefined
  );
}

function buildSchemaFailureFromIssues(
  issues: Array<{ message: string; path?: PropertyKey[] }>,
  rawText?: string,
  priorPayload?: unknown
): ExtractionFailure {
  // F13: capture the raw draft the model emitted so the reask can show it
  // back to the model verbatim. Falls back to JSON.stringify of a parsed
  // object when we don't have the original text.
  const priorDraftText =
    rawText ?? (priorPayload !== undefined ? safeStringify(priorPayload) : undefined);
  return createExtractionFailure('draft_schema', issues.map((issue) => issue.message).join('; '), {
    details: {
      issues,
      ...(rawText ? { rawText } : {}),
      ...(priorDraftText ? { priorDraftText } : {}),
    },
  });
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
}

/**
 * Project a pipeline input's turns down to the validator's shape.
 * `PromptTurnInput` carries `role` for prompt assembly; `ValidationTurn`
 * doesn't care about role, just `turn_hash` + `content`. Centralised so
 * both the strict and salvage paths see the exact same turn map.
 */
function validationTurnsFor(turns: readonly PromptTurnInput[]): ValidationTurn[] {
  return turns.map((t) => ({ turn_hash: t.turn_hash, content: t.content }));
}

function validateCompiledPlanSources(
  compiled: CompiledMutationPlan,
  turns: readonly PromptTurnInput[],
  turnHashByTag: Record<string, string>
): { ok: true } | { ok: false; failure: ExtractionFailure } {
  const opsForValidation = compiled.ops as SourcedYOp[];
  const strictValidationTurns = validationTurnsFor(turns);
  normalizeOpTurnHashes(opsForValidation, strictValidationTurns);
  repairOpQuotes(opsForValidation, strictValidationTurns);
  const sourceCheck = validateSource(opsForValidation, strictValidationTurns);
  if (sourceCheck.ok) return { ok: true };
  return {
    ok: false,
    failure: buildUnverifiableQuoteFailure(sourceCheck.failingOps, turnHashByTag),
  };
}

function compilePlanForStyle(input: {
  draft: ExtractionDraft;
  style: ExtractionStyleConfig | undefined;
  snapshot?: SemanticContent;
  model: string;
  extractedAt?: string;
  turns: readonly PromptTurnInput[];
  turnHashByTag: Record<string, string>;
  modeWarnings: string[];
}):
  | { ok: true; draft: ExtractionDraft; compiled: CompiledMutationPlan }
  | { ok: false; failure: ExtractionFailure } {
  const totalItemsFromModel = input.draft.items.length;
  const selection = selectTopItemsByStyle(input.draft, input.style);
  const selectionWarnings: string[] =
    selection.droppedIds.length > 0 && input.style?.max_items !== undefined
      ? [selectionWarningLine(selection.droppedIds, input.style.max_items, totalItemsFromModel)]
      : [];

  const compiled = compileExtractionDraft({
    draft: selection.draft,
    baseline: input.snapshot,
    sourceModel: input.model,
    extractedAt: input.extractedAt ?? new Date().toISOString(),
    turnHashByTag: input.turnHashByTag,
  });
  if (!compiled.ok) return { ok: false, failure: compiled.failure };

  const plan: CompiledMutationPlan = {
    ops: compiled.ops,
    warnings: [...input.modeWarnings, ...selectionWarnings, ...compiled.warnings],
  };
  const validation = validateCompiledPlanSources(plan, input.turns, input.turnHashByTag);
  if (!validation.ok) return validation;

  return { ok: true, draft: selection.draft, compiled: plan };
}

function buildPresetVariants(input: {
  draft: ExtractionDraft;
  snapshot?: SemanticContent;
  model: string;
  extractedAt?: string;
  turns: readonly PromptTurnInput[];
  turnHashByTag: Record<string, string>;
  modeWarnings: string[];
}): Record<PresetName, CompiledMutationPlan> | undefined {
  const variants = {} as Record<PresetName, CompiledMutationPlan>;
  const presetNames: PresetName[] = ['concise', 'balanced', 'detailed'];

  for (const name of presetNames) {
    const compiled = compilePlanForStyle({
      ...input,
      style: PRESETS[name],
    });
    if (!compiled.ok) return undefined;
    variants[name] = compiled.compiled;
  }

  return variants;
}

/**
 * Build a structured ExtractionFailure for source-quote validation
 * failures. The prompt builder reads the typed `failingOps` list out of
 * `details` to render one bullet per failing op (op index, path, turn
 * tag, the bad quote). Keeping the data structured (not pre-rendered)
 * means the prompt and any future telemetry / UI can format independently.
 */
function buildUnverifiableQuoteFailure(
  failingOps: readonly FailingOp[],
  turnHashByTag: Record<string, string>
): ExtractionFailure {
  const tagByHash = new Map(Object.entries(turnHashByTag).map(([tag, hash]) => [hash, tag]));
  const detailedFailingOps = failingOps
    .filter((f) => f.reason === 'unverifiable_quote')
    .map((f) => {
      const op = f.op as Record<string, unknown>;
      const src = op.source as { turn_ref?: { turn_hash?: string; quote?: string } } | undefined;
      const turnHash = src?.turn_ref?.turn_hash ?? '';
      const turnTag = tagByHash.get(turnHash) ?? '<unknown>';
      // Pick a meaningful path identifier from the op shape. Each YOp
      // has exactly one of define/set/populate/etc. carrying a path.
      const path =
        (op.define as { path?: string } | undefined)?.path ??
        (op.set as { path?: string } | undefined)?.path ??
        (op.populate as { path?: string } | undefined)?.path ??
        (op.unset as { path?: string } | undefined)?.path ??
        (op.drop as { path?: string } | undefined)?.path ??
        '<unknown>';
      return {
        opIndex: f.opIndex,
        turnTag,
        path,
        badQuote: src?.turn_ref?.quote ?? '',
      };
    });

  const summary =
    detailedFailingOps.length === 1
      ? '1 evidence quote is not an exact substring of its source turn'
      : `${detailedFailingOps.length} evidence quotes are not exact substrings of their source turns`;

  return createExtractionFailure('unverifiable_quote', summary, {
    details: { failingOps: detailedFailingOps },
  });
}

function buildTargetedReaskPrompt(
  prompt: LLMPrompt,
  failure: ExtractionFailure,
  turnHashByTag: Record<string, string>
): LLMPrompt {
  const lines: string[] = [
    'Your previous ProviderExtractionDraft failed validation. Fix only these issues and return a full corrected draft.',
  ];

  if (failure.code === 'draft_schema' && Array.isArray(failure.details?.issues)) {
    const issues = failure.details.issues as Array<{ message?: string; path?: PropertyKey[] }>;
    const bullets = issues.map((issue) => {
      const path =
        Array.isArray(issue.path) && issue.path.length > 0
          ? issue.path.map((segment) => String(segment)).join('.')
          : 'draft';
      return `- ${path}: ${issue.message ?? 'invalid shape'}`;
    });
    lines.push(...bullets);
  } else if (failure.code === 'draft_parse') {
    lines.push(`- Return valid JSON only.`);
  } else if (failure.code === 'provenance') {
    const allowedTags = Object.keys(turnHashByTag).join(', ');
    lines.push(`- Use only these turn tags: ${allowedTags}`);
    if (typeof failure.details?.turn_tag === 'string') {
      lines.push(`- Invalid turn tag used: ${failure.details.turn_tag}`);
    }
  } else if (failure.code === 'unverifiable_quote') {
    // Per the v1 prompt design (review-locked): plain language about
    // exact substrings (no "byte-for-byte" — JS substring isn't byte-
    // level), no inferred "likely cause" hints (those mislead small
    // models), drop-item escape hatch retained, no worked example.
    lines.length = 0;
    lines.push(
      'Your previous ProviderExtractionDraft used evidence quotes that are not exact substrings of the source turns.'
    );
    lines.push('');
    lines.push('For each failing item:');
    lines.push('1. Use only the named [T<n>] turn.');
    lines.push('2. Replace evidence.quote with one exact substring copied from that turn.');
    lines.push(
      '3. The quote must preserve casing, whitespace, and punctuation exactly as it appears in the source turn.'
    );
    lines.push('4. If no exact supporting substring exists, drop that item.');
    lines.push('');
    lines.push(
      'Do not paraphrase, combine separate fragments, invent punctuation, or use rendered/markdown-stripped text.'
    );

    const failingOps = Array.isArray(failure.details?.failingOps)
      ? (failure.details.failingOps as Array<{
          opIndex: number;
          turnTag: string;
          path: string;
          badQuote: string;
        }>)
      : [];
    if (failingOps.length > 0) {
      lines.push('');
      lines.push('Failing items:');
      for (const f of failingOps) {
        lines.push(
          `- op #${f.opIndex} (path "${f.path}", turn ${f.turnTag}), invalid quote: ${JSON.stringify(f.badQuote)}`
        );
      }
    }
    lines.push('');
    lines.push(
      'Return a full corrected ProviderExtractionDraft. Do not add new items; only fix or drop the listed items.'
    );
  } else if (failure.code === 'compile' && failure.details?.reaskable === true) {
    // Field-specific guidance. The compiler emits several different
    // reaskable failure shapes; sending the wrong remediation tells
    // the model to fix something unrelated to the actual problem.
    const field = typeof failure.details?.field === 'string' ? failure.details.field : null;

    const PATH_FIELDS = new Set([
      'target_ref.path',
      'target_ref.node_key',
      'candidate.path_hint',
      'candidate.key',
    ]);

    if (field === 'candidate.children[].key') {
      const invalidKey =
        typeof failure.details?.invalid_key === 'string'
          ? failure.details.invalid_key
          : '<unspecified>';
      lines.push(
        `- candidate.children[].key "${invalidKey}" is not a valid YOps key. Each child key must match snake_case (lowercase letters, digits, underscores) and use "/" as the path separator if it represents nesting.`
      );
      lines.push(
        '- Examples of valid child keys: "baggage_handling", "check_in", "soul_society/seireitei". Avoid spaces, capital letters, hyphens, and dots.'
      );
    } else if (field && PATH_FIELDS.has(field)) {
      // P2 fail-fast: the path candidate at this field was present but
      // malformed (e.g. CamelCase, dotted, contains spaces). The model
      // needs to fix this specific field — not pad more fields, and
      // not switch to a different intent.
      const invalidPath =
        typeof failure.details?.invalid_path === 'string'
          ? failure.details.invalid_path
          : '<unspecified>';
      const reason = typeof failure.details?.reason === 'string' ? failure.details.reason : null;
      lines.push(
        `- ${field} "${invalidPath}" is not a valid YOps path${reason ? ` (${reason})` : ''}. Use snake_case segments separated by "/" — e.g. "trip/destination", "characters/main_protagonist". Avoid dots, spaces, capitals, and hyphens.`
      );
      lines.push(
        '- Fix this exact field in the corrected draft. Do not move the value to a different field.'
      );
    } else {
      const intent =
        typeof failure.details?.intent === 'string' ? failure.details.intent : 'update';
      const path = typeof failure.details?.path === 'string' ? failure.details.path : 'target path';
      lines.push(
        `- For ${intent} on ${path}, include either candidate.values_json as a JSON object string, or candidate.slot with candidate.value_json.`
      );
      lines.push('- Do not leave both candidate.values_json and candidate.slot/value_json empty.');
    }
  } else {
    lines.push(`- ${failure.message}`);
  }

  // F13: include the prior output as an assistant turn so the model can
  // see what it actually emitted and fix incrementally, mirroring the
  // Pydantic AI / Instructor `ModelRetry` pattern. The assistant turn is
  // appended before the user correction so the conversation reads as:
  //   user:        (original extraction prompt)
  //   assistant:   (prior draft, possibly malformed)
  //   user:        "Your previous draft failed validation. Fix: …"
  const priorDraftText =
    typeof failure.details?.priorDraftText === 'string'
      ? failure.details.priorDraftText
      : typeof failure.details?.rawText === 'string'
        ? failure.details.rawText
        : undefined;

  const messages: LLMPrompt['messages'] = [...prompt.messages];
  if (priorDraftText) {
    messages.push({ role: 'assistant', content: priorDraftText });
  }
  messages.push({ role: 'user', content: lines.join('\n') });

  return { ...prompt, messages };
}

function tryLooseNormalize(raw: unknown): { ok: true; draft: ExtractionDraft } | { ok: false } {
  const normalized = normalizeLooseProviderDraft(raw);
  const reparsed = ProviderExtractionDraftSchema.safeParse(normalized);
  if (!reparsed.success) return { ok: false };
  const lifted = liftProviderDraftToExtractionDraft(reparsed.data);
  if (!lifted.ok) return { ok: false };
  return { ok: true, draft: lifted.draft };
}

function extractProviderRawJson(error: unknown): unknown | null {
  if (!error || typeof error !== 'object' || !('details' in error)) return null;
  const details = (error as { details?: Record<string, unknown> }).details;
  if (!details || typeof details !== 'object') return null;

  // F12: use repair-aware parse so a transport error carrying slightly
  // broken JSON (trailing commas, truncation) can still be rescued by the
  // pipeline's loose normalizer.
  const jsonText = details.jsonText;
  if (typeof jsonText === 'string') {
    const repaired = tryParseWithRepair(jsonText);
    if (repaired.ok) return repaired.value;
  }
  const rawText = details.rawText;
  if (typeof rawText === 'string') {
    const repaired = tryParseWithRepair(rawText);
    if (repaired.ok) return repaired.value;
  }
  return null;
}

async function generateDraft(
  input: ExtractionV2PipelineInput,
  prompt: LLMPrompt
): Promise<{ ok: true; draft: ExtractionDraft } | { ok: false; failure: ExtractionFailure }> {
  try {
    if (typeof input.provider.generateStructured === 'function') {
      const result = await input.provider.generateStructured(
        prompt,
        ProviderExtractionDraftSchema,
        {
          model: input.model,
          temperature: 0.1,
          maxTokens: 4096,
        }
      );

      const validated = ProviderExtractionDraftSchema.safeParse(result.data);
      if (!validated.success) {
        // F11: adapter returned data its own internal validation accepted
        // but which fails the strict provider schema (typically optional-
        // nullable fields left undefined). Try the loose normalizer before
        // giving up.
        const rescued = tryLooseNormalize(result.data);
        if (rescued.ok) return rescued;
        return {
          ok: false,
          failure: buildSchemaFailureFromIssues(validated.error.issues, undefined, result.data),
        };
      }

      const lifted = liftProviderDraftToExtractionDraft(validated.data);
      if (!lifted.ok) {
        // F11: lift step can fail when the model's _json payloads
        // structurally disagree with the canonical schema (e.g. array in
        // values slot, child missing key). Retry via loose normalize which
        // re-runs the lift's deterministic fixups.
        const rescued = tryLooseNormalize(result.data);
        if (rescued.ok) return rescued;
        return {
          ok: false,
          failure: lifted.failure,
        };
      }

      return { ok: true, draft: lifted.draft };
    }

    const firstMessageContent = prompt.messages[0]?.content;
    const fallbackPrompt =
      typeof firstMessageContent === 'string'
        ? firstMessageContent
        : JSON.stringify(firstMessageContent ?? '');

    const rawResult =
      typeof input.provider.generateFromPrompt === 'function'
        ? await input.provider.generateFromPrompt(prompt, {
            model: input.model,
            temperature: 0.1,
            maxTokens: 4096,
          })
        : await input.provider.generate(fallbackPrompt, {
            temperature: 0.1,
            maxTokens: 4096,
          });

    // F12: the non-structured plain-text path benefits most from repairs —
    // models that can't emit strict JSON often still produce near-valid output.
    const normalizedText = normalizeExtractionText(rawResult.text);
    const repaired = tryParseWithRepair(normalizedText);
    if (!repaired.ok) {
      return {
        ok: false,
        failure: buildDraftParseFailure('Failed to parse provider output as JSON', normalizedText),
      };
    }
    const parsed = repaired.value;

    const validated = ProviderExtractionDraftSchema.safeParse(parsed);
    if (!validated.success) {
      // F6: try loose normalization on the parsed JSON before surfacing
      // the schema error.
      const rescued = tryLooseNormalize(parsed);
      if (rescued.ok) return rescued;
      return {
        ok: false,
        failure: buildSchemaFailureFromIssues(validated.error.issues, normalizedText, parsed),
      };
    }

    const lifted = liftProviderDraftToExtractionDraft(validated.data);
    if (!lifted.ok) {
      return {
        ok: false,
        failure: lifted.failure,
      };
    }

    return { ok: true, draft: lifted.draft };
  } catch (error) {
    // F6: if the provider adapter attached the raw JSON it extracted (either
    // from generateStructuredViaText fallback or elsewhere), try to coerce it
    // into a valid ProviderExtractionDraft before giving up. Deterministic —
    // no further LLM calls.
    const rawJson = extractProviderRawJson(error);
    if (rawJson !== null) {
      const rescued = tryLooseNormalize(rawJson);
      if (rescued.ok) {
        return { ok: true, draft: rescued.draft };
      }
    }
    return {
      ok: false,
      failure: mapProviderErrorToExtractionFailure(input.providerId, error as Error),
    };
  }
}

export async function runExtractionV2Pipeline(
  input: ExtractionV2PipelineInput
): Promise<ExtractionV2PipelineResult> {
  const { taggedTurns, turnHashByTag } = buildPromptTurnMap(input.turns);
  const requestedPreset = input.style ? matchPreset(input.style) : null;
  const generationStyle = requestedPreset ? PRESETS.detailed : input.style;
  const basePrompt = buildDraftPrompt({
    mode: input.mode,
    providerId: input.providerId,
    turns: taggedTurns,
    snapshot: input.snapshot,
    contextText: input.contextText,
    style: generationStyle,
  });
  let prompt = basePrompt;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const generated = await generateDraft(input, prompt);
    if (!generated.ok) {
      if (attempt < maxAttempts && shouldTargetedReask(generated.failure)) {
        prompt = buildTargetedReaskPrompt(basePrompt, generated.failure, turnHashByTag);
        continue;
      }
      return {
        ok: false,
        failure: generated.failure,
        turnHashByTag,
      };
    }

    // The caller-owned mode is authoritative. Provider drafts carry a
    // mode field because the schema asks for it, but LLMs can drift
    // (e.g. return bootstrap while the API computed incremental from a
    // committed baseline). Compile semantics must follow the caller's
    // baseline decision, not the model's self-report.
    const modeWarnings =
      generated.draft.mode === input.mode
        ? []
        : [
            `Provider draft mode "${generated.draft.mode}" overridden by caller mode "${input.mode}".`,
          ];
    const authoritativeDraft =
      generated.draft.mode === input.mode
        ? generated.draft
        : { ...generated.draft, mode: input.mode };
    const extractedAt = input.extractedAt ?? new Date().toISOString();

    // Apply the style cap deterministically at the canonical-draft layer,
    // before compile. This is the hard counterpart to the prompt budget:
    // even if the model ignores "≤6 items" and emits 14, selection
    // trims to the top 6 by confidence and surfaces what was dropped
    // through compiled.warnings. See `selectTopItemsByStyle`.
    const totalItemsFromModel = authoritativeDraft.items.length;
    const selection = selectTopItemsByStyle(authoritativeDraft, input.style);
    const selectionWarnings: string[] =
      selection.droppedIds.length > 0 && input.style?.max_items !== undefined
        ? [selectionWarningLine(selection.droppedIds, input.style.max_items, totalItemsFromModel)]
        : [];

    const compiled = compileExtractionDraft({
      draft: selection.draft,
      baseline: input.snapshot,
      sourceModel: input.model,
      extractedAt,
      turnHashByTag,
    });

    if (!compiled.ok) {
      if (attempt < maxAttempts && shouldTargetedReask(compiled.failure)) {
        prompt = buildTargetedReaskPrompt(basePrompt, compiled.failure, turnHashByTag);
        continue;
      }
      // Partial-compile salvage runs ONLY when:
      //   1. the failure is `compile` (the only item-level code),
      //   2. it was reaskable (`shouldTargetedReask` true) — i.e. the
      //      kind of error the model has targeted guidance for, and
      //   3. we actually ran out of reask budget (`attempt >= maxAttempts`).
      //
      // Without (2) + (3), a non-reaskable compile failure on attempt 1
      // (e.g. an unsupported draft intent) would silently drop items
      // and return siblings without the model ever having a chance to
      // self-correct. Silent drop is exactly the data-loss class the
      // review on the prior PR flagged: salvage is a last resort, not
      // a first-attempt branch.
      const reaskExhausted =
        attempt >= maxAttempts &&
        compiled.failure.code === 'compile' &&
        shouldTargetedReask(compiled.failure);
      if (reaskExhausted) {
        // Salvage compiles the SELECTED draft, not the original — the
        // style cap still applies on the partial path so we don't
        // accidentally widen output past the budget after a failed
        // strict pass.
        const partial = compileExtractionDraft({
          draft: selection.draft,
          baseline: input.snapshot,
          sourceModel: input.model,
          extractedAt,
          turnHashByTag,
          allowPartial: true,
        });
        if (partial.ok && partial.ops.length > 0) {
          // Salvage output must clear the same source-quote contract
          // the strict path enforces — otherwise a draft with one
          // reaskable compile error plus one structurally valid item
          // carrying a fabricated quote could return API 200 with
          // unverifiable quotes the caller now trusts. Salvage gets
          // its own validation pass; reask budget is already spent,
          // so failure here is terminal (no further retries).
          const partialOps = partial.ops as SourcedYOp[];
          normalizeOpTurnHashes(partialOps, validationTurnsFor(input.turns));
          repairOpQuotes(partialOps, validationTurnsFor(input.turns));
          const partialSourceCheck = validateSource(partialOps, validationTurnsFor(input.turns));
          if (!partialSourceCheck.ok) {
            return {
              ok: false,
              failure: buildUnverifiableQuoteFailure(partialSourceCheck.failingOps, turnHashByTag),
              turnHashByTag,
            };
          }
          return {
            ok: true,
            draft: selection.draft,
            compiled: {
              ops: partial.ops,
              warnings: [
                ...modeWarnings,
                ...selectionWarnings,
                `Partial compile after reask exhaustion: ${compiled.failure.message}`,
                ...partial.warnings,
              ],
            },
            turnHashByTag,
          };
        }
        // Partial yielded zero ops — every item was malformed, so the
        // original failure is the only honest signal.
      }
      return {
        ok: false,
        failure: compiled.failure,
        turnHashByTag,
      };
    }

    // ── Source quote validation (server-side contract enforcement) ──
    // Compile succeeded structurally; now check that every op's
    // source.turn_ref.quote is a verbatim substring of the named turn's
    // content. This used to live on the web side, after the API had
    // already returned 200 — which made retries non-targeted (the
    // failing-ops feedback never reached the LLM through the wire).
    // Source provenance is a core invariant; enforcing it here means
    // the API only returns 200 when quotes verify, and reask happens
    // in the same loop as compile/draft retries.
    //
    // Mutates ops in place: hash-prefix expansion + deterministic quote
    // repair (markdown / smart-quote / punct / case+whitespace variants).
    // Quotes that can't be repaired stay untouched and fail validation.
    const sourceCheck = validateCompiledPlanSources(compiled, input.turns, turnHashByTag);

    if (!sourceCheck.ok) {
      // Same retry shape as compile/provenance failures: budget aware,
      // targeted reask carrying the failing ops back to the model so
      // it can fix the specific quotes (rather than re-rolling the
      // whole extraction blindly).
      if (attempt < maxAttempts) {
        prompt = buildTargetedReaskPrompt(basePrompt, sourceCheck.failure, turnHashByTag);
        continue;
      }
      return {
        ok: false,
        failure: sourceCheck.failure,
        turnHashByTag,
      };
    }

    const variants = requestedPreset
      ? buildPresetVariants({
          draft: authoritativeDraft,
          snapshot: input.snapshot,
          model: input.model,
          extractedAt,
          turns: input.turns,
          turnHashByTag,
          modeWarnings,
        })
      : undefined;

    return {
      ok: true,
      draft: selection.draft,
      compiled: {
        ops: compiled.ops,
        // Selection warnings precede compile warnings so a reader
        // sees the cap action before any downstream notes.
        warnings: [...modeWarnings, ...selectionWarnings, ...compiled.warnings],
      },
      ...(variants ? { variants } : {}),
      turnHashByTag,
    };
  }

  return {
    ok: false,
    failure: createExtractionFailure(
      'draft_schema',
      'Extraction failed after targeted reask attempts'
    ),
    turnHashByTag,
  };
}
