import {
  compileProposalDraft,
  compileProposalGenerationDraft,
  createYOpsEffect,
  createYOpsState,
  parseRunnerValidationStatement,
  proposalGenerationProfile,
} from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import { describeProtocolObject, type ProtocolValue } from '@t3x-dev/transition';
import { describe, expect, it, vi } from 'vitest';
import {
  createProposalGenerationPostureProvider,
  type ProposalGenerationSupportVerifier,
} from '../lib/proposal-generation-posture-provider';
import { projectProposalGenerationReview } from '../lib/proposal-generation-projection';
import {
  PROPOSAL_POSTURE_VERIFIER_ACTOR,
  PROPOSAL_POSTURE_VERIFIER_ENVIRONMENT,
  PROPOSAL_POSTURE_VERIFIER_TOOL,
  PROPOSAL_POSTURE_VERIFIER_WORKFLOW,
} from '../lib/transition-control-plane/applicable-policy';

const DIGEST = `sha256:${'a'.repeat(64)}` as const;
const source = {
  uri: 't3x://projects/project-1/materials/source-1',
  mediaType: 'text/plain;charset=utf-8',
  digest: DIGEST,
};
const pointer = {
  sourceIndex: 0,
  locator: {
    scheme: 't3x.text-quote/v1',
    value: { quote: 'The launch audience is enterprise operators.' },
  },
};

