import {
  describeProtocolObject,
  type Effect,
  type ProposalStatement,
  parseEffect,
  parseProposalStatement,
  parseState,
  type State,
  type Statement,
} from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import fixtures from '../../transition-statements/__fixtures__/profiles-v1.json';
import {
  buildHumanConfirmationStatement,
  buildReplayVerificationStatement,
  buildYSchemaValidationStatement,
} from '../../transition-statements/builders';
import type { YSchemaValidationStatement } from '../../transition-statements/profiles';
import { createDecisionStatement } from '../decision';
import {
  deriveDecisionCapabilities,
  type EvaluateAcceptanceInput,
  evaluateAcceptance,
  type StatementObservation,
} from '../evaluation';
import {
  type AcceptancePolicy,
  createAcceptancePolicyResource,
  parseAcceptancePolicy,
} from '../policy';

const DECIDED_AT = '2026-07-28T00:00:00.000Z';

function state(name: string): State {
  return parseState({
    schema: 't3x/state/v1',
    codec: { mediaType: 'application/yaml', version: '1' },
    value: { device: name },
  });
}

function graph(proposer = { kind: 'agent' as const, id: 'agent:planner' }): {
  base: State;
  result: State;
  effect: Effect;
  proposal: ProposalStatement;
} {
  const base = state('before');
  const result = state('after');
  const effect = parseEffect({
    schema: 't3x/effect/v1',
    base: describeProtocolObject(base),
    result: describeProtocolObject(result),
    driver: {
      protocol: 'yops',
      protocolVersion: '1',
      specDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    operations: [{ set: { path: 'device', value: 'after' } }],
    inputs: [],
  });
  const proposal = parseProposalStatement({
    schema: 't3x/statement/v1',
    subjects: [describeProtocolObject(effect)],
    actor: proposer,
    predicateType: 't3x.proposal/v1',
    predicate: {
      intent: { mode: 'inferred', value: 'Update the device', evidence: [] },
      rationale: { mode: 'authored', value: 'Prepare the release', evidence: [] },
    },
  });
  return { base, result, effect, proposal };
}

function policy(overrides: Partial<AcceptancePolicy> = {}): AcceptancePolicy {
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
        allowedModes: ['inferred', 'stated'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
      rationale: {
        allowedModes: ['authored', 'stated'],
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
        requirement: 'required',
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
    ...overrides,
  });
}

function replay(effect: Effect, outcome: 'false' | 'unsupported' | 'verified' = 'verified') {
  const base = fixtures.replay.predicate;
  const { result: _result, ...runMetadata } = base;
  return buildReplayVerificationStatement({
    effect,
    actor: fixtures.replay.actor,
    predicate:
      outcome === 'verified'
        ? { ...base, result: effect.result }
        : {
            ...runMetadata,
            outcome,
            reason: `${outcome} replay`,
          },
  });
}

function validation(result: State, outcome: 'failed' | 'passed' = 'passed') {
  const base = fixtures.yschema.predicate;
  return buildYSchemaValidationStatement({
    state: result,
    actor: fixtures.yschema.actor,
    predicate:
      outcome === 'passed'
        ? base
        : {
            ...base,
            outcome: 'failed',
            valid: true,
            ready: false,
            run: { ...base.run, id: 'run:failed' },
            gaps: [
              {
                code: 'REQUIRED_SLOT_MISSING',
                path: 'device/name',
                message: 'Required slot is missing.',
              },
            ],
          },
  });
}

function observe(statement: Statement): StatementObservation {
  return {
    statement,
    issuerContext: { actor: statement.actor },
  };
}

function input(outcome: EvaluateAcceptanceInput['outcome'] = 'accepted'): EvaluateAcceptanceInput {
  const subject = graph();
  const bound = createAcceptancePolicyResource({
    policy: policy(),
    uri: 't3x://project/policies/default',
  });
  return {
    actorContext: {
      actor: { kind: 'human', id: 'human:maintainer' },
    },
    effect: subject.effect,
    observationScope: { completeness: 'complete', sources: ['project-store'] },
    outcome,
    policy: bound.policy,
    policyResource: bound.resource,
    proposal: subject.proposal,
    rationale:
      outcome === 'overridden'
        ? { mode: 'authored', value: 'Accept the known validation gap', evidence: [] }
        : { mode: 'unspecified' },
    statements: [observe(replay(subject.effect)), observe(validation(subject.result))],
  };
}

describe('AcceptancePolicy', () => {
  it('is closed, versioned, content-addressed, and rejects noncanonical sets', () => {
    const bound = createAcceptancePolicyResource({
      policy: policy(),
      uri: 't3x://project/policies/default',
    });
    expect(bound.resource).toMatchObject({
      mediaType: 'application/vnd.t3x.acceptance-policy+json',
      digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
    expect(() =>
      parseAcceptancePolicy({
        ...policy(),
        claims: {
          ...policy().claims,
          intent: { ...policy().claims.intent, allowedModes: ['stated', 'inferred'] },
        },
      })
    ).toThrow('canonically ordered');
    expect(() =>
      evaluateAcceptance({
        ...input(),
        policyResource: {
          ...bound.resource,
          digest: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        },
      })
    ).toThrow('does not match policy content');
  });
});

describe('policy evaluation and immutable Decisions', () => {
  it('accepts human and automated actors through the same evaluator and record', () => {
    const humanInput = input();
    const human = evaluateAcceptance(humanInput);
    expect(human).toMatchObject({ permitted: true, requestedOutcome: 'accepted', failures: [] });
    const humanDecision = createDecisionStatement({ ...humanInput, decidedAt: DECIDED_AT });
    expect(humanDecision).toMatchObject({
      ok: true,
      decision: {
        subjects: [human.proposal],
        actor: { kind: 'human', id: 'human:maintainer' },
        predicateType: 't3x.decision/v1',
        predicate: { policy: { mode: 'evaluated' }, outcome: 'accepted' },
      },
    });

    const automatedInput = {
      ...input(),
      actorContext: {
        actor: { kind: 'agent', id: 'agent:release-bot' },
      },
    } satisfies EvaluateAcceptanceInput;
    const automated = evaluateAcceptance(automatedInput);
    expect(automated.permitted).toBe(true);
    expect(createDecisionStatement({ ...automatedInput, decidedAt: DECIDED_AT })).toMatchObject({
      ok: true,
      decision: { actor: { kind: 'agent' } },
    });
  });

  it('creates rejected Decisions for audit without pretending requirements passed', () => {
    const rejectionInput = { ...input('rejected'), statements: [] };
    const evaluation = evaluateAcceptance(rejectionInput);
    expect(evaluation.permitted).toBe(true);
    expect(evaluation.failures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining(['REPLAY_NOT_VERIFIED', 'VALIDATION_REQUIRED'])
    );
    expect(createDecisionStatement({ ...rejectionInput, decidedAt: DECIDED_AT })).toMatchObject({
      ok: true,
      decision: { predicate: { outcome: 'rejected' } },
    });
  });

  it('allows only authorized, actor-authored overrides and never overrides replay false', () => {
    const base = input('overridden');
    const subject = graph();
    const allowed = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      statements: [observe(replay(subject.effect)), observe(validation(subject.result, 'failed'))],
    });
    expect(allowed).toMatchObject({ permitted: true, requestedOutcome: 'overridden' });
    expect(allowed.failures.map((failure) => failure.code)).toEqual(['VALIDATION_FAILED']);

    const missingRationale = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      statements: [observe(replay(subject.effect)), observe(validation(subject.result, 'failed'))],
      rationale: { mode: 'unspecified' },
    });
    expect(missingRationale.permitted).toBe(false);
    expect(missingRationale.failures).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'INVALID_OVERRIDE_RATIONALE' })])
    );

    const replayFalse = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      statements: [
        observe(replay(subject.effect, 'false')),
        observe(validation(subject.result, 'failed')),
      ],
    });
    expect(replayFalse.permitted).toBe(false);
    expect(replayFalse.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'REPLAY_CLAIM_FALSE', overrideable: false }),
      ])
    );

    const restrictedOverridePolicy = policy({
      authorization: {
        ...policy().authorization,
        override: {
          actors: {
            mode: 'one_of',
            values: [{ kind: 'human', id: 'human:maintainer' }],
          },
        },
      },
    });
    const restrictedOverride = createAcceptancePolicyResource({
      policy: restrictedOverridePolicy,
      uri: 't3x://project/policies/restricted-override',
    });
    const unauthorized = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      actorContext: { actor: { kind: 'human', id: 'human:reviewer' } },
      policy: restrictedOverride.policy,
      policyResource: restrictedOverride.resource,
      statements: [observe(replay(subject.effect)), observe(validation(subject.result, 'failed'))],
    });
    expect(unauthorized.failures).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'UNAUTHORIZED_OVERRIDE' })])
    );
  });

  it('separates actor kind from authority and enforces self-approval only for positive outcomes', () => {
    const subject = graph({ kind: 'human', id: 'human:maintainer' });
    const base = input();
    const selfApproval = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      statements: [observe(replay(subject.effect)), observe(validation(subject.result))],
    });
    expect(selfApproval.failures).toEqual([
      expect.objectContaining({ code: 'SELF_APPROVAL_FORBIDDEN' }),
    ]);
    expect(selfApproval.permitted).toBe(false);

    const selfRejection = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      outcome: 'rejected',
      statements: [],
    });
    expect(selfRejection.permitted).toBe(true);

    const restrictedDecisionPolicy = policy({
      authorization: {
        ...policy().authorization,
        decide: {
          actors: {
            mode: 'one_of',
            values: [{ kind: 'human', id: 'human:maintainer' }],
          },
        },
      },
    });
    const restrictedDecision = createAcceptancePolicyResource({
      policy: restrictedDecisionPolicy,
      uri: 't3x://project/policies/restricted-decision',
    });
    const unauthorizedHuman = evaluateAcceptance({
      ...input(),
      actorContext: { actor: { kind: 'human', id: 'human:owner' } },
      policy: restrictedDecision.policy,
      policyResource: restrictedDecision.resource,
    });
    expect(unauthorizedHuman.failures).toEqual([
      expect.objectContaining({ code: 'UNAUTHORIZED_DECISION' }),
    ]);

    const selfApprovalPolicy = policy({
      authorization: { ...policy().authorization, allowSelfApproval: true },
    });
    const bound = createAcceptancePolicyResource({
      policy: selfApprovalPolicy,
      uri: 't3x://project/policies/self-approval',
    });
    const allowedSelfApproval = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      policy: bound.policy,
      policyResource: bound.resource,
      statements: [observe(replay(subject.effect)), observe(validation(subject.result))],
    });
    expect(allowedSelfApproval.permitted).toBe(true);
  });

  it('enforces claim modes and evidence coverage without treating change shape as intent', () => {
    const base = input();
    const strictClaims = policy({
      claims: {
        ...policy().claims,
        intent: {
          allowedModes: ['stated'],
          minimumEvidence: 1,
          humanConfirmation: 'not_required',
        },
      },
    });
    const bound = createAcceptancePolicyResource({
      policy: strictClaims,
      uri: 't3x://project/policies/stated-intent',
    });
    const evaluation = evaluateAcceptance({
      ...base,
      policy: bound.policy,
      policyResource: bound.resource,
    });
    expect(evaluation.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CLAIM_MODE_NOT_ALLOWED' }),
        expect.objectContaining({ code: 'CLAIM_EVIDENCE_INSUFFICIENT' }),
      ])
    );
  });

  it('distinguishes missing validation in complete and partial observation scopes', () => {
    const base = input();
    const complete = evaluateAcceptance({
      ...base,
      statements: [base.statements[0] as StatementObservation],
    });
    expect(complete.failures).toEqual([
      expect.objectContaining({ code: 'VALIDATION_REQUIRED', overrideable: true }),
    ]);

    const partial = evaluateAcceptance({
      ...base,
      observationScope: { completeness: 'partial', sources: ['offline-pack'] },
      statements: [base.statements[0] as StatementObservation],
    });
    expect(partial.failures).toEqual([
      expect.objectContaining({ code: 'OBSERVATION_SCOPE_INCOMPLETE', overrideable: false }),
    ]);

    const missingOverride = evaluateAcceptance({
      ...base,
      outcome: 'overridden',
      actorContext: {
        actor: { kind: 'human', id: 'human:maintainer' },
      },
      rationale: { mode: 'authored', value: 'Proceed without validation', evidence: [] },
      statements: [base.statements[0] as StatementObservation],
    });
    expect(missingOverride).toMatchObject({ permitted: true });
    expect(missingOverride.failures).toEqual([
      expect.objectContaining({ code: 'VALIDATION_REQUIRED', overrideable: true }),
    ]);

    const optionalPolicy = policy({
      checks: {
        ...policy().checks,
        validation: { ...policy().checks.validation, requirement: 'optional' },
      },
    });
    const bound = createAcceptancePolicyResource({
      policy: optionalPolicy,
      uri: 't3x://project/policies/optional-validation',
    });
    const optional = evaluateAcceptance({
      ...base,
      policy: bound.policy,
      policyResource: bound.resource,
      statements: [base.statements[0] as StatementObservation],
    });
    expect(optional).toMatchObject({ permitted: true, failures: [] });
  });

  it('treats Statements as a set and refuses claimed-time latest-wins', () => {
    const base = input();
    const subject = graph();
    const passed = validation(subject.result);
    const failed = validation(subject.result, 'failed');
    const manipulated = {
      ...failed,
      predicate: {
        ...failed.predicate,
        run: { id: 'run:future', recordedAt: '2099-01-01T00:00:00.000Z' },
      },
    } as YSchemaValidationStatement;
    const left = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      statements: [observe(manipulated), observe(passed), observe(replay(subject.effect))],
    });
    const right = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      statements: [
        observe(replay(subject.effect)),
        observe(passed),
        observe(manipulated),
        observe(passed),
      ],
    });
    expect(left.failures).toEqual([expect.objectContaining({ code: 'VALIDATION_CONFLICT' })]);
    expect(right.failures).toEqual(left.failures);
    expect(right.considered).toEqual(left.considered);
    expect(right.considered.map((statement) => statement.digest)).toEqual(
      [...right.considered.map((statement) => statement.digest)].sort()
    );
  });

  it('binds the exact considered Statement set and requested outcome into Decision identity', () => {
    const firstInput = input();
    const first = createDecisionStatement({ ...firstInput, decidedAt: DECIDED_AT });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('Expected the first Decision to be created');

    const subject = graph();
    const secondValidation = validation(subject.result);
    const secondInput: EvaluateAcceptanceInput = {
      ...firstInput,
      effect: subject.effect,
      proposal: subject.proposal,
      statements: [
        observe(replay(subject.effect)),
        observe(secondValidation),
        observe({
          ...secondValidation,
          predicate: {
            ...secondValidation.predicate,
            run: { ...secondValidation.predicate.run, id: 'run:second-pass' },
          },
        } as YSchemaValidationStatement),
      ],
    };
    const second = createDecisionStatement({ ...secondInput, decidedAt: DECIDED_AT });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('Expected the second Decision to be created');
    expect(describeProtocolObject(second.decision).digest).not.toBe(
      describeProtocolObject(first.decision).digest
    );

    const rejected = createDecisionStatement({
      ...firstInput,
      outcome: 'rejected',
      decidedAt: DECIDED_AT,
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) throw new Error('Expected the rejection Decision to be created');
    expect(describeProtocolObject(rejected.decision).digest).not.toBe(
      describeProtocolObject(first.decision).digest
    );
  });

  it('matches exact issuer, tool, profile, schema, context, and environment requirements', () => {
    const subject = graph();
    const trustedValidation = validation(subject.result);
    const strictPolicy = policy({
      checks: {
        ...policy().checks,
        validation: {
          ...policy().checks.validation,
          issuers: { mode: 'one_of', values: [trustedValidation.actor] },
          tools: { mode: 'one_of', values: [trustedValidation.predicate.tool] },
          profiles: { mode: 'one_of', values: [trustedValidation.predicate.profile] },
          schemas: { mode: 'one_of', values: [trustedValidation.predicate.schemaResource] },
          contexts: { mode: 'one_of', values: [trustedValidation.predicate.context] },
          environments: { mode: 'one_of', values: [trustedValidation.predicate.environment] },
        },
      },
    });
    const bound = createAcceptancePolicyResource({
      policy: strictPolicy,
      uri: 't3x://project/policies/strict',
    });
    const base = input();
    const accepted = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      policy: bound.policy,
      policyResource: bound.resource,
      statements: [observe(replay(subject.effect)), observe(trustedValidation)],
    });
    expect(accepted.permitted).toBe(true);

    const wrongTool = {
      ...trustedValidation,
      predicate: {
        ...trustedValidation.predicate,
        tool: { ...trustedValidation.predicate.tool, version: '999' },
      },
    } as YSchemaValidationStatement;
    const rejected = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      policy: bound.policy,
      policyResource: bound.resource,
      statements: [observe(replay(subject.effect)), observe(wrongTool)],
    });
    expect(rejected.failures).toEqual([expect.objectContaining({ code: 'VALIDATION_REQUIRED' })]);

    const spoofedIssuer = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      policy: bound.policy,
      policyResource: bound.resource,
      statements: [
        observe(replay(subject.effect)),
        {
          statement: trustedValidation,
          issuerContext: {
            actor: { kind: 'service', id: 'service:attacker' },
          },
        },
      ],
    });
    expect(spoofedIssuer.failures).toEqual([
      expect.objectContaining({ code: 'VALIDATION_REQUIRED' }),
    ]);
  });

  it('does not accept replay verification for a Result other than the Effect claim', () => {
    const base = input();
    const wrongResultReplay = buildReplayVerificationStatement({
      effect: base.effect,
      actor: fixtures.replay.actor,
      predicate: {
        ...fixtures.replay.predicate,
        result: describeProtocolObject(state('different-result')),
      },
    });
    const evaluation = evaluateAcceptance({
      ...base,
      statements: [observe(wrongResultReplay), base.statements[1] as StatementObservation],
    });
    expect(evaluation.failures).toEqual([expect.objectContaining({ code: 'REPLAY_NOT_VERIFIED' })]);
  });

  it('uses human confirmation as a separate Statement without rewriting Proposal identity', () => {
    const subject = graph();
    const confirmationPolicy = policy({
      claims: {
        ...policy().claims,
        intent: { ...policy().claims.intent, humanConfirmation: 'required' },
      },
    });
    const bound = createAcceptancePolicyResource({
      policy: confirmationPolicy,
      uri: 't3x://project/policies/confirmation',
    });
    const base = input();
    const before = describeProtocolObject(subject.proposal);
    const missing = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      policy: bound.policy,
      policyResource: bound.resource,
      statements: [observe(replay(subject.effect)), observe(validation(subject.result))],
    });
    expect(missing.failures).toEqual([
      expect.objectContaining({ code: 'HUMAN_CONFIRMATION_REQUIRED' }),
    ]);

    const confirmation = buildHumanConfirmationStatement({
      proposal: subject.proposal,
      actor: { kind: 'human', id: 'human:reviewer' },
      predicate: { confirms: ['intent'] },
    });
    const confirmed = evaluateAcceptance({
      ...base,
      effect: subject.effect,
      proposal: subject.proposal,
      policy: bound.policy,
      policyResource: bound.resource,
      statements: [
        observe(confirmation),
        observe(replay(subject.effect)),
        observe(validation(subject.result)),
      ],
    });
    expect(confirmed.permitted).toBe(true);
    expect(describeProtocolObject(subject.proposal)).toEqual(before);
    expect(confirmed.considered).toContainEqual(describeProtocolObject(confirmation));
  });

  it('derives capabilities without persisting mutable permission flags', () => {
    const capabilities = deriveDecisionCapabilities({
      ...input(),
      actorContext: {
        actor: { kind: 'human', id: 'human:maintainer' },
      },
    });
    expect(capabilities).toMatchObject({
      canAccept: true,
      canOverride: false,
      canReject: true,
    });
    expect(JSON.stringify(input().proposal)).not.toContain('canAccept');
  });

  it('fails closed on Proposal-to-Effect type confusion and emits no partial Decision', () => {
    const unrelated = graph();
    const base = input();
    const unrelatedEffect = parseEffect({
      ...unrelated.effect,
      operations: [{ set: { path: 'device', value: 'unrelated' } }],
    });
    expect(() => evaluateAcceptance({ ...base, effect: unrelatedEffect })).toThrow(
      'Proposal must subject the supplied Effect'
    );

    const denied = evaluateAcceptance({ ...base, statements: [] });
    expect(denied.permitted).toBe(false);
    const result = createDecisionStatement({ ...base, statements: [], decidedAt: DECIDED_AT });
    expect(result).toMatchObject({ ok: false });
    expect(result).not.toHaveProperty('decision');
  });
});
