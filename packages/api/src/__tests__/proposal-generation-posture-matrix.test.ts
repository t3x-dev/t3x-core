import { createHash } from 'node:crypto';
import {
  compileProposalGenerationDraft,
  createYOpsEffect,
  createYOpsState,
  type ProposalGenerationPosture,
  proposalGenerationProfile,
  verifyProposalGenerationPosture,
} from '@t3x-dev/core';
import {
  describeProtocolObject,
  type ProtocolValue,
  type ResourceDescriptor,
} from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import { projectProposalGenerationReview } from '../lib/proposal-generation-projection';

type Origin = 'source_backed' | 'inferred' | 'recommended';
type Support = 'absent' | 'supported' | 'unsupported' | 'indeterminate';

type ContentShape = {
  id: string;
  label: string;
  field: string;
  before: string;
  after: string;
  origin: Origin;
  evidence: boolean;
  basis: boolean;
  support: Support;
};

type InteractionShape = {
  id: string;
  label: string;
  conflict: 'none' | 'source_disagreement' | 'explicit_claim_replacement';
  challenge: 'none' | 'matching' | 'misdirected';
};

type MatrixCase = {
  id: string;
  title: string;
  posture: ProposalGenerationPosture;
  content: ContentShape;
  interaction: InteractionShape;
};

const DIGEST = `sha256:${'a'.repeat(64)}` as const;
const SOURCE: ResourceDescriptor = {
  uri: 't3x://projects/posture-matrix/materials/product-brief',
  mediaType: 'text/plain;charset=utf-8',
  digest: DIGEST,
};
const MEMORY: ResourceDescriptor = {
  uri: 't3x://projects/posture-matrix/memories/research-summary',
  mediaType: 'text/plain;charset=utf-8',
  digest: `sha256:${'b'.repeat(64)}`,
};
const SEARCH_RESULT: ResourceDescriptor = {
  uri: 't3x://projects/posture-matrix/search/market-scan',
  mediaType: 'text/plain;charset=utf-8',
  digest: `sha256:${'c'.repeat(64)}`,
};
const POINTER = {
  sourceIndex: 0,
  locator: {
    scheme: 't3x.text-quote/v1',
    value: { quote: 'The product brief contains the cited decision.' },
  },
} as const;

/**
 * Ten materially different attribution/support states. These names are also
 * intended to be useful when the same corpus becomes WebUI acceptance data.
 */
const CONTENT_SHAPES: readonly ContentShape[] = [
  {
    id: 'supported-audience',
    label: 'supported source-backed audience',
    field: 'audience',
    before: 'general users',
    after: 'enterprise operators',
    origin: 'source_backed',
    evidence: true,
    basis: false,
    support: 'supported',
  },
  {
    id: 'unassessed-rollout',
    label: 'source-backed rollout without a support conclusion',
    field: 'rollout',
    before: 'big bang',
    after: 'phased rollout',
    origin: 'source_backed',
    evidence: true,
    basis: false,
    support: 'absent',
  },
  {
    id: 'unsupported-pricing',
    label: 'source-attributed pricing contradicted by its citation',
    field: 'pricing',
    before: 'free',
    after: 'annual contract',
    origin: 'source_backed',
    evidence: true,
    basis: false,
    support: 'unsupported',
  },
  {
    id: 'indeterminate-compliance',
    label: 'source-attributed compliance claim with indeterminate support',
    field: 'compliance',
    before: 'not assessed',
    after: 'soc2 required',
    origin: 'source_backed',
    evidence: true,
    basis: false,
    support: 'indeterminate',
  },
  {
    id: 'evidence-free-region',
    label: 'source-backed region missing immutable evidence',
    field: 'region',
    before: 'global',
    after: 'north america',
    origin: 'source_backed',
    evidence: false,
    basis: false,
    support: 'supported',
  },
  {
    id: 'grounded-persona-inference',
    label: 'inferred persona with an explicit research basis',
    field: 'persona',
    before: 'unknown',
    after: 'platform administrator',
    origin: 'inferred',
    evidence: false,
    basis: true,
    support: 'absent',
  },
  {
    id: 'ungrounded-timeline-inference',
    label: 'inferred timeline without evidence or basis',
    field: 'timeline',
    before: 'unscheduled',
    after: 'q4 launch',
    origin: 'inferred',
    evidence: false,
    basis: false,
    support: 'absent',
  },
  {
    id: 'evidence-grounded-metric-inference',
    label: 'inferred metric grounded directly in evidence',
    field: 'success_metric',
    before: 'undefined',
    after: 'weekly active teams',
    origin: 'inferred',
    evidence: true,
    basis: false,
    support: 'absent',
  },
  {
    id: 'open-onboarding-recommendation',
    label: 'explicit onboarding recommendation without source attribution',
    field: 'onboarding',
    before: 'manual setup',
    after: 'guided setup',
    origin: 'recommended',
    evidence: false,
    basis: false,
    support: 'absent',
  },
  {
    id: 'researched-integration-recommendation',
    label: 'explicit integration recommendation with evidence and basis',
    field: 'integration',
    before: 'none',
    after: 'github app',
    origin: 'recommended',
    evidence: true,
    basis: true,
    support: 'absent',
  },
] as const;

