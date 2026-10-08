import {
  applyNativeYOps,
  buildTargetedReaskPrompt,
  type LLMPrompt,
  type LLMProvider,
  LLMProviderError,
  mapProviderErrorToExtractionFailure,
  NativeYOpSchema,
  ProposalGenerationDraftSchema,
  type ProposalGenerationDraftV1,
} from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  type ProposalGenerationModel,
  ProposalGenerationProviderError,
  type ProposalGenerationRequest,
} from './proposal-generation';
import { resolveProviderAndModel } from './provider-resolver';
import {
  newSemanticLayoutIssues,
  type SemanticSchemaLayout,
  type SemanticSchemaLayoutNode,
  type SemanticSchemaLayoutSlot,
} from './semantic-schema-layout';

function statedClaimHasExactSupport(
  claim: ProposalGenerationDraftV1['intent'],
  sources: readonly { content: string }[]
): boolean {
  if (claim.mode !== 'stated') return true;
  return claim.evidencePointers.some((pointer) => {
    const source = sources[pointer.sourceIndex];
    const value = pointer.locator.value;
    if (!source || value === null || typeof value !== 'object' || Array.isArray(value))
      return false;
    const quote = (value as { quote?: unknown }).quote;
    return (
      typeof quote === 'string' && source.content.includes(quote) && quote.includes(claim.value)
    );
  });
}

function normalizeGeneratedClaims(
  value: unknown,
  sources: readonly { content: string }[]
): ProposalGenerationDraftV1 {
  const parsed = ProposalGenerationDraftSchema.parse(value);
  const normalize = (claim: ProposalGenerationDraftV1['intent']) =>
    claim.mode === 'stated' && !statedClaimHasExactSupport(claim, sources)
      ? { ...claim, mode: 'inferred' as const }
      : claim;
  return { ...parsed, intent: normalize(parsed.intent), rationale: normalize(parsed.rationale) };
}

