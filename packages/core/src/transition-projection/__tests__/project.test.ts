import {
  describeProtocolObject,
  type Effect,
  type ProposalStatement,
  parseCommitV2,
  parseEffect,
  parseProposalStatement,
  parseState,
  parseStatement,
  type State,
  type Statement,
  type StringClaim,
} from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import type { Commit } from '../../commit/types';
import { createDecisionStatement } from '../../transition-decisions/decision';
import type { StatementObservation } from '../../transition-decisions/evaluation';
import {
  type AcceptancePolicy,
  createAcceptancePolicyResource,
  parseAcceptancePolicy,
} from '../../transition-decisions/policy';
import {
  buildHumanConfirmationStatement,
  buildReplayVerificationStatement,
  buildYSchemaValidationStatement,
} from '../../transition-statements/builders';
import { projectTransitionView } from '../project';
import type { ProjectTransitionGraphInput, TransitionGraphViewV1 } from '../types';

const DECIDED_AT = '2026-07-29T02:00:00.000Z';
const RECORDED_AT = '2026-07-29T02:00:01.000Z';

function state(device: string): State {
  return parseState({
    schema: 't3x/state/v1',
    codec: { mediaType: 'application/yaml', version: '1' },
    value: { device },
  });
}

function graph(input?: {
  actor?: ProposalStatement['actor'];
  intent?: StringClaim;
  rationale?: StringClaim;
}): { base: State; result: State; effect: Effect; proposal: ProposalStatement } {
  const base = state('before');
  const result = state('after');
  const effect = parseEffect({
    schema: 't3x/effect/v1',
    base: describeProtocolObject(base),
    result: describeProtocolObject(result),
    driver: {
      protocol: 't3x.dev/test-edit',
      protocolVersion: '1',
      specDigest: `sha256:${'a'.repeat(64)}`,
    },
    operations: [{ op: 'replace', path: ['device'], expect: 'before', value: 'after' }],
    inputs: [],
  });
  const proposal = parseProposalStatement({
    schema: 't3x/statement/v1',
    subjects: [describeProtocolObject(effect)],
    actor: input?.actor ?? { kind: 'agent', id: 'agent:planner' },
    predicateType: 't3x.proposal/v1',
    predicate: {
      intent: input?.intent ?? {
        mode: 'inferred',
        value: 'Use the production device name',
        evidence: [],
      },
      rationale: input?.rationale ?? {
        mode: 'authored',
        value: 'Prepare the release configuration',
        evidence: [],
      },
    },
  });
  return { base, result, effect, proposal };
}

function replay(effect: Effect) {
  return buildReplayVerificationStatement({
    effect,
    actor: { kind: 'service', id: 'verifier:replay' },
    predicate: {
      tool: { name: 't3x-replay', version: '1.0.0' },
      run: { id: 'run:replay:1', recordedAt: '2026-07-29T01:00:00.000Z' },
      environment: { mode: 'unspecified' },
      outcome: 'verified',
      result: effect.result,
    },
  });
}

function validation(result: State, outcome: 'failed' | 'passed' = 'passed') {
  const common = {
    tool: { name: '@t3x-dev/yschema', version: '0.6.0' },
    run: {
      id: outcome === 'passed' ? 'run:yschema:passed' : 'run:yschema:failed',
      recordedAt: '2026-07-29T01:00:01.000Z',
    },
    environment: { mode: 'unspecified' as const },
    schemaResource: {
      uri: 'urn:t3x:test:yschema:device',
      mediaType: 'application/vnd.t3x.yschema+json',
      digest: `sha256:${'b'.repeat(64)}` as const,
    },
    profile: { id: 't3x.dev/yschema/native', version: '0.1' },
    context: { mode: 'unspecified' as const },
  };
  return buildYSchemaValidationStatement({
    state: result,
    actor: { kind: 'service', id: 'validator:yschema' },
    predicate:
      outcome === 'passed'
        ? {
            ...common,
            outcome: 'passed',
            valid: true,
            ready: true,
            errors: [],
            gaps: [],
            fixes: [],
          }
        : {
            ...common,
            outcome: 'failed',
            valid: true,
            ready: false,
            errors: [],
            gaps: [
              {
                code: 'REQUIRED_SLOT_MISSING',
                path: 'device/name',
                message: 'Required slot is missing.',
              },
            ],
            fixes: [],
          },
  });
}

