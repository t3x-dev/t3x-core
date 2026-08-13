import { createHash } from 'node:crypto';
import {
  canonicalizeProtocolValue,
  describeProtocolObject,
  type ProtocolValue,
  type ResourceDescriptor,
  SchemaInvalidError,
} from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import { createYOpsEffect, createYOpsState } from '../../transition-adapters';
import fixturesJson from '../__fixtures__/proposal-generation-postures-v1.json';
import { compileProposalDraft } from '../compiler';
import {
  compileProposalGenerationDraft,
  generationOperationPaths,
  type ProposalGenerationCompilationResult,
} from '../generationCompiler';
import {
  canonicalizeProposalGenerationPreparation,
  parseProposalGenerationDraft,
  parseProposalGenerationPreparation,
  proposalGenerationPreparationDigest,
  proposalGenerationPreparationResource,
} from '../generationDraft';
import { verifyProposalGenerationPosture } from '../generationPosture';
import {
  assertBuiltInProposalGenerationProfile,
  canonicalizeProposalGenerationProfile,
  proposalGenerationProfile,
  proposalGenerationProfileResource,
} from '../generationProfile';

type Fixture = {
  name: string;
  posture: 'source_only' | 'guided' | 'recommend';
  origin: 'source_backed' | 'inferred' | 'recommended';
  evidence: boolean;
  basis: boolean;
  challenge: boolean;
  support?: 'supported' | 'unsupported' | 'indeterminate';
  unknownSupport?: boolean;
  duplicateSupport?: boolean;
  expectedOutcome: 'passed' | 'failed';
  expectedCodes: string[];
};

const fixtures = fixturesJson as Fixture[];
const generator = { kind: 'service', id: 'service:t3x-proposal-generator' } as const;
const requester = { kind: 'human', id: 'user:reviewer' } as const;

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function resource(uri: string, content = uri): ResourceDescriptor {
  return { uri, mediaType: 'text/plain', digest: digest(content) };
}

function context() {
  const base = createYOpsState({ product: { audience: 'enterprise' } });
  return {
    base,
    bundle: {
      schema: 't3x.dev/proposal-context-bundle/v1' as const,
      version: 1 as const,
      base: describeProtocolObject(base),
      yschema: resource('t3x://schemas/prd/v1', 'schema'),
      sources: [resource('t3x://sources/interview/1', 'The launch audience is enterprise.')],
      memories: [resource('t3x://memories/project/1', 'Small delivery team')],
      searchResults: [resource('t3x://search/result/1', 'Market note')],
      userInstruction: resource('t3x://requests/generation/1', 'Create a launch PRD'),
      prompt: resource('t3x://prompts/proposal-generation/v1', 'Prompt'),
    },
  };
}

const pointer = {
  sourceIndex: 0,
  locator: {
    scheme: 't3x.text-quote/v1',
    value: { quote: 'The launch audience is enterprise.' },
  },
} as const;

function draft(fixture: Fixture) {
  return {
    schema: 't3x.dev/proposal-generation-draft/v1' as const,
    version: 1 as const,
    posture: fixture.posture,
    intent: { mode: 'authored' as const, value: 'Prepare the launch PRD', evidencePointers: [] },
    rationale: { mode: 'unspecified' as const },
    changes: [
      {
        id: 'audience',
        operations: [
          {
            set: {
              path: 'product/audience',
              value: fixture.challenge ? 'small_teams' : 'enterprise',
            },
          },
        ],
        claimedOrigin: fixture.origin,
        evidencePointers: fixture.evidence ? [pointer] : [],
        basisPointers: fixture.basis ? [{ kind: 'source' as const, index: 0 }] : [],
        assumptions: fixture.origin === 'recommended' ? ['The delivery team is small'] : [],
        reason: 'Produce a reviewable audience decision',
        challenges: fixture.challenge
          ? [
              {
                path: 'product/audience',
                priorValue: 'enterprise',
                priorEvidencePointers: fixture.evidence ? [pointer] : [],
                reason: 'Enterprise onboarding exceeds current delivery capacity',
                impactPaths: ['product/pricing', 'product/mvp'],
              },
            ]
          : [],
      },
    ],
    alternatives: [],
    warnings: [],
  };
}

function compileFixture(fixture: Fixture): ProposalGenerationCompilationResult {
  const { bundle } = context();
  return compileProposalGenerationDraft({
    draft: draft(fixture),
    profile: proposalGenerationProfile(fixture.posture),
    context: bundle,
    requestedBy: requester,
    generator,
    provider: 'openai',
    model: 'gpt-test',
    run: { id: `run:${fixture.name}`, recordedAt: '2026-08-13T00:00:00.000Z' },
    evidenceBindings: fixture.evidence
      ? [
          {
            pointer,
            evidence: { resource: bundle.sources[0], locator: pointer.locator },
          },
        ]
      : [],
  });
}