/** Five independent conflict/challenge states crossed with every content state. */
const INTERACTION_SHAPES: readonly InteractionShape[] = [
  {
    id: 'clean',
    label: 'without an observed conflict',
    conflict: 'none',
    challenge: 'none',
  },
  {
    id: 'source-disagreement',
    label: 'with a visible trusted-source disagreement',
    conflict: 'source_disagreement',
    challenge: 'none',
  },
  {
    id: 'silent-replacement',
    label: 'with an undisclosed explicit-claim replacement',
    conflict: 'explicit_claim_replacement',
    challenge: 'none',
  },
  {
    id: 'visible-replacement',
    label: 'with a matching visible replacement challenge',
    conflict: 'explicit_claim_replacement',
    challenge: 'matching',
  },
  {
    id: 'misdirected-replacement',
    label: 'with a challenge attached to the wrong path',
    conflict: 'explicit_claim_replacement',
    challenge: 'misdirected',
  },
] as const;

function matrix(posture: ProposalGenerationPosture): MatrixCase[] {
  return CONTENT_SHAPES.flatMap((content) =>
    INTERACTION_SHAPES.map((interaction) => ({
      id: `${posture}:${content.id}:${interaction.id}`,
      title: `${content.label} ${interaction.label}`,
      posture,
      content,
      interaction,
    }))
  );
}

