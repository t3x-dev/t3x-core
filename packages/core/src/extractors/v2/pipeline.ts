import type { LLMPrompt, LLMProvider } from '../../llm/types';
import { tryParseWithRepair } from '../../providers/llm/jsonRepair';
import { serializeForPrompt } from '../../semantic/serialize';
import type { SemanticContent } from '../../semantic/types';
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
}

export type ExtractionV2PipelineResult =
  | {
      ok: true;
      draft: ExtractionDraft;
      compiled: CompiledMutationPlan;
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

function buildDraftPrompt(input: {
  mode: ExtractionMode;
  providerId: string;
  turns: Array<{ turn_tag: string; role: string; content: string }>;
  snapshot?: SemanticContent;
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

  return {
    system:
      'You extract semantic knowledge from a conversation into a ProviderExtractionDraft JSON. ' +
      'Use T-tags (T1, T2, …) in evidence.turn_tag and quote the source verbatim. Return JSON only.',
    messages: [
      {
        role: 'user',
        content:
          `Mode: ${input.mode}\n${snapshotBlock}Conversation turns:\n${turnsBlock}\n\n` +
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
  } else if (failure.code === 'compile' && failure.details?.reaskable === true) {
    const intent = typeof failure.details?.intent === 'string' ? failure.details.intent : 'update';
    const path = typeof failure.details?.path === 'string' ? failure.details.path : 'target path';
    lines.push(
      `- For ${intent} on ${path}, include either candidate.values_json as a JSON object string, or candidate.slot with candidate.value_json.`
    );
    lines.push('- Do not leave both candidate.values_json and candidate.slot/value_json empty.');
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
  const basePrompt = buildDraftPrompt({
    mode: input.mode,
    providerId: input.providerId,
    turns: taggedTurns,
    snapshot: input.snapshot,
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

    const compiled = compileExtractionDraft({
      draft: generated.draft,
      sourceModel: input.model,
      extractedAt: input.extractedAt ?? new Date().toISOString(),
      turnHashByTag,
    });

    if (!compiled.ok) {
      if (attempt < maxAttempts && shouldTargetedReask(compiled.failure)) {
        prompt = buildTargetedReaskPrompt(basePrompt, compiled.failure, turnHashByTag);
        continue;
      }
      return {
        ok: false,
        failure: compiled.failure,
        turnHashByTag,
      };
    }

    return {
      ok: true,
      draft: generated.draft,
      compiled: {
        ops: compiled.ops,
        warnings: compiled.warnings,
      },
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
