import {
  describeProtocolObject,
  type Effect,
  InMemoryObjectResolver,
  type ProposalStatement,
  type State,
} from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import { createDecisionStatement } from '../../transition-decisions/decision';
import {
  type AcceptancePolicy,
  createAcceptancePolicyResource,
  parseAcceptancePolicy,
} from '../../transition-decisions/policy';
import fixtures from '../../transition-statements/__fixtures__/profiles-v1.json';
import { buildReplayVerificationStatement } from '../../transition-statements/builders';
import {
  authorizeDecisionForRepository,
  createCommitV2,
  describeCommitV2,
  isRepositoryDecisionAuthorization,
  isRepositoryDecisionRecord,
  type RepositoryDecisionAuthority,
} from '..';

const DECIDED_AT = '2026-07-28T00:00:00.000Z';

function graph() {
  const base: State = {
    schema: 't3x/state/v1',
    codec: { mediaType: 'application/yaml', version: '1' },
    value: {},
  };
  const result: State = {
    ...base,
    value: { device: 'kitchen' },
  };
  const effect: Effect = {
    schema: 't3x/effect/v1',
    base: describeProtocolObject(base),
    driver: {
      protocol: 't3x.dev/test',
      protocolVersion: '1',
      specDigest: `sha256:${'a'.repeat(64)}`,
    },
    operations: [],
    inputs: [],
    result: describeProtocolObject(result),
  };
  const proposal: ProposalStatement = {
    schema: 't3x/statement/v1',
    subjects: [describeProtocolObject(effect)],
    actor: { kind: 'agent', id: 'agent:planner' },
    predicateType: 't3x.proposal/v1',
    predicate: {
      intent: { mode: 'inferred', value: 'Configure the kitchen device', evidence: [] },
      rationale: { mode: 'authored', value: 'Prepare the device', evidence: [] },
    },
  };
  const replay = buildReplayVerificationStatement({
    effect,
    actor: fixtures.replay.actor as { kind: 'service'; id: string },
    predicate: {
      ...fixtures.replay.predicate,
      outcome: 'verified',
      environment: { mode: 'unspecified' },
      result: effect.result,
    },
  });
  return { base, result, effect, proposal, replay };
}