function observe(statement: Statement): StatementObservation {
  return { statement, issuerContext: { actor: { ...statement.actor } } };
}

function policy(): AcceptancePolicy {
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
        allowedModes: ['authored', 'inferred', 'stated', 'unspecified'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
      rationale: {
        allowedModes: ['authored', 'inferred', 'stated', 'unspecified'],
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
  });
}

function baseInput(
  subject = graph(),
  observations: StatementObservation[] = [
    observe(replay(subject.effect)),
    observe(validation(subject.result)),
  ]
): ProjectTransitionGraphInput {
  const bound = createAcceptancePolicyResource({
    policy: policy(),
    uri: 't3x://project/policies/default',
  });
  return {
    mode: 'transition',
    effect: subject.effect,
    proposal: subject.proposal,
    observations,
    observationScope: { completeness: 'complete', sources: ['project-store'] },
    objectIntegrity: 'verified',
    capabilityContext: {
      actorContext: { actor: { kind: 'human', id: 'human:maintainer' } },
      policy: bound.policy,
      policyResource: bound.resource,
    },
  };
}

function decide(
  input: ProjectTransitionGraphInput,
  outcome: 'accepted' | 'overridden' | 'rejected'
) {
  if (input.capabilityContext === undefined) throw new Error('Capability fixture is missing');
  const created = createDecisionStatement({
    actorContext: input.capabilityContext.actorContext,
    effect: input.effect,
    observationScope: input.observationScope,
    outcome,
    policy: input.capabilityContext.policy,
    policyResource: input.capabilityContext.policyResource,
    proposal: input.proposal,
    rationale:
      outcome === 'overridden'
        ? { mode: 'authored', value: 'Accept the known validation gap', evidence: [] }
        : { mode: 'unspecified' },
    statements: input.observations,
    decidedAt: DECIDED_AT,
  });
  if (!created.ok) throw new Error(`Fixture Decision was denied: ${created.failures[0]?.code}`);
  return created.decision;
}

function modern(view: ReturnType<typeof projectTransitionView>): TransitionGraphViewV1 {
  if (view.mode !== 'transition') throw new Error('Expected a modern Transition view');
  return view;
}