function graph(input: {
  posture?: 'source_only' | 'guided' | 'recommend';
  value?: string;
  base?: ProtocolValue;
}) {
  const posture = input.posture ?? 'guided';
  const base = createYOpsState(input.base ?? {});
  const generated = createYOpsEffect({
    base,
    operations: [{ set: { path: 'prd/audience', value: input.value ?? 'enterprise operators' } }],
    expectedBase: describeProtocolObject(base),
  });
  const context = {
    schema: 't3x.dev/proposal-context-bundle/v1' as const,
    version: 1 as const,
    base: describeProtocolObject(base),
    yschema: { uri: 't3x://schemas/prd/v2', mediaType: 'application/json', digest: DIGEST },
    sources: [source],
    memories: [],
    searchResults: [],
    userInstruction: {
      uri: 't3x://instructions/1',
      mediaType: 'text/plain',
      digest: DIGEST,
    },
    prompt: { uri: 't3x://prompts/1', mediaType: 'text/plain', digest: DIGEST },
  };
  const compiled = compileProposalGenerationDraft({
    draft: {
      schema: 't3x.dev/proposal-generation-draft/v1',
      version: 1,
      posture,
      intent: {
        mode: 'stated',
        value: 'Target enterprise operators',
        evidencePointers: [pointer],
      },
      rationale: { mode: 'authored', value: 'Structure the source', evidencePointers: [] },
      changes: [
        {
          id: 'audience',
          operations: generated.effect.operations,
          claimedOrigin: 'source_backed',
          evidencePointers: [pointer],
          basisPointers: [],
          assumptions: [],
          reason: 'The source explicitly names the audience',
          challenges: [],
        },
      ],
      warnings: [],
    },
    profile: proposalGenerationProfile(posture),
    context,
    requestedBy: { kind: 'human', id: 'user:requester' },
    generator: { kind: 'service', id: 'service:t3x-proposal-generator' },
    provider: 'generator-provider',
    model: 'generator-model',
    run: { id: 'generation-run', recordedAt: '2026-08-13T00:00:00.000Z' },
    evidenceBindings: [
      {
        pointer,
        evidence: { resource: source, locator: pointer.locator },
      },
    ],
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const proposal = compileProposalDraft({
    draft: compiled.proposalDraft,
    effect: generated.effect,
    actor: { kind: 'service', id: 'service:t3x-proposal-generator' },
  });
  if (!proposal.ok) throw new Error(JSON.stringify(proposal.issues));
  return { base, generated, preparation: compiled.preparation, proposal: proposal.proposal };
}

async function verify(
  built: ReturnType<typeof graph>,
  supportVerifier?: ProposalGenerationSupportVerifier
) {
  return createProposalGenerationPostureProvider({ supportVerifier }).verify({
    db: {} as AnyDB,
    transitionId: 'trn_test',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    requestKind: 'structured_yops',
    requestFacts: { schema: 't3x.dev/proposal-generation-request/v1' },
    preparationFacts: built.preparation as unknown as ProtocolValue,
    effect: built.generated.effect,
    base: built.base,
    result: built.generated.result,
    proposal: built.proposal,
    run: { id: 'verification-run', recordedAt: '2026-08-13T01:00:00.000Z' },
  });
}

describe('Proposal generation posture provider', () => {
  it('issues the exact required runner Statement for deterministic source support', async () => {
    const result = await verify(graph({}));
    expect(result.outcome).toBe('statement');
    if (result.outcome !== 'statement') return;
    const predicate = parseRunnerValidationStatement(result.statement).predicate;
    expect(result.statement.actor).toEqual(PROPOSAL_POSTURE_VERIFIER_ACTOR);
    expect(predicate).toMatchObject({
      outcome: 'passed',
      tool: PROPOSAL_POSTURE_VERIFIER_TOOL,
      workflow: PROPOSAL_POSTURE_VERIFIER_WORKFLOW,
      environment: PROPOSAL_POSTURE_VERIFIER_ENVIRONMENT,
    });
  });

  it('refuses generator self-verification and emits a failed source_only conclusion', async () => {
    const assess = vi.fn(async () => 'supported' as const);
    const result = await verify(graph({ posture: 'source_only', value: 'small businesses' }), {
      provider: 'generator-provider',
      model: 'generator-model',
      assess,
    });
    expect(assess).not.toHaveBeenCalled();
    expect(result.outcome).toBe('statement');
    if (result.outcome !== 'statement') return;
    const predicate = parseRunnerValidationStatement(result.statement).predicate;
    expect(predicate.outcome).toBe('failed');
    expect(predicate.findings.map((finding) => finding.code)).toContain('SOURCE_SUPPORT_REQUIRED');
  });

  it('accepts a conclusive independent support assessment', async () => {
    const assess = vi.fn(async () => 'supported' as const);
    const result = await verify(graph({ posture: 'source_only', value: 'target operators' }), {
      provider: 'independent-provider',
      model: 'independent-model',
      assess,
    });
    expect(assess).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('statement');
    if (result.outcome !== 'statement') return;
    expect(parseRunnerValidationStatement(result.statement).predicate.outcome).toBe('passed');
  });

  it('reports immutable Base replacements independently of posture support', async () => {
    const result = await verify(
      graph({ base: { prd: { audience: 'existing users' } }, value: 'enterprise operators' })
    );
    expect(result.outcome).toBe('statement');
    if (result.outcome !== 'statement') return;
    const predicate = parseRunnerValidationStatement(result.statement).predicate;
    expect(predicate.outcome).toBe('failed');
    expect(predicate.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(['SOURCE_REPLACEMENT_NOT_ALLOWED', 'BASE_VALUE_CONFLICT'])
    );
  });

  it('is not applicable to ordinary Transition preparation facts', async () => {
    const built = graph({});
    const provider = createProposalGenerationPostureProvider();
    await expect(
      provider.verify({
        db: {} as AnyDB,
        transitionId: 'trn_test',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        requestKind: 'structured_yops',
        requestFacts: {},
        preparationFacts: null,
        effect: built.generated.effect,
        base: built.base,
        result: built.generated.result,
        proposal: built.proposal,
        run: { id: 'verification-run', recordedAt: '2026-08-13T01:00:00.000Z' },
      })
    ).resolves.toEqual({ outcome: 'not_applicable' });
  });

  it('projects origin-aware Change Groups, before/after values, and verifier findings', async () => {
    const built = graph({});
    const verified = await verify(built);
    if (verified.outcome !== 'statement') throw new Error('Expected posture Statement');
    const projection = projectProposalGenerationReview({
      preparationFacts: built.preparation as unknown as ProtocolValue,
      operations: built.generated.effect.operations,
      base: built.base.value,
      result: built.generated.result.value,
      statements: [verified.statement],
    });

    expect(projection).toMatchObject({
      posture: 'guided',
      requestedBy: { kind: 'human', id: 'user:requester' },
      generator: { kind: 'service', id: 'service:t3x-proposal-generator' },
      counts: { sourceBacked: 1, inferred: 0, recommended: 0, challenges: 0 },
      verification: { status: 'passed', findings: [] },
    });
    expect(projection?.groups[0]).toMatchObject({
      id: 'audience',
      origin: 'source_backed',
      operationIndexes: [0],
      paths: ['prd/audience'],
      values: [
        {
          path: 'prd/audience',
          before: { availability: 'unavailable' },
          after: { availability: 'available', value: 'enterprise operators' },
          changed: true,
        },
      ],
    });
  });

  it('marks absent prior lineage as unavailable instead of inventing evidence', () => {
    const built = graph({ posture: 'recommend' });
    const preparation = structuredClone(built.preparation);
    preparation.bindings[0]!.challenges = [
      {
        path: 'prd/audience',
        priorValue: 'existing audience',
        priorEvidence: [],
        reason: 'Recommend a narrower audience',
        impactPaths: ['prd/audience'],
      },
    ];
    const projection = projectProposalGenerationReview({
      preparationFacts: preparation as unknown as ProtocolValue,
      operations: built.generated.effect.operations,
      base: built.base.value,
      result: built.generated.result.value,
      statements: [],
    });

    expect(projection?.verification.status).toBe('pending');
    expect(projection?.groups[0]?.challenges[0]).toMatchObject({
      priorEvidence: [],
      priorEvidenceAvailability: 'unavailable',
    });
  });
});