describe('Proposal Generation built-in profiles', () => {
  it('round-trips immutable canonical content and stable resource identity', () => {
    for (const posture of ['source_only', 'guided', 'recommend'] as const) {
      const first = proposalGenerationProfileResource(posture);
      const second = proposalGenerationProfileResource(posture);
      expect(canonicalizeProposalGenerationProfile(first.profile)).toBe(
        canonicalizeProposalGenerationProfile(second.profile)
      );
      expect(first.resource).toEqual(second.resource);
      expect(assertBuiltInProposalGenerationProfile(first.profile)).toEqual(first.profile);
    }
  });

  it('rejects caller-authored changes to a built-in profile', () => {
    const profile = proposalGenerationProfile('guided');
    expect(() =>
      assertBuiltInProposalGenerationProfile({ ...profile, sourceTreatment: 'may_challenge' })
    ).toThrow(SchemaInvalidError);
  });
});

describe('Proposal Generation compiler and preparation contract', () => {
  it('flattens Change Groups into canonical YOps with exact indexes and compiler-derived paths', () => {
    const compiled = compileFixture(fixtures[0]!);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.operations).toEqual([
      { set: { path: 'product/audience', value: 'enterprise' } },
    ]);
    expect(compiled.preparation.bindings[0]).toMatchObject({
      groupId: 'audience',
      operationIndexes: [0],
      paths: ['product/audience'],
      origin: 'source_backed',
    });
    expect(compiled.proposalDraft.review.sourceBindings[0]).toMatchObject({
      status: 'bound',
      operationIndexes: [0],
      paths: ['product/audience'],
    });
  });

  it('binds the generated Proposal to the stable generator actor, not the requester', () => {
    const compiled = compileFixture(fixtures[0]!);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const { base } = context();
    const effect = createYOpsEffect({ base, operations: compiled.operations }).effect;
    const proposal = compileProposalDraft({
      draft: compiled.proposalDraft,
      effect,
      actor: generator,
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;
    expect(proposal.proposal.actor).toEqual(generator);
    expect(compiled.preparation.requestedBy).toEqual(requester);
    expect(compiled.preparation.generator).toEqual(generator);
  });

  it('rejects an EvidenceRef that does not bind the pointer exact Source', () => {
    const fixture = fixtures[0]!;
    const { bundle } = context();
    const compiled = compileProposalGenerationDraft({
      draft: draft(fixture),
      profile: proposalGenerationProfile(fixture.posture),
      context: bundle,
      requestedBy: requester,
      generator,
      provider: 'openai',
      model: 'gpt-test',
      run: { id: 'run:forged', recordedAt: '2026-08-13T00:00:00.000Z' },
      evidenceBindings: [
        {
          pointer,
          evidence: {
            resource: resource('t3x://sources/other-project/1'),
            locator: pointer.locator,
          },
        },
      ],
    });
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.issues.map((issue) => issue.code)).toContain('EVIDENCE_BINDING_INVALID');
  });

  it('rejects source metadata, unknown fields, and private reasoning fields from model output', () => {
    const fixture = fixtures[0]!;
    const withSource = structuredClone(draft(fixture)) as Record<string, unknown>;
    const changes = withSource.changes as Array<Record<string, unknown>>;
    changes[0]!.operations = [
      {
        set: { path: 'product/audience', value: 'enterprise' },
        source: { type: 'llm', turn_ref: { turn_hash: 'forged', quote: 'forged' } },
      },
    ];
    const sourceResult = compileProposalGenerationDraft({
      draft: withSource,
      profile: proposalGenerationProfile('source_only'),
      context: context().bundle,
      requestedBy: requester,
      generator,
      provider: 'openai',
      model: 'gpt-test',
      run: { id: 'run:source', recordedAt: '2026-08-13T00:00:00.000Z' },
      evidenceBindings: [],
    });
    expect(sourceResult.ok).toBe(false);
    if (!sourceResult.ok) {
      expect(sourceResult.issues.map((issue) => issue.code)).toContain('OPERATION_INVALID');
    }

    expect(() =>
      parseProposalGenerationDraft({ ...draft(fixture), chainOfThought: 'private reasoning' })
    ).toThrow(SchemaInvalidError);
  });

  it('rejects posture drift and incomplete operation coverage', () => {
    const compiled = compileProposalGenerationDraft({
      draft: draft({ ...fixtures[0]!, posture: 'guided' }),
      profile: proposalGenerationProfile('source_only'),
      context: context().bundle,
      requestedBy: requester,
      generator,
      provider: 'openai',
      model: 'gpt-test',
      run: { id: 'run:drift', recordedAt: '2026-08-13T00:00:00.000Z' },
      evidenceBindings: [],
    });
    expect(compiled.ok).toBe(false);
    if (!compiled.ok) {
      expect(compiled.issues.map((issue) => issue.code)).toContain('POSTURE_MISMATCH');
    }

    const valid = compileFixture(fixtures[0]!);
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(() =>
      parseProposalGenerationPreparation({
        ...valid.preparation,
        operationCount: 2,
      })
    ).toThrow(/cover every operation index exactly once/);
  });

  it('derives two-path YOps from the native specification and represents root explicitly', () => {
    expect(generationOperationPaths({ move: { from: 'product/old', to: 'product/new' } })).toEqual([
      'product/new',
      'product/old',
    ]);
    expect(generationOperationPaths({ split: { path: '', into: { product: ['name'] } } })).toEqual([
      '$',
    ]);
  });

  it('canonicalizes and addresses the exact preparation bytes', () => {
    const compiled = compileFixture(fixtures[0]!);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const canonical = canonicalizeProposalGenerationPreparation(compiled.preparation);
    expect(canonical).toBe(canonicalizeProtocolValue(JSON.parse(canonical) as ProtocolValue));
    expect(proposalGenerationPreparationDigest(compiled.preparation)).toMatch(
      /^sha256:[0-9a-f]{64}$/
    );
    expect(
      proposalGenerationPreparationResource(
        compiled.preparation,
        't3x://transitions/test/generation-manifest'
      ).digest
    ).toBe(proposalGenerationPreparationDigest(compiled.preparation));
  });
});