function policy(validation: 'optional' | 'required' = 'optional'): AcceptancePolicy {
  return parseAcceptancePolicy({
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: { actors: { mode: 'any' } },
      override: { actors: { mode: 'any' } },
      allowSelfApproval: false,
    },
    claims: {
      intent: {
        allowedModes: ['inferred'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
      rationale: {
        allowedModes: ['authored'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
    },
    checks: {
      replay: {
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
      },
      validation: {
        requirement: validation,
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
        profiles: { mode: 'any' },
        schemas: { mode: 'any' },
        contexts: { mode: 'any' },
      },
      humanConfirmation: { issuers: { mode: 'any' } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: true,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: true,
    },
  });
}

function authority(
  actor: { kind: 'human' | 'agent'; id: string },
  options: { completeness?: 'complete' | 'partial'; validation?: 'optional' | 'required' } = {}
): RepositoryDecisionAuthority {
  const subject = graph();
  const bound = createAcceptancePolicyResource({
    policy: policy(options.validation),
    uri: 't3x://project/policies/default',
  });
  return {
    async resolve() {
      return {
        actorContext: { actor },
        observationScope: {
          completeness: options.completeness ?? 'complete',
          sources: ['project-store'],
        },
        policy: bound.policy,
        policyResource: bound.resource,
        statements: [{ statement: subject.replay, issuerContext: { actor: subject.replay.actor } }],
      };
    },
  };
}

describe('CommitV2 application boundary', () => {
  it('builds a verified CommitV2 separately from repository mutation', async () => {
    const subject = graph();
    const bound = createAcceptancePolicyResource({
      policy: policy(),
      uri: 't3x://project/policies/default',
    });
    const decision = createDecisionStatement({
      actorContext: { actor: { kind: 'human', id: 'human:maintainer' } },
      effect: subject.effect,
      observationScope: { completeness: 'complete', sources: ['project-store'] },
      outcome: 'accepted',
      policy: bound.policy,
      policyResource: bound.resource,
      proposal: subject.proposal,
      rationale: { mode: 'unspecified' },
      statements: [{ statement: subject.replay, issuerContext: { actor: subject.replay.actor } }],
      decidedAt: DECIDED_AT,
    });
    if (!decision.ok) throw new Error('fixture Decision was not permitted');
    const resolver = new InMemoryObjectResolver([
      subject.base,
      subject.result,
      subject.effect,
      subject.proposal,
      subject.replay,
    ]);
    const commit = await createCommitV2({ parents: [], decision: decision.decision, resolver });

    expect(commit).toEqual({
      schema: 't3x/commit/v2',
      parents: [],
      decision: describeProtocolObject(decision.decision),
      result: describeProtocolObject(subject.result),
    });
    expect(describeCommitV2(commit).digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('refuses rejected Decisions during pure CommitV2 creation', async () => {
    const subject = graph();
    const bound = createAcceptancePolicyResource({
      policy: policy(),
      uri: 't3x://project/policies/default',
    });
    const rejected = createDecisionStatement({
      actorContext: { actor: { kind: 'human', id: 'human:maintainer' } },
      effect: subject.effect,
      observationScope: { completeness: 'complete', sources: ['project-store'] },
      outcome: 'rejected',
      policy: bound.policy,
      policyResource: bound.resource,
      proposal: subject.proposal,
      rationale: { mode: 'unspecified' },
      statements: [],
      decidedAt: DECIDED_AT,
    });
    if (!rejected.ok) throw new Error('fixture rejection was not permitted');
    const resolver = new InMemoryObjectResolver([
      subject.base,
      subject.result,
      subject.effect,
      subject.proposal,
    ]);
    await expect(
      createCommitV2({ parents: [], decision: rejected.decision, resolver })
    ).rejects.toMatchObject({ code: 'INTEGRITY_CHAIN_INVALID' });
  });

  it('takes policy, actor, issuer, and scope only from the trusted authority', async () => {
    const subject = graph();
    const result = await authorizeDecisionForRepository({
      projectId: 'project:test',
      refName: 'main',
      proposal: subject.proposal,
      effect: subject.effect,
      outcome: 'accepted',
      rationale: { mode: 'unspecified' },
      decidedAt: DECIDED_AT,
      authority: authority({ kind: 'human', id: 'human:trusted' }),
      // Adversarial request-shaped shadow fields are ignored by the compiler.
      actorContext: { actor: { kind: 'agent', id: 'agent:spoofed' } },
      observationScope: { completeness: 'partial', sources: ['client'] },
      policy: policy('required'),
    } as Parameters<typeof authorizeDecisionForRepository>[0]);

    expect(result).toMatchObject({
      ok: true,
      decision: { actor: { kind: 'human', id: 'human:trusted' } },
      authorization: { observationScope: { completeness: 'complete' } },
    });
    if (!result.ok || result.authorization === null) throw new Error('authorization missing');
    expect(isRepositoryDecisionAuthorization(result.authorization)).toBe(true);
    expect(result.authorization.observations).toHaveLength(
      result.authorization.evaluation.considered.length
    );
    expect(
      result.authorization.observations.map((observation) => observation.issuerContext.actor)
    ).toContainEqual(fixtures.replay.actor);
    const authorizedDecision = describeProtocolObject(result.authorization.decision).digest;
    result.decision.actor.id = 'human:mutated-after-issuance';
    expect(describeProtocolObject(result.authorization.decision).digest).toBe(authorizedDecision);
    expect(() => {
      (result.authorization?.evaluation.actor as { id: string }).id = 'human:mutated-capability';
    }).toThrow(TypeError);
    expect(
      isRepositoryDecisionAuthorization({
        ...result.authorization,
        projectId: 'project:forged',
      })
    ).toBe(false);

    const partial = await authorizeDecisionForRepository({
      projectId: 'project:test',
      refName: 'main',
      proposal: subject.proposal,
      effect: subject.effect,
      outcome: 'accepted',
      rationale: { mode: 'unspecified' },
      decidedAt: DECIDED_AT,
      authority: authority({ kind: 'human', id: 'human:trusted' }, { completeness: 'partial' }),
    });
    expect(partial.ok).toBe(false);
  });

  it('records every trusted outcome while authorizing only accepted and overridden Decisions', async () => {
    const subject = graph();
    const accepted = await authorizeDecisionForRepository({
      projectId: 'project:test',
      refName: 'main',
      proposal: subject.proposal,
      effect: subject.effect,
      outcome: 'accepted',
      rationale: { mode: 'unspecified' },
      decidedAt: DECIDED_AT,
      authority: authority({ kind: 'human', id: 'human:maintainer' }),
    });
    const overridden = await authorizeDecisionForRepository({
      projectId: 'project:test',
      refName: 'main',
      proposal: subject.proposal,
      effect: subject.effect,
      outcome: 'overridden',
      rationale: { mode: 'authored', value: 'Accept missing validation', evidence: [] },
      decidedAt: DECIDED_AT,
      authority: authority({ kind: 'agent', id: 'agent:release-bot' }, { validation: 'required' }),
    });
    const rejected = await authorizeDecisionForRepository({
      projectId: 'project:test',
      refName: 'main',
      proposal: subject.proposal,
      effect: subject.effect,
      outcome: 'rejected',
      rationale: { mode: 'authored', value: 'Needs revision', evidence: [] },
      decidedAt: DECIDED_AT,
      authority: authority({ kind: 'human', id: 'human:maintainer' }),
    });
    expect(accepted).toMatchObject({
      ok: true,
      authorization: { decision: { schema: 't3x/statement/v1' } },
    });
    expect(overridden).toMatchObject({
      ok: true,
      authorization: { decision: { schema: 't3x/statement/v1' } },
    });
    expect(rejected).toMatchObject({
      ok: true,
      record: { decision: { predicate: { outcome: 'rejected' } } },
      authorization: null,
    });
    if (!accepted.ok || !overridden.ok || !rejected.ok) {
      throw new Error('fixture authorization failed');
    }
    expect(accepted.record).toBe(accepted.authorization);
    expect(isRepositoryDecisionRecord(accepted.record)).toBe(true);
    expect(isRepositoryDecisionRecord(rejected.record)).toBe(true);
    expect(isRepositoryDecisionAuthorization(rejected.record)).toBe(false);
    expect(isRepositoryDecisionRecord({ ...rejected.record })).toBe(false);
    expect(Object.keys(accepted.decision).sort()).toEqual(Object.keys(overridden.decision).sort());
  });
});