const MATRICES = {
  source_only: matrix('source_only'),
  guided: matrix('guided'),
  recommend: matrix('recommend'),
} as const;

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function build(matrixCase: MatrixCase) {
  const { content, interaction, posture } = matrixCase;
  const path = `proposal/${content.field}`;
  const challengePath = interaction.challenge === 'misdirected' ? 'proposal/unrelated' : path;
  const base = createYOpsState({ proposal: { [content.field]: content.before } });
  const generated = createYOpsEffect({
    base,
    expectedBase: describeProtocolObject(base),
    operations: [{ set: { path, value: content.after } }],
  });
  const context = {
    schema: 't3x.dev/proposal-context-bundle/v1' as const,
    version: 1 as const,
    base: describeProtocolObject(base),
    yschema: {
      uri: 't3x://schemas/prd/v2',
      mediaType: 'application/json',
      digest: digest('prd-v2'),
    },
    sources: [SOURCE],
    memories: [MEMORY],
    searchResults: [SEARCH_RESULT],
    userInstruction: {
      uri: `t3x://requests/${matrixCase.id}`,
      mediaType: 'text/plain',
      digest: digest(matrixCase.id),
    },
    prompt: {
      uri: `t3x://prompts/proposal-generation/${posture}/v1`,
      mediaType: 'text/plain',
      digest: digest(`prompt:${posture}`),
    },
  };
  const evidencePointers = content.evidence ? [POINTER] : [];
  const compiled = compileProposalGenerationDraft({
    draft: {
      schema: 't3x.dev/proposal-generation-draft/v1',
      version: 1,
      posture,
      intent: {
        mode: 'authored',
        value: 'Build a reviewable product proposal',
        evidencePointers: [],
      },
      rationale: { mode: 'unspecified' },
      changes: [
        {
          id: content.id,
          operations: generated.effect.operations,
          claimedOrigin: content.origin,
          evidencePointers,
          basisPointers: content.basis ? [{ kind: 'memory' as const, index: 0 }] : [],
          assumptions:
            content.origin === 'source_backed'
              ? []
              : [`Review the ${content.field} ${content.origin} before accepting.`],
          reason: content.label,
          challenges:
            interaction.challenge === 'none'
              ? []
              : [
                  {
                    path: challengePath,
                    priorValue: content.before,
                    priorEvidencePointers: evidencePointers,
                    reason: interaction.label,
                    impactPaths: [path],
                  },
                ],
        },
      ],
      alternatives: [],
      warnings: [],
    },
    profile: proposalGenerationProfile(posture),
    context,
    requestedBy: { kind: 'human', id: 'user:matrix-reviewer' },
    generator: { kind: 'service', id: 'service:t3x-proposal-generator' },
    provider: 'matrix-provider',
    model: 'matrix-model',
    run: { id: `run:${matrixCase.id}`, recordedAt: '2026-08-13T00:00:00.000Z' },
    evidenceBindings: content.evidence
      ? [{ pointer: POINTER, evidence: { resource: SOURCE, locator: POINTER.locator } }]
      : [],
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  return { base, compiled, generated, path, challengePath };
}

/** Independent contract oracle, deliberately smaller than the production verifier. */
function expectedCodes(matrixCase: MatrixCase): string[] {
  const { posture, content, interaction } = matrixCase;
  const codes: string[] = [];
  if (posture === 'source_only' && content.origin !== 'source_backed') {
    codes.push('SOURCE_ONLY_ORIGIN_NOT_ALLOWED');
  }
  if (posture === 'source_only' && interaction.challenge !== 'none') {
    codes.push('SOURCE_ONLY_CHALLENGE_NOT_ALLOWED');
  }
  if (posture === 'guided' && interaction.challenge !== 'none') {
    codes.push('GUIDED_CHALLENGE_NOT_ALLOWED');
  }
  if (content.origin === 'source_backed') {
    if (!content.evidence) codes.push('SOURCE_EVIDENCE_REQUIRED');
    if (content.support === 'absent' || content.support === 'indeterminate') {
      codes.push('SOURCE_SUPPORT_REQUIRED');
    }
    if (content.support === 'unsupported') codes.push('SOURCE_SUPPORT_FAILED');
  }
  if (content.origin === 'inferred' && !content.evidence && !content.basis) {
    codes.push('INFERRED_BASIS_REQUIRED');
  }
  if (interaction.conflict === 'source_disagreement') codes.push('SOURCE_CONFLICT');
  if (interaction.conflict === 'explicit_claim_replacement') {
    if (posture !== 'recommend') codes.push('SOURCE_REPLACEMENT_NOT_ALLOWED');
    if (posture === 'recommend' && interaction.challenge !== 'matching') {
      codes.push('SILENT_CHALLENGE');
    }
  }
  return [...new Set(codes)].sort();
}

function supportAssessments(matrixCase: MatrixCase) {
  const { content } = matrixCase;
  if (content.support === 'absent') return [];
  return [
    {
      groupId: content.id,
      outcome: content.support,
      method: 'independent_verifier' as const,
    },
  ];
}

function conflicts(matrixCase: MatrixCase, path: string) {
  if (matrixCase.interaction.conflict === 'none') return [];
  return [
    {
      groupId: matrixCase.content.id,
      path,
      kind: matrixCase.interaction.conflict,
    },
  ];
}

describe('Proposal generation posture 50-case matrices', () => {
  it('contains exactly 50 unique and non-overlapping cases per posture', () => {
    for (const posture of ['source_only', 'guided', 'recommend'] as const) {
      expect(MATRICES[posture]).toHaveLength(50);
      expect(new Set(MATRICES[posture].map((matrixCase) => matrixCase.id))).toHaveLength(50);
    }
    const all = Object.values(MATRICES).flat();
    expect(all).toHaveLength(150);
    expect(new Set(all.map((matrixCase) => matrixCase.id))).toHaveLength(150);
  });

  for (const posture of ['source_only', 'guided', 'recommend'] as const) {
    describe(`${posture} — 50 compiler, policy, adversarial, and projection cases`, () => {
      it.each(MATRICES[posture])('$title', (matrixCase) => {
        const built = build(matrixCase);
        const report = verifyProposalGenerationPosture({
          preparation: built.compiled.preparation,
          sourceSupport: supportAssessments(matrixCase),
          conflicts: conflicts(matrixCase, built.path),
        });
        const codes = [...new Set(report.issues.map((issue) => issue.code))].sort();
        const expected = expectedCodes(matrixCase);
        const expectedFailure = expected.some((code) => code !== 'SOURCE_CONFLICT');

        expect(codes).toEqual(expected);
        expect(report.outcome).toBe(expectedFailure ? 'failed' : 'passed');
        expect(report.posture).toBe(posture);
        expect(report.counts).toEqual({
          sourceBacked: matrixCase.content.origin === 'source_backed' ? 1 : 0,
          inferred: matrixCase.content.origin === 'inferred' ? 1 : 0,
          recommended: matrixCase.content.origin === 'recommended' ? 1 : 0,
          challenges: matrixCase.interaction.challenge === 'none' ? 0 : 1,
        });

        const projection = projectProposalGenerationReview({
          preparationFacts: built.compiled.preparation as unknown as ProtocolValue,
          operations: built.generated.effect.operations,
          base: built.base.value,
          result: built.generated.result.value,
          observations: [],
        });
        expect(projection).not.toBeNull();
        expect(projection).toMatchObject({
          posture,
          counts: report.counts,
          verification: { status: 'pending', findings: [] },
        });
        expect(projection?.groups).toHaveLength(1);
        expect(projection?.groups[0]).toMatchObject({
          id: matrixCase.content.id,
          origin: matrixCase.content.origin,
          paths: [built.path],
          values: [
            {
              path: built.path,
              before: { availability: 'available', value: matrixCase.content.before },
              after: { availability: 'available', value: matrixCase.content.after },
              changed: true,
            },
          ],
        });
        expect(projection?.groups[0]?.challenges).toHaveLength(
          matrixCase.interaction.challenge === 'none' ? 0 : 1
        );
        if (matrixCase.interaction.challenge !== 'none') {
          expect(projection?.groups[0]?.challenges[0]?.path).toBe(built.challengePath);
        }
      });
    });
  }
});