describe('cross-posture evaluation corpus', () => {
  it.each(fixtures)('$name', (fixture) => {
    const compiled = compileFixture(fixture);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const sourceSupport: Array<Record<string, unknown>> = [];
    if (fixture.support !== undefined) {
      sourceSupport.push({
        groupId: 'audience',
        outcome: fixture.support,
        method: 'independent_verifier',
      });
    }
    if (fixture.unknownSupport) {
      sourceSupport.push({
        groupId: 'unknown-group',
        outcome: 'supported',
        method: 'independent_verifier',
      });
    }
    if (fixture.duplicateSupport && sourceSupport[0] !== undefined) {
      sourceSupport.push({ ...sourceSupport[0] });
    }
    const report = verifyProposalGenerationPosture({
      preparation: compiled.preparation,
      sourceSupport,
      conflicts: fixture.challenge
        ? [
            {
              groupId: 'audience',
              path: 'product/audience',
              kind: 'explicit_claim_replacement',
            },
          ]
        : [],
    });
    expect(report.outcome).toBe(fixture.expectedOutcome);
    const codes = report.issues.map((issue) => issue.code);
    for (const code of fixture.expectedCodes) expect(codes).toContain(code);
  });

  it('turns independently observed source disagreement into a visible non-winning warning', () => {
    const compiled = compileFixture(fixtures[7]!);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const report = verifyProposalGenerationPosture({
      preparation: compiled.preparation,
      sourceSupport: [
        { groupId: 'audience', outcome: 'supported', method: 'independent_verifier' },
      ],
      conflicts: [{ groupId: 'audience', path: 'product/audience', kind: 'source_disagreement' }],
    });
    expect(report.outcome).toBe('passed');
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: 'SOURCE_CONFLICT', severity: 'warning' })
    );
  });

  it('rejects an independently observed explicit-claim replacement in guided', () => {
    const compiled = compileFixture(fixtures[10]!);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const report = verifyProposalGenerationPosture({
      preparation: compiled.preparation,
      conflicts: [
        {
          groupId: 'audience',
          path: 'product/audience',
          kind: 'explicit_claim_replacement',
        },
      ],
    });
    expect(report.outcome).toBe('failed');
    expect(report.issues.map((issue) => issue.code)).toContain('SOURCE_REPLACEMENT_NOT_ALLOWED');
  });

  it('rejects a recommend replacement that was not exposed as a challenge', () => {
    const compiled = compileFixture(fixtures[15]!);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const report = verifyProposalGenerationPosture({
      preparation: compiled.preparation,
      conflicts: [
        {
          groupId: 'audience',
          path: 'product/audience',
          kind: 'explicit_claim_replacement',
        },
      ],
    });
    expect(report.outcome).toBe('failed');
    expect(report.issues.map((issue) => issue.code)).toContain('SILENT_CHALLENGE');
  });
});