function explicitCardFields(instruction: string): { title: string; content: string } | null {
  const match = instruction.match(
    /(?:标题|名称)\s*(?:为|是|[:：])\s*(.+?)\s*(?:[,，]\s*|\s+)(?:内容|正文)\s*(?:为|是|[:：])\s*(.+?)\s*[。！!]?\s*$/u
  );
  const title = match?.[1]?.trim().replace(/^["“]|["”]$/g, '');
  const content = match?.[2]?.trim().replace(/^["“]|["”]$/g, '');
  // Only complete an unambiguous two-field request; let the model handle longer prose.
  return title && content && !/[，,；;]/u.test(content) ? { title, content } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The slot of an appended collection item that should carry explicitly requested card content:
 * an unfilled free-text slot of that item's schema node, preferring required ones.
 */
function explicitContentSlot(
  node: SemanticSchemaLayoutNode,
  slots: Record<string, unknown>,
  titleSlot: string
): SemanticSchemaLayoutSlot | undefined {
  const candidates = node.slots.filter(
    (slot) =>
      slot.key !== titleSlot &&
      !(slot.key in slots) &&
      !slot.enum &&
      (slot.type === undefined || slot.type === 'string' || slot.type === 'array')
  );
  return candidates.find((slot) => slot.required) ?? candidates[0];
}

function completeExplicitCardContent(
  draft: ProposalGenerationDraftV1,
  instruction: string,
  layout: SemanticSchemaLayout
): ProposalGenerationDraftV1 {
  const requested = explicitCardFields(instruction);
  if (
    !requested ||
    JSON.stringify(draft.changes.flatMap((change) => change.operations)).includes(requested.content)
  )
    return draft;
  const collections = new Map(
    layout.nodes.filter((node) => node.repeated).map((node) => [`${node.path}/children`, node])
  );
  return {
    ...draft,
    changes: draft.changes.map((change) => ({
      ...change,
      operations: change.operations.map((operation) => {
        const append = isRecord(operation) ? operation.append : null;
        if (!isRecord(append) || typeof append.path !== 'string') return operation;
        const collection = collections.get(append.path);
        const item = append.value;
        if (!collection || !isRecord(item) || !isRecord(item.slots)) return operation;
        const slots = item.slots;
        const titleSlot = Object.keys(slots).find((key) => slots[key] === requested.title);
        if (!titleSlot) return operation;
        const contentSlot = explicitContentSlot(collection, slots, titleSlot);
        if (!contentSlot) return operation;
        return {
          append: {
            ...append,
            value: {
              ...item,
              slots: {
                ...slots,
                [contentSlot.key]:
                  contentSlot.type === 'array' ? [requested.content] : requested.content,
              },
            },
          },
        };
      }),
    })),
  };
}

export async function defaultProposalGenerationModel(input: {
  db: AnyDB;
  projectId: string;
  request: ProposalGenerationRequest;
}): Promise<ProposalGenerationModel> {
  const resolved = await resolveProviderAndModel({
    db: input.db,
    projectId: input.projectId,
    requestedProvider: input.request.requestedProvider,
    requestedModel: input.request.requestedModel,
    unavailableMessage: 'No configured Proposal generation provider is available',
  });
  if (!resolved.ok) throw new ProposalGenerationProviderError(resolved.message);
  return createProposalGenerationModel(resolved);
}

/** Proposal generation over an already resolved provider: structured draft, trial apply, bounded re-ask. */
export function createProposalGenerationModel(resolved: {
  provider: Partial<LLMProvider>;
  providerId: string;
  model: string;
}): ProposalGenerationModel {
  const provider = resolved.provider;
  if (!('generateStructured' in provider) || typeof provider.generateStructured !== 'function') {
    throw new ProposalGenerationProviderError(
      `Provider ${resolved.providerId} does not support strict structured generation`
    );
  }
  return {
    provider: resolved.providerId,
    model: resolved.model,
    async generate(generation) {
      const basePrompt: LLMPrompt = {
        system: generation.prompt,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              profile: generation.profile,
              context: generation.context,
              base: generation.base,
              ...(generation.authoring ? { authoring: generation.authoring } : {}),
              yschema: generation.yschema.value,
              schemaLayout: generation.schemaLayout,
              sources: generation.sources.map((source, sourceIndex) => ({
                sourceIndex,
                resource: source.resource,
                title: source.title,
                content: source.content,
              })),
              instruction: generation.instruction,
              ...(generation.conversationTranscript
                ? { conversation: generation.conversationTranscript }
                : {}),
            }),
          },
        ],
      };
      let prompt = basePrompt;
      for (let attempt = 1; ; attempt += 1) {
        try {
          const result = await provider.generateStructured!(prompt, ProposalGenerationDraftSchema, {
            model: resolved.model,
            temperature: 0,
            maxTokens: 16_000,
          });
          const draft = completeExplicitCardContent(
            normalizeGeneratedClaims(result.data, generation.sources),
            generation.instruction,
            generation.schemaLayout
          );
          if (generation.authoring) {
            const operations = NativeYOpSchema.array().safeParse(
              draft.changes.flatMap((change) => change.operations)
            );
            const applied = operations.success
              ? applyNativeYOps(
                  generation.authoring.current,
                  operations.data as Parameters<typeof applyNativeYOps>[1]
                )
              : null;
            if (!operations.success || !applied?.ok) {
              throw new LLMProviderError(
                resolved.providerId,
                undefined,
                'Generated operations cannot be applied to the current Draft',
                'SCHEMA_MISMATCH',
                {
                  jsonText: JSON.stringify(draft),
                  issues: operations.success
                    ? [
                        {
                          path: ['changes', 'operations'],
                          message: applied?.error?.message ?? 'Invalid operation',
                        },
                      ]
                    : operations.error.issues,
                }
              );
            }
            const layoutIssues = newSemanticLayoutIssues(
              generation.authoring.current,
              applied.doc,
              generation.yschema.value,
              generation.schemaLayout.rootKey
            );
            if (layoutIssues.length > 0) {
              throw new LLMProviderError(
                resolved.providerId,
                undefined,
                'Generated operations place content outside the schema layout',
                'SCHEMA_MISMATCH',
                {
                  jsonText: JSON.stringify(draft),
                  issues: layoutIssues.map((issue) => ({
                    path: ['changes', 'operations'],
                    message: `${issue.code} at ${issue.path}: ${issue.message} Fix the operations so the result follows schemaLayout.`,
                  })),
                }
              );
            }
            const requestedContent = explicitCardFields(generation.instruction)?.content;
            if (requestedContent && !JSON.stringify(operations.data).includes(requestedContent)) {
              throw new LLMProviderError(
                resolved.providerId,
                undefined,
                'Generated card omitted explicitly requested content',
                'SCHEMA_MISMATCH',
                {
                  jsonText: JSON.stringify(draft),
                  issues: [
                    {
                      path: ['changes', 'operations'],
                      message: `Include the user-supplied card content ${JSON.stringify(requestedContent)} in the schema-valid node, separately from its title.`,
                    },
                  ],
                }
              );
            }
          }
          return {
            draft,
            usage: result.usage,
          };
        } catch (error) {
          if (!(error instanceof Error)) throw error;
          const failure = mapProviderErrorToExtractionFailure(resolved.providerId, error);
          // Reuse extraction's bounded, error-specific repair, not publication retries.
          if (failure.retry.strategy !== 'targeted_reask' || attempt >= failure.retry.maxAttempts) {
            throw error;
          }
          prompt = buildTargetedReaskPrompt(basePrompt, failure, {}, 'ProposalGenerationDraft');
        }
      }
    },
  };
}
