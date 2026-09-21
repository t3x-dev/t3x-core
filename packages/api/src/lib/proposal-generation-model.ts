import { ProposalGenerationDraftSchema, type ProposalGenerationDraftV1 } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  type ProposalGenerationModel,
  ProposalGenerationProviderError,
  type ProposalGenerationRequest,
} from './proposal-generation';
import { resolveProviderAndModel } from './provider-resolver';

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
      const result = await provider.generateStructured!(
        {
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
                sources: generation.sources.map((source, sourceIndex) => ({
                  sourceIndex,
                  resource: source.resource,
                  title: source.title,
                  content: source.content,
                })),
                instruction: generation.instruction,
              }),
            },
          ],
        },
        ProposalGenerationDraftSchema,
        { model: resolved.model, temperature: 0, maxTokens: 16_000 }
      );
      return {
        draft: normalizeGeneratedClaims(result.data, generation.sources),
        usage: result.usage,
      };
    },
  };
}
