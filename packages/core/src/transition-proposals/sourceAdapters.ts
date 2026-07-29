import { createHash } from 'node:crypto';
import type { EvidenceRef, ResourceDescriptor } from '@t3x-dev/transition';
import {
  type DraftEvidence,
  type ExtractionDraft,
  ExtractionDraftSchema,
} from '../extractors/v2/types';
import type { LLMSource } from '../t3x-yops/source';
import {
  type DraftStringClaim,
  emptyProposalReview,
  type ProposalCompilationContext,
  type ProposalDraft,
} from './draft';

export interface VerifiedTurnResource {
  resource: ResourceDescriptor;
  content: string;
}

function digestText(content: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

function bindQuoteEvidence(input: { quote: string; turn: VerifiedTurnResource }): EvidenceRef {
  const actualDigest = digestText(input.turn.content);
  if (actualDigest !== input.turn.resource.digest) {
    throw new Error(
      `Turn resource digest ${input.turn.resource.digest} does not match supplied content ${actualDigest}`
    );
  }
  if (!input.turn.content.includes(input.quote)) {
    throw new Error('Extraction quote is not present in the immutable turn resource');
  }
  return {
    resource: input.turn.resource,
    locator: {
      scheme: 't3x.text-quote/v1',
      value: { quote: input.quote },
    },
  };
}

/** Verify bytes and quote before turning extraction provenance into EvidenceRef. */
export function bindTurnEvidence(input: {
  evidence: DraftEvidence;
  turn: VerifiedTurnResource;
}): EvidenceRef {
  return bindQuoteEvidence({ quote: input.evidence.quote, turn: input.turn });
}

/** Map existing SourcedYOp LLM provenance only after its turn hash is proven. */
export function bindLLMSourceEvidence(input: {
  source: LLMSource;
  turn: VerifiedTurnResource;
}): EvidenceRef {
  if (input.source.turn_ref.turn_hash !== input.turn.resource.digest) {
    throw new Error('SourcedYOp turn hash does not match the immutable turn resource');
  }
  return bindQuoteEvidence({ quote: input.source.turn_ref.quote, turn: input.turn });
}

export function createHumanProposalDraft(
  input: { why?: string; intent?: string } = {}
): ProposalDraft {
  return {
    schema: 't3x/proposal-draft',
    version: 1,
    intent:
      input.intent === undefined
        ? { mode: 'unspecified' }
        : { mode: 'authored', value: input.intent, evidence: [] },
    rationale:
      input.why === undefined
        ? { mode: 'unspecified' }
        : { mode: 'authored', value: input.why, evidence: [] },
    review: emptyProposalReview(),
  };
}

export interface LegacyExtractionProposalMapping {
  draft: ProposalDraft;
  context: ProposalCompilationContext;
}

/**
 * Keeps historical extraction intent as operation classification only. The
 * adapter never promotes extraction quotes into intent/rationale Claims.
 */
export function createLegacyExtractionProposalDraft(input: {
  extraction: ExtractionDraft;
  claims?: { intent?: DraftStringClaim; rationale?: DraftStringClaim };
  unresolvedQuestions?: string[];
  turnResources?: Record<string, VerifiedTurnResource>;
}): LegacyExtractionProposalMapping {
  const extraction = ExtractionDraftSchema.parse(input.extraction);
  const review = emptyProposalReview();
  review.unresolvedQuestions = [...(input.unresolvedQuestions ?? [])];
  review.warnings = [...(extraction.warnings ?? [])];

  for (const item of extraction.items) {
    for (const evidence of item.evidence) {
      const turn = input.turnResources?.[evidence.turn_tag];
      if (turn === undefined) {
        review.sourceBindings.push({
          status: 'unverified',
          claim: 'unassigned',
          source: {
            kind: 'legacy-extraction',
            itemId: item.id,
            turnTag: evidence.turn_tag,
            quote: evidence.quote,
            role: evidence.role,
          },
          reason: 'No verified immutable turn resource was supplied',
          operationIndexes: [],
          paths: [],
        });
        continue;
      }
      try {
        review.sourceBindings.push({
          status: 'bound',
          claim: 'unassigned',
          evidence: bindTurnEvidence({ evidence, turn }),
          operationIndexes: [],
          paths: [],
        });
      } catch (error) {
        review.sourceBindings.push({
          status: 'unverified',
          claim: 'unassigned',
          source: {
            kind: 'legacy-extraction',
            itemId: item.id,
            turnTag: evidence.turn_tag,
            quote: evidence.quote,
            role: evidence.role,
          },
          reason: error instanceof Error ? error.message : 'Turn evidence verification failed',
          operationIndexes: [],
          paths: [],
        });
      }
    }
  }

  return {
    draft: {
      schema: 't3x/proposal-draft',
      version: 1,
      intent: input.claims?.intent ?? { mode: 'unspecified' },
      rationale: input.claims?.rationale ?? { mode: 'unspecified' },
      review,
    },
    context: {
      legacyExtraction: {
        schema: extraction.schema,
        version: extraction.version,
        mode: extraction.mode,
        items: extraction.items.map((item) => ({
          id: item.id,
          operationKind: item.intent,
          confidence: item.confidence,
          reasoningType: item.reasoning_type,
        })),
      },
    },
  };
}
