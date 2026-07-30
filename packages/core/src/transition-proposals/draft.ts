import {
  canonicalizeProtocolValue,
  type Digest,
  type EvidenceRef,
  type ProtocolValue,
} from '@t3x-dev/transition';
import { z } from 'zod';

export const PROPOSAL_DRAFT_SCHEMA = 't3x/proposal-draft' as const;
export const PROPOSAL_COMPILATION_REPORT_SCHEMA = 't3x/proposal-compilation-report' as const;

const digestSchema = z.custom<Digest>(
  (value) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value),
  'Expected a lowercase sha256 digest'
);
const nonEmptyStringSchema = z.string().min(1);
const protocolValueSchema = z.custom<ProtocolValue>((value) => {
  try {
    canonicalizeProtocolValue(value as ProtocolValue);
    return true;
  } catch {
    return false;
  }
}, 'Expected an RFC 8785-compatible value');

const resourceDescriptorSchema = z
  .object({
    uri: nonEmptyStringSchema,
    mediaType: nonEmptyStringSchema,
    digest: digestSchema,
  })
  .strict();

const evidenceRefSchema: z.ZodType<EvidenceRef> = z
  .object({
    resource: resourceDescriptorSchema,
    locator: z
      .object({
        scheme: nonEmptyStringSchema,
        value: protocolValueSchema,
      })
      .strict(),
  })
  .strict();

const incompleteClaimSchema = z
  .object({
    mode: z.enum(['stated', 'inferred', 'authored']),
    value: nonEmptyStringSchema.optional(),
    evidence: z.array(evidenceRefSchema).optional(),
  })
  .strict();

export const DraftStringClaimSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('unspecified') }).strict(),
  incompleteClaimSchema,
]);

export const ProposalDraftSourceBindingSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('bound'),
      claim: z.enum(['intent', 'rationale', 'unassigned']),
      evidence: evidenceRefSchema,
      operationIndexes: z.array(z.number().int().nonnegative()),
      paths: z.array(nonEmptyStringSchema),
    })
    .strict(),
  z
    .object({
      status: z.literal('unverified'),
      claim: z.enum(['intent', 'rationale', 'unassigned']),
      source: z
        .object({
          kind: z.literal('legacy-extraction'),
          itemId: nonEmptyStringSchema,
          turnTag: nonEmptyStringSchema,
          quote: nonEmptyStringSchema,
          role: z.enum(['primary', 'supporting']),
        })
        .strict(),
      reason: nonEmptyStringSchema,
      operationIndexes: z.array(z.number().int().nonnegative()),
      paths: z.array(nonEmptyStringSchema),
    })
    .strict(),
]);

export const ProposalDraftSchema = z
  .object({
    schema: z.literal(PROPOSAL_DRAFT_SCHEMA),
    version: z.literal(1),
    intent: DraftStringClaimSchema,
    rationale: DraftStringClaimSchema,
    review: z
      .object({
        unresolvedQuestions: z.array(nonEmptyStringSchema),
        warnings: z.array(nonEmptyStringSchema),
        sourceBindings: z.array(ProposalDraftSourceBindingSchema),
        calibration: protocolValueSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type DraftStringClaim = z.infer<typeof DraftStringClaimSchema>;
export type ProposalDraftSourceBinding = z.infer<typeof ProposalDraftSourceBindingSchema>;
export type ProposalDraft = z.infer<typeof ProposalDraftSchema>;

export interface LegacyExtractionCompilationContext {
  schema: 't3x/extraction-draft';
  version: 1;
  mode: 'bootstrap' | 'incremental';
  items: Array<{
    id: string;
    operationKind: 'add' | 'update' | 'remove' | 'reinforce' | 'noop';
    confidence: number;
    reasoningType: 'direct' | 'paraphrase' | 'cross_turn' | 'implicit';
  }>;
}

export interface ProposalCompilationContext {
  legacyExtraction?: LegacyExtractionCompilationContext;
}

export type ProposalCompileIssueCode =
  | 'DRAFT_INVALID'
  | 'CLAIM_VALUE_REQUIRED'
  | 'CLAIM_EVIDENCE_REQUIRED'
  | 'STATED_EVIDENCE_REQUIRED'
  | 'PROTOCOL_INVALID';

export interface ProposalCompileIssue {
  code: ProposalCompileIssueCode;
  path: string;
  message: string;
}

export interface ProposalCompilationReport {
  schema: typeof PROPOSAL_COMPILATION_REPORT_SCHEMA;
  version: 1;
  unresolvedQuestions: string[];
  warnings: string[];
  sourceCoverage: {
    intent: { bound: number; unverified: number };
    rationale: { bound: number; unverified: number };
    unassigned: { bound: number; unverified: number };
  };
  legacyExtraction?: LegacyExtractionCompilationContext;
}

export function emptyProposalReview(): ProposalDraft['review'] {
  return {
    unresolvedQuestions: [],
    warnings: [],
    sourceBindings: [],
  };
}
