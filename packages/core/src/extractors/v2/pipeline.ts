import type { LLMProvider, LLMPrompt } from '../../llm/types';
import { serializeForPrompt } from '../../semantic/serialize';
import type { SemanticContent } from '../../semantic/types';
import { compileExtractionDraft } from './compiler';
import {
  createExtractionFailure,
  type ExtractionFailure,
} from './failures';
import { buildPromptTurnMap, normalizeExtractionText, type PromptTurnInput } from './normalization';
import {
  type CompiledMutationPlan,
  type ExtractionDraft,
  type ExtractionMode,
} from './types';
import {
  liftProviderDraftToExtractionDraft,
  ProviderExtractionDraftSchema,
} from './providerDraft';
import { mapProviderErrorToExtractionFailure } from './providerAdapters';

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
  const turnsBlock = input.turns
    .map((turn) => `[${turn.turn_tag}][${turn.role}] ${turn.content}`)
    .join('\n');

  const snapshotBlock =
    input.mode === 'incremental' && input.snapshot
      ? `\nCurrent knowledge snapshot:\n${serializeForPrompt(input.snapshot)}\n`
      : '';

  const exampleBlock =
    'ProviderExtractionDraft JSON shape example:\n' +
    '{"schema":"t3x/provider-extraction-draft","version":1,"mode":"bootstrap","items":[{"id":"item_1","intent":"add","confidence":0.9,"reasoning_type":"direct","target_ref":{"node_key":null,"path":null,"existing_node_id":null},"candidate":{"key":"airport_issue","path_hint":"airport_issue","slot":null,"value_json":null,"values_json":"{\\"summary\\":\\"SEA had a cyberattack\\"}","children_json":"[{\\"key\\":\\"Baggage Handling\\",\\"values\\":{\\"description\\":\\"Automated baggage systems were disrupted\\"}}]"},"evidence":[{"turn_tag":"T1","quote":"Baggage Handling: The automated baggage systems were severely disrupted.","role":"primary"}]}],"warnings":[]}\n';

  if (input.providerId === 'anthropic' || input.providerId === 'openai') {
    return {
      system:
        'You extract semantic knowledge into ProviderExtractionDraft JSON. ' +
        'Use T-tags in evidence.turn_tag, keep items minimal, and return JSON only.',
      messages: [
        {
          role: 'user',
          content:
            `Mode: ${input.mode}\n` +
            `${snapshotBlock}` +
            'Conversation turns:\n' +
            `${turnsBlock}\n\n` +
            'Return a valid ProviderExtractionDraft.\n' +
            'Always include root fields schema, version, mode, items, warnings.\n' +
            'candidate.value_json, values_json, and children_json must be JSON strings.\n' +
            'Use value_json for scalar values and arrays. Use values_json only for object maps.\n' +
            'children_json must always be a JSON array string, even for one child.\n' +
            (input.providerId === 'openai'
              ? 'For update or reinforce items, always provide either candidate.values_json or candidate.slot together with candidate.value_json.\n'
              : '') +
            'Keep evidence quotes short and verbatim.\n',
        },
      ],
    };
  }

  return {
    system:
      'You extract semantic knowledge from conversation turns into a structured ProviderExtractionDraft. ' +
      'Use turn tags like T1/T2 in evidence.turn_tag, quote verbatim text, and do not emit raw turn hashes. ' +
      'Fields ending in _json must contain JSON-encoded strings.',
    messages: [
      {
        role: 'user',
        content:
          `Mode: ${input.mode}\n` +
          `${snapshotBlock}` +
          'Conversation turns:\n' +
          `${turnsBlock}\n\n` +
          `${exampleBlock}\n` +
          'Return a valid ProviderExtractionDraft with explicit evidence for every item.\n' +
          'Use candidate.value_json for scalar or array/object JSON values, candidate.values_json for object maps, and candidate.children_json for child arrays.\n' +
          'Do not return canonical ExtractionDraft fields like candidate.value or candidate.values directly.\n' +
          'Always include the root fields schema, version, mode, items, and warnings.',
      },
    ],
  };
}

function buildDraftParseFailure(message: string, rawText?: string): ExtractionFailure {
  return createExtractionFailure('draft_parse', message, rawText ? { details: { rawText } } : undefined);
}

function buildDraftSchemaFailure(message: string, rawText?: string): ExtractionFailure {
  return createExtractionFailure('draft_schema', message, rawText ? { details: { rawText } } : undefined);
}

function buildSchemaFailureFromIssues(
  issues: Array<{ message: string; path?: PropertyKey[] }>,
  rawText?: string
): ExtractionFailure {
  return createExtractionFailure(
    'draft_schema',
    issues.map((issue) => issue.message).join('; '),
    {
      details: {
        issues,
        ...(rawText ? { rawText } : {}),
      },
    }
  );
}

function buildTargetedReaskPrompt(
  prompt: LLMPrompt,
  failure: ExtractionFailure,
  turnHashByTag: Record<string, string>
): LLMPrompt {
  const lines: string[] = ['Your previous ProviderExtractionDraft failed validation. Fix only these issues and return a full corrected draft.'];

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
    lines.push(`- For ${intent} on ${path}, include either candidate.values_json as a JSON object string, or candidate.slot with candidate.value_json.`);
    lines.push('- Do not leave both candidate.values_json and candidate.slot/value_json empty.');
  } else {
    lines.push(`- ${failure.message}`);
  }

  return {
    ...prompt,
    messages: [
      ...prompt.messages,
      {
        role: 'user',
        content: lines.join('\n'),
      },
    ],
  };
}

async function generateDraft(
  input: ExtractionV2PipelineInput,
  prompt: LLMPrompt
): Promise<
  | { ok: true; draft: ExtractionDraft }
  | { ok: false; failure: ExtractionFailure }
> {
  try {
    if (typeof input.provider.generateStructured === 'function') {
      const result = await input.provider.generateStructured(prompt, ProviderExtractionDraftSchema, {
        model: input.model,
        temperature: 0.1,
        maxTokens: 4096,
      });

      const validated = ProviderExtractionDraftSchema.safeParse(result.data);
      if (!validated.success) {
        return {
          ok: false,
          failure: buildSchemaFailureFromIssues(validated.error.issues),
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

    const normalizedText = normalizeExtractionText(rawResult.text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(normalizedText);
    } catch {
      return {
        ok: false,
        failure: buildDraftParseFailure('Failed to parse provider output as JSON', normalizedText),
      };
    }

    const validated = ProviderExtractionDraftSchema.safeParse(parsed);
    if (!validated.success) {
      return {
        ok: false,
        failure: buildSchemaFailureFromIssues(validated.error.issues, normalizedText),
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
    failure: createExtractionFailure('draft_schema', 'Extraction failed after targeted reask attempts'),
    turnHashByTag,
  };
}
