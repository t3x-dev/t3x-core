import { describe, expect, it } from 'vitest';
import {
  type CommitV2,
  type DecisionStatement,
  describeProtocolObject,
  type Effect,
  InMemoryObjectResolver,
  type ProposalStatement,
  type State,
  type Statement,
  verifyCommitIntegrity,
  verifyStatementSubjects,
} from '..';

function state(name: string): State {
  return {
    schema: 't3x/state/v1',
    codec: { mediaType: 'application/test+json', version: '1' },
    value: { name },
  };
}

function integrityFixture(outcome: 'accepted' | 'rejected' = 'accepted') {
  const base = state('before');
  const result = state('after');
  const resolver = new InMemoryObjectResolver([base, result]);
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
  const effectDescriptor = resolver.put(effect);
  const proposal: ProposalStatement = {
    schema: 't3x/statement/v1',
    subjects: [effectDescriptor],
    actor: { kind: 'agent', id: 'agent:test' },
    predicateType: 't3x.proposal/v1',
    predicate: {
      intent: { mode: 'inferred', value: 'Change the name', evidence: [] },
      rationale: { mode: 'unspecified' },
    },
  };
  const proposalDescriptor = resolver.put(proposal);
  const decision: DecisionStatement = {
    schema: 't3x/statement/v1',
    subjects: [proposalDescriptor],
    actor: { kind: 'human', id: 'user:test' },
    predicateType: 't3x.decision/v1',
    predicate: {
      policy: { mode: 'not_evaluated' },
      considered: [],
      outcome,
      rationale: { mode: 'unspecified' },
      decidedAt: '2026-07-26T02:00:00.000Z',
    },
  };
  const decisionDescriptor = resolver.put(decision);
  const commit: CommitV2 = {
    schema: 't3x/commit/v2',
    parents: [],
    decision: decisionDescriptor,
    result: effect.result,
  };
  return { base, result, resolver, effect, proposal, decision, commit };
}

describe('pure protocol integrity-chain verification', () => {
  it('verifies Commit -> Decision -> Proposal -> Effect and Result redundancy', async () => {
    const fixture = integrityFixture();
    await expect(verifyCommitIntegrity(fixture.commit, fixture.resolver)).resolves.toMatchObject({
      commit: fixture.commit,
      decision: fixture.decision,
      proposal: fixture.proposal,
      effect: fixture.effect,
    });
  });

  it('rejects a Commit decision slot containing the wrong predicate type', async () => {
    const fixture = integrityFixture();
    const external: Statement = {
      schema: 't3x/statement/v1',
      subjects: [describeProtocolObject(fixture.effect)],
      actor: { kind: 'service', id: 'validator:test' },
      predicateType: 't3x.dev/validation/v1',
      predicate: { valid: true },
    };
    const commit = { ...fixture.commit, decision: fixture.resolver.put(external) };
    await expect(verifyCommitIntegrity(commit, fixture.resolver)).rejects.toMatchObject({
      code: 'INTEGRITY_CHAIN_INVALID',
    });
  });

  it('rejects a Decision whose subject resolves to a non-Proposal Statement', async () => {
    const fixture = integrityFixture();
    const external: Statement = {
      schema: 't3x/statement/v1',
      subjects: [describeProtocolObject(fixture.effect)],
      actor: { kind: 'service', id: 'validator:test' },
      predicateType: 't3x.dev/validation/v1',
      predicate: { valid: true },
    };
    const decision: DecisionStatement = {
      ...fixture.decision,
      subjects: [fixture.resolver.put(external)],
    };
    const commit = { ...fixture.commit, decision: fixture.resolver.put(decision) };
    await expect(verifyCommitIntegrity(commit, fixture.resolver)).rejects.toMatchObject({
      code: 'INTEGRITY_CHAIN_INVALID',
    });
  });

  it('rejects rejected Decisions and mismatched Commit Results', async () => {
    const rejected = integrityFixture('rejected');
    await expect(verifyCommitIntegrity(rejected.commit, rejected.resolver)).rejects.toMatchObject({
      code: 'INTEGRITY_CHAIN_INVALID',
    });

    const fixture = integrityFixture();
    const other = state('other');
    fixture.resolver.put(other);
    const commit = { ...fixture.commit, result: describeProtocolObject(other) };
    await expect(verifyCommitIntegrity(commit, fixture.resolver)).rejects.toMatchObject({
      code: 'INTEGRITY_CHAIN_INVALID',
    });
  });

  it('binds the Effect Base to the ordered first-parent Result', async () => {
    const fixture = integrityFixture();
    const parent: CommitV2 = {
      schema: 't3x/commit/v2',
      parents: [],
      decision: fixture.commit.decision,
      result: fixture.effect.base,
    };
    const commit = { ...fixture.commit, parents: [fixture.resolver.put(parent)] };
    await expect(verifyCommitIntegrity(commit, fixture.resolver)).resolves.toBeDefined();

    const wrongParent: CommitV2 = { ...parent, result: fixture.effect.result };
    const wrongCommit = {
      ...fixture.commit,
      parents: [fixture.resolver.put(wrongParent)],
    };
    await expect(verifyCommitIntegrity(wrongCommit, fixture.resolver)).rejects.toMatchObject({
      code: 'INTEGRITY_CHAIN_INVALID',
    });
  });

  it('attaches external Statements without rewriting subject identity', async () => {
    const fixture = integrityFixture();
    const proposalBefore = describeProtocolObject(fixture.proposal);
    const confirmation: Statement = {
      schema: 't3x/statement/v1',
      subjects: [proposalBefore],
      actor: { kind: 'human', id: 'user:reviewer' },
      predicateType: 't3x.dev/human-confirmation/v1',
      predicate: { confirms: ['intent', 'rationale'] },
    };

    fixture.resolver.put(confirmation);
    await expect(verifyStatementSubjects(confirmation, fixture.resolver)).resolves.toBeUndefined();
    expect(describeProtocolObject(fixture.proposal)).toEqual(proposalBefore);
  });
});