describe('TransitionViewV1 product projection', () => {
  it('keeps a human direct edit low-friction and preserves authored versus missing claims', () => {
    const subject = graph({
      actor: { kind: 'human', id: 'human:editor' },
      intent: { mode: 'unspecified' },
      rationale: { mode: 'authored', value: 'Reduce production logging', evidence: [] },
    });
    const view = modern(projectTransitionView(baseInput(subject)));

    expect(view).toMatchObject({
      schema: 't3x.dev/transition-view/v1',
      version: 1,
      mode: 'transition',
      claims: {
        actor: { kind: 'human', id: 'human:editor' },
        intent: { mode: 'unspecified', origin: 'not_provided', evidence: [] },
        rationale: {
          mode: 'authored',
          origin: 'actor_authored',
          value: 'Reduce production logging',
        },
      },
      checks: {
        objectIntegrity: 'verified',
        replay: { outcomes: ['verified'] },
        validation: { outcomes: ['passed'] },
      },
    });
    expect(view).not.toHaveProperty('status');
    expect(view.change.operations).toEqual(subject.effect.operations);
  });

  it('keeps Agent inference explicit and exposes policy previews without granting commit authority', () => {
    const view = modern(projectTransitionView(baseInput()));

    expect(view.claims.intent).toMatchObject({ mode: 'inferred', origin: 'inferred' });
    expect(view.capabilities).toMatchObject({
      accept: { disposition: 'allowed', reasons: [] },
      override: {
        disposition: 'denied',
        reasons: [{ code: 'OVERRIDE_NOT_REQUIRED' }],
      },
      reject: { disposition: 'allowed', reasons: [] },
      commit: {
        disposition: 'not_applicable',
        reasons: [{ code: 'DECISION_REQUIRED' }],
      },
    });
  });

  it('preserves failed validation beside an authorized override', () => {
    const subject = graph();
    const input = baseInput(subject, [
      observe(replay(subject.effect)),
      observe(validation(subject.result, 'failed')),
    ]);
    const decision = decide(input, 'overridden');
    const view = modern(projectTransitionView({ ...input, decision }));

    expect(view.checks.validation).toMatchObject({
      observation: 'observed',
      outcomes: ['failed'],
      runs: [{ predicate: { valid: true, ready: false } }],
    });
    expect(view.decision).toMatchObject({
      observation: 'supplied',
      outcome: 'overridden',
      rationale: { mode: 'authored', origin: 'actor_authored' },
    });
    expect(view.capabilities.commit).toMatchObject({
      disposition: 'not_evaluated',
      reasons: [{ code: 'REPOSITORY_AUTHORIZATION_REQUIRED' }],
    });
  });

  it('renders rejection without fabricating Commit history', () => {
    const input = baseInput();
    const decision = decide(input, 'rejected');
    const view = modern(projectTransitionView({ ...input, decision }));

    expect(view.decision).toMatchObject({ observation: 'supplied', outcome: 'rejected' });
    expect(view.history).toEqual({ observation: 'not_committed' });
    expect(view.capabilities.commit).toMatchObject({
      disposition: 'not_applicable',
      reasons: [{ code: 'DECISION_REJECTED' }],
    });
  });

  it('projects Decision-bound CommitV2 history and reconstructable audit links', () => {
    const input = baseInput();
    const decision = decide(input, 'accepted');
    const commit = parseCommitV2({
      schema: 't3x/commit/v2',
      parents: [],
      decision: describeProtocolObject(decision),
      result: input.effect.result,
    });
    const view = modern(
      projectTransitionView({
        ...input,
        decision,
        commit: { object: commit, recordedAt: RECORDED_AT },
      })
    );

    expect(view.history).toMatchObject({
      observation: 'committed',
      commit: {
        format: 'transition_v2',
        recordedAt: RECORDED_AT,
        assurance: { mode: 'decision_bound', decision: describeProtocolObject(decision) },
      },
    });
    expect(view.audit).toMatchObject({
      effect: describeProtocolObject(input.effect),
      proposal: describeProtocolObject(input.proposal),
      decision: describeProtocolObject(decision),
      commit: describeProtocolObject(commit),
    });
    expect(view.capabilities.revert).toMatchObject({
      disposition: 'not_evaluated',
      reasons: [{ code: 'REPOSITORY_AUTHORIZATION_REQUIRED' }],
    });
  });

  it('renders CommitV1 with explicit reduced assurance through the same versioned view', () => {
    const legacy: Commit = {
      hash: 'legacy:abc123',
      schema: 't3x/commit',
      parents: [],
      author: { type: 'human', id: 'human:legacy' },
      committed_at: '2025-01-01T00:00:00.000Z',
      content: { trees: [], relations: [] },
      project_id: 'project:legacy',
      message: 'Legacy snapshot',
      branch: 'main',
      provenance: null,
      yops_log_ids: [],
    };
    const view = projectTransitionView({ mode: 'legacy', commit: legacy });

    expect(view).toMatchObject({
      schema: 't3x.dev/transition-view/v1',
      version: 1,
      mode: 'legacy',
      claims: { observation: 'unavailable', reason: 'legacy_v1' },
      checks: { observation: 'unavailable', reason: 'legacy_v1' },
      history: {
        observation: 'committed',
        commit: {
          format: 'legacy_v1',
          assurance: { mode: 'legacy_unavailable' },
        },
      },
      capabilities: {
        accept: { disposition: 'not_applicable', reasons: [{ code: 'LEGACY_HISTORY_READ_ONLY' }] },
      },
    });
  });

  it('retains human confirmation and unknown external Statements without changing claim identity', () => {
    const subject = graph();
    const confirmation = buildHumanConfirmationStatement({
      proposal: subject.proposal,
      actor: { kind: 'human', id: 'human:reviewer' },
      predicate: { confirms: ['intent'] },
    });
    const external = parseStatement({
      schema: 't3x/statement/v1',
      subjects: [describeProtocolObject(subject.effect)],
      actor: { kind: 'service', id: 'scanner:external' },
      predicateType: 'example.dev/scanner/v1',
      predicate: { outcome: 'informational' },
    });
    const input = baseInput(subject, [
      observe(external),
      observe(confirmation),
      observe(validation(subject.result)),
      observe(replay(subject.effect)),
    ]);
    const original = structuredClone(input);
    const view = modern(projectTransitionView(input));

    expect(view.checks.humanConfirmation).toMatchObject({
      observation: 'observed',
      runs: [{ predicate: { confirms: ['intent'] } }],
    });
    expect(view.audit.statements.map((item) => item.predicateType)).toContain(
      'example.dev/scanner/v1'
    );
    expect(input).toEqual(original);
    expect(view.audit.statements.map((item) => item.statement.digest)).toEqual(
      [...view.audit.statements.map((item) => item.statement.digest)].sort()
    );
  });

  it('refuses Proposal, Statement, Decision, and Commit links from another graph', () => {
    const first = graph();
    const second = graph({
      intent: { mode: 'inferred', value: 'A different proposal', evidence: [] },
    });
    const unrelatedEffect = parseEffect({
      ...second.effect,
      operations: [{ op: 'replace', path: ['device'], expect: 'before', value: 'other' }],
      result: describeProtocolObject(state('other')),
    });
    const unrelatedProposal = parseProposalStatement({
      ...second.proposal,
      subjects: [describeProtocolObject(unrelatedEffect)],
    });
    expect(() =>
      projectTransitionView({ ...baseInput(first), proposal: unrelatedProposal })
    ).toThrow('Proposal must subject the supplied Effect');

    const goodReplay = replay(first.effect);
    const wrongReplay = parseStatement({
      ...goodReplay,
      subjects: [first.effect.result],
    });
    expect(() => projectTransitionView(baseInput(first, [observe(wrongReplay)]))).toThrow(
      'does not subject this Transition graph'
    );
    expect(() => projectTransitionView(baseInput(first, [observe(first.proposal)]))).toThrow(
      'dedicated graph positions'
    );

    const complete = baseInput(first);
    const decision = decide(complete, 'accepted');
    expect(() =>
      projectTransitionView({
        ...complete,
        observations: [complete.observations[0]!],
        decision,
      })
    ).toThrow('Every considered Statement must be present');

    const wrongCommit = parseCommitV2({
      schema: 't3x/commit/v2',
      parents: [],
      decision: describeProtocolObject(decision),
      result: describeProtocolObject(state('wrong-result')),
    });
    expect(() =>
      projectTransitionView({
        ...complete,
        decision,
        commit: { object: wrongCommit, recordedAt: RECORDED_AT },
      })
    ).toThrow('CommitV2 Result must equal');
  });

  it('refuses duplicate observations rather than silently applying last-wins', () => {
    const subject = graph();
    const observed = observe(replay(subject.effect));
    expect(() => projectTransitionView(baseInput(subject, [observed, observed]))).toThrow(
      'Observation Statements must be unique'
    );
  });
});
