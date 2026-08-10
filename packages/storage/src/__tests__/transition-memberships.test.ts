import {
  describeTransitionObject,
  type Effect,
  type ProposalStatement,
  type State,
} from '@t3x-dev/core';
import { parseStatement, type Statement } from '@t3x-dev/transition';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertProject } from '../queries/projects';
import {
  createTransitionProposalMembership,
  digestTransitionPreparationCanonicalJson,
  digestTransitionRequestCanonicalJson,
  getTransitionProposalMembership,
  listTransitionProposalsForWorkspaceRevision,
  listTransitionStatementMemberships,
  recordTransitionStatementMembership,
  recordTransitionStatementMemberships,
  resolveTransitionProposalGraph,
  TransitionMembershipIntegrityError,
  TransitionMembershipNotFoundError,
  TransitionRequestConflictError,
  TransitionStatementConflictError,
} from '../queries/transition-memberships';
import { createTestDB, testData } from './setup';

const ACTOR = { kind: 'agent' as const, id: 'agent:test-proposer' };
const ISSUER = { kind: 'service' as const, id: 'service:test-verifier' };

function transitionGraph(suffix: string) {
  const base: State = {
    schema: 't3x/state/v1',
    codec: { mediaType: 'application/yaml', version: '1' },
    value: { value: `before-${suffix}` },
  };
  const result: State = {
    schema: 't3x/state/v1',
    codec: { mediaType: 'application/yaml', version: '1' },
    value: { value: suffix },
  };
  const effect: Effect = {
    schema: 't3x/effect/v1',
    base: describeTransitionObject(base),
    driver: {
      protocol: 't3x.dev/test-driver',
      protocolVersion: '1',
      specDigest: `sha256:${'a'.repeat(64)}`,
    },
    operations: [{ op: 'set', path: '/value', value: suffix }],
    inputs: [],
    result: describeTransitionObject(result),
  };
  const proposal: ProposalStatement = {
    schema: 't3x/statement/v1',
    subjects: [describeTransitionObject(effect)],
    actor: ACTOR,
    predicateType: 't3x.proposal/v1',
    predicate: {
      intent: { mode: 'inferred', value: `Set value to ${suffix}`, evidence: [] },
      rationale: { mode: 'authored', value: `Exercise ${suffix}`, evidence: [] },
    },
  };
  return { base, result, effect, proposal };
}

function externalStatement(
  graph: ReturnType<typeof transitionGraph>,
  outcome: 'passed' | 'failed' = 'passed'
): Statement {
  return parseStatement({
    schema: 't3x/statement/v1',
    subjects: [graph.effect.result],
    actor: ISSUER,
    predicateType: 'example.test/validation/v1',
    predicate: { outcome },
  });
}

function membershipInput(projectId: string, suffix = 'after') {
  const graph = transitionGraph(suffix);
  const requestCanonicalJson = `{"kind":"structured_yops","workspace_id":"ws_test_${suffix}"}`;
  return {
    projectId,
    workspaceId: `ws_test_${suffix}`,
    workspaceRevision: 1,
    refName: 'main',
    refHead: null,
    requestKind: 'structured_yops' as const,
    requestCanonicalJson,
    requestDigest: digestTransitionRequestCanonicalJson(requestCanonicalJson),
    requestId: `request:${suffix}`,
    actor: ACTOR,
    ...graph,
  };
}

let db: AnyDB;
let sql: Awaited<ReturnType<typeof createTestDB>>['sql'];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const setup = await createTestDB();
  db = setup.db;
  sql = setup.sql;
  cleanup = setup.cleanup;
});

afterAll(async () => cleanup());

describe('Transition proposal and Statement memberships', () => {
  it('persists a project-scoped immutable graph and reuses an exact proposal request', async () => {
    const project = await insertProject(db, testData.project({ name: 'Membership Project' }));
    const input = membershipInput(project.projectId, 'idempotent');

    const first = await createTransitionProposalMembership(db, input);
    const second = await createTransitionProposalMembership(db, input);

    expect(first.reused).toBe(false);
    expect(second).toEqual({ membership: first.membership, reused: true });
    await expect(
      getTransitionProposalMembership(db, project.projectId, first.membership.transitionId)
    ).resolves.toEqual(first.membership);

    const resolved = await resolveTransitionProposalGraph(
      db,
      project.projectId,
      first.membership.transitionId
    );
    expect(describeTransitionObject(resolved.base)).toEqual(input.effect.base);
    expect(describeTransitionObject(resolved.result)).toEqual(input.effect.result);
    expect(describeTransitionObject(resolved.effect).digest).toBe(first.membership.effectDigest);
    expect(describeTransitionObject(resolved.proposal).digest).toBe(
      first.membership.proposalDigest
    );
    expect(resolved.observations).toEqual([]);
  });

  it('rejects idempotency reuse with different request facts', async () => {
    const project = await insertProject(db, testData.project({ name: 'Conflict Project' }));
    const input = membershipInput(project.projectId, 'conflict');
    await createTransitionProposalMembership(db, input);
    const changedCanonicalJson = `${input.requestCanonicalJson} `;

    await expect(
      createTransitionProposalMembership(db, {
        ...input,
        requestCanonicalJson: changedCanonicalJson,
        requestDigest: digestTransitionRequestCanonicalJson(changedCanonicalJson),
      })
    ).rejects.toBeInstanceOf(TransitionRequestConflictError);
  });

  it('binds immutable server preparation without changing client request identity', async () => {
    const project = await insertProject(db, testData.project({ name: 'Preparation Project' }));
    const input = membershipInput(project.projectId, 'preparation');
    const preparationCanonicalJson =
      '{"artifact":{"format":"example/source/v1","root_path":"device.yaml"}}';
    const prepared = {
      ...input,
      preparationCanonicalJson,
      preparationDigest: digestTransitionPreparationCanonicalJson(preparationCanonicalJson),
    };

    const first = await createTransitionProposalMembership(db, prepared);
    const second = await createTransitionProposalMembership(db, prepared);
    expect(second).toEqual({ membership: first.membership, reused: true });

    const resolved = await resolveTransitionProposalGraph(
      db,
      project.projectId,
      first.membership.transitionId
    );
    expect(resolved.preparation).toMatchObject({
      transitionId: first.membership.transitionId,
      canonicalJson: preparationCanonicalJson,
      digest: prepared.preparationDigest,
    });

    const changedPreparation = '{"artifact":{"root_path":"changed.yaml"}}';
    await expect(
      createTransitionProposalMembership(db, {
        ...input,
        preparationCanonicalJson: changedPreparation,
        preparationDigest: digestTransitionPreparationCanonicalJson(changedPreparation),
      })
    ).rejects.toBeInstanceOf(TransitionRequestConflictError);
  });

  it('keeps only the winning preparation under a concurrent request conflict', async () => {
    const project = await insertProject(db, testData.project({ name: 'Preparation Race' }));
    const input = membershipInput(project.projectId, 'preparation-race');
    const preparations = ['device-a.yaml', 'device-b.yaml'].map((rootPath) => {
      const canonicalJson = `{"artifact":{"root_path":"${rootPath}"}}`;
      return {
        ...input,
        preparationCanonicalJson: canonicalJson,
        preparationDigest: digestTransitionPreparationCanonicalJson(canonicalJson),
      };
    });

    const runs = await Promise.allSettled(
      preparations.map((prepared) => createTransitionProposalMembership(db, prepared))
    );
    expect(runs.map((run) => run.status).sort()).toEqual(['fulfilled', 'rejected']);
    const winner = runs.find((run) => run.status === 'fulfilled');
    if (winner?.status !== 'fulfilled') throw new Error('Concurrent preparation had no winner');
    const resolved = await resolveTransitionProposalGraph(
      db,
      project.projectId,
      winner.value.membership.transitionId
    );
    expect(preparations.map((prepared) => prepared.preparationCanonicalJson)).toContain(
      resolved.preparation?.canonicalJson
    );
  });

  it('lists only Proposals bound to the exact Workspace revision', async () => {
    const project = await insertProject(db, testData.project({ name: 'Workspace Revision List' }));
    const first = membershipInput(project.projectId, 'workspace-list-first');
    const secondFacts = membershipInput(project.projectId, 'workspace-list-second');
    const second = {
      ...secondFacts,
      workspaceId: first.workspaceId,
      workspaceRevision: 2,
    };
    const createdFirst = await createTransitionProposalMembership(db, first);
    await createTransitionProposalMembership(db, second);

    await expect(
      listTransitionProposalsForWorkspaceRevision(db, {
        projectId: project.projectId,
        workspaceId: first.workspaceId,
        workspaceRevision: 1,
      })
    ).resolves.toEqual([createdFirst.membership]);
  });

  it('does not resolve a Transition through another project membership', async () => {
    const owner = await insertProject(db, testData.project({ name: 'Owner Project' }));
    const other = await insertProject(db, testData.project({ name: 'Other Project' }));
    const created = await createTransitionProposalMembership(
      db,
      membershipInput(owner.projectId, 'isolated')
    );

    await expect(
      getTransitionProposalMembership(db, other.projectId, created.membership.transitionId)
    ).resolves.toBeNull();
    await expect(
      resolveTransitionProposalGraph(db, other.projectId, created.membership.transitionId)
    ).rejects.toBeInstanceOf(TransitionMembershipNotFoundError);
  });

  it('records trusted issuer facts, preserves all runs, and conflicts on changed retry facts', async () => {
    const project = await insertProject(db, testData.project({ name: 'Statements Project' }));
    const input = membershipInput(project.projectId, 'statements');
    const created = await createTransitionProposalMembership(db, input);
    const statement = externalStatement(input);
    const requestDigest = digestTransitionRequestCanonicalJson('{"operation":"verify"}');
    const common = {
      projectId: project.projectId,
      transitionId: created.membership.transitionId,
      source: 'provider:test',
      issuer: ISSUER,
      requestId: 'verify:1',
      requestDigest,
    };

    const first = await recordTransitionStatementMembership(db, { ...common, statement });
    const second = await recordTransitionStatementMembership(db, { ...common, statement });
    expect(first.reused).toBe(false);
    expect(second).toEqual({ membership: first.membership, reused: true });

    await expect(
      recordTransitionStatementMembership(db, {
        ...common,
        statement: externalStatement(input, 'failed'),
      })
    ).rejects.toBeInstanceOf(TransitionStatementConflictError);

    const next = externalStatement(input, 'failed');
    await recordTransitionStatementMembership(db, {
      ...common,
      statement: next,
      requestId: 'verify:2',
      requestDigest: digestTransitionRequestCanonicalJson('{"operation":"verify","run":2}'),
    });
    const memberships = await listTransitionStatementMemberships(
      db,
      project.projectId,
      created.membership.transitionId
    );
    expect(memberships).toHaveLength(2);
    expect(memberships.map((item) => item.statementDigest)).toEqual(
      [...memberships.map((item) => item.statementDigest)].sort()
    );
  });

  it('prevalidates a Statement batch before exposing any new membership', async () => {
    const project = await insertProject(db, testData.project({ name: 'Statement batch' }));
    const input = membershipInput(project.projectId, 'statement-batch');
    const created = await createTransitionProposalMembership(db, input);
    const requestId = 'verify:statement-batch';
    const requestDigest = digestTransitionRequestCanonicalJson('{"operation":"verify"}');
    await recordTransitionStatementMembership(db, {
      projectId: project.projectId,
      transitionId: created.membership.transitionId,
      statement: externalStatement(input),
      source: 'provider:existing',
      issuer: ISSUER,
      requestId,
      requestDigest,
    });
    const newIssuer = { kind: 'service' as const, id: 'service:new-verifier' };
    const newStatement = parseStatement({
      schema: 't3x/statement/v1',
      subjects: [input.effect.result],
      actor: newIssuer,
      predicateType: 'example.test/new-validation/v1',
      predicate: { outcome: 'passed' },
    });

    await expect(
      recordTransitionStatementMemberships(db, [
        {
          projectId: project.projectId,
          transitionId: created.membership.transitionId,
          statement: newStatement,
          source: 'provider:new',
          issuer: newIssuer,
          requestId,
          requestDigest,
        },
        {
          projectId: project.projectId,
          transitionId: created.membership.transitionId,
          statement: externalStatement(input, 'failed'),
          source: 'provider:existing',
          issuer: ISSUER,
          requestId,
          requestDigest,
        },
      ])
    ).rejects.toBeInstanceOf(TransitionStatementConflictError);

    const memberships = await listTransitionStatementMemberships(
      db,
      project.projectId,
      created.membership.transitionId
    );
    expect(memberships.map((membership) => membership.source)).toEqual(['provider:existing']);
  });

  it('rolls back the losing concurrent Statement batch without exposing its unique member', async () => {
    const project = await insertProject(db, testData.project({ name: 'Concurrent batch' }));
    const input = membershipInput(project.projectId, 'concurrent-statement-batch');
    const created = await createTransitionProposalMembership(db, input);
    const requestId = 'verify:concurrent-statement-batch';
    const requestDigest = digestTransitionRequestCanonicalJson('{"operation":"verify"}');
    const statement = (issuer: Statement['actor'], predicateType: string, outcome: string) =>
      parseStatement({
        schema: 't3x/statement/v1',
        subjects: [input.effect.result],
        actor: issuer,
        predicateType,
        predicate: { outcome },
      });
    const shared = {
      projectId: project.projectId,
      transitionId: created.membership.transitionId,
      source: 'provider:shared',
      issuer: ISSUER,
      requestId,
      requestDigest,
    };
    const issuerA = { kind: 'service' as const, id: 'service:batch-a' };
    const issuerB = { kind: 'service' as const, id: 'service:batch-b' };
    const runs = await Promise.allSettled([
      recordTransitionStatementMemberships(db, [
        {
          ...shared,
          statement: statement(ISSUER, 'example.test/shared/v1', 'passed'),
        },
        {
          ...shared,
          statement: statement(issuerA, 'example.test/unique-a/v1', 'passed'),
          source: 'provider:unique-a',
          issuer: issuerA,
        },
      ]),
      recordTransitionStatementMemberships(db, [
        {
          ...shared,
          statement: statement(ISSUER, 'example.test/shared/v1', 'failed'),
        },
        {
          ...shared,
          statement: statement(issuerB, 'example.test/unique-b/v1', 'passed'),
          source: 'provider:unique-b',
          issuer: issuerB,
        },
      ]),
    ]);

    expect(runs.map((run) => run.status).sort()).toEqual(['fulfilled', 'rejected']);
    const memberships = await listTransitionStatementMemberships(
      db,
      project.projectId,
      created.membership.transitionId
    );
    const sources = memberships.map((membership) => membership.source).sort();
    expect(sources).toHaveLength(2);
    expect(sources[0]).toBe('provider:shared');
    expect(['provider:unique-a', 'provider:unique-b']).toContain(sources[1]);
  });

  it('rejects claimed issuer spoofing and subjects outside the Transition graph', async () => {
    const project = await insertProject(db, testData.project({ name: 'Forgery Project' }));
    const input = membershipInput(project.projectId, 'forgery');
    const created = await createTransitionProposalMembership(db, input);
    const statement = externalStatement(input);
    const common = {
      projectId: project.projectId,
      transitionId: created.membership.transitionId,
      source: 'provider:test',
      requestId: 'verify:forgery',
      requestDigest: digestTransitionRequestCanonicalJson('{"operation":"verify"}'),
    };

    await expect(
      recordTransitionStatementMembership(db, {
        ...common,
        statement,
        issuer: { kind: 'service', id: 'service:forged' },
      })
    ).rejects.toBeInstanceOf(TransitionMembershipIntegrityError);

    const foreignState: State = {
      schema: 't3x/state/v1',
      codec: { mediaType: 'application/yaml', version: '1' },
      value: { foreign: true },
    };
    const foreign = parseStatement({
      ...statement,
      subjects: [describeTransitionObject(foreignState)],
    });
    await expect(
      recordTransitionStatementMembership(db, { ...common, statement: foreign, issuer: ISSUER })
    ).rejects.toBeInstanceOf(TransitionMembershipIntegrityError);
  });

  it('re-hashes stored bytes and rejects a tampered object before projection', async () => {
    const project = await insertProject(db, testData.project({ name: 'Tamper Project' }));
    const input = membershipInput(project.projectId, 'tamper');
    const created = await createTransitionProposalMembership(db, input);

    await sql`
      UPDATE transition_objects
      SET canonical_json = ${'{"schema":"t3x/state/v1","codec":{"mediaType":"application/yaml","version":"1"},"value":{"tampered":true}}'}
      WHERE digest = ${input.effect.base.digest}
    `;

    await expect(
      resolveTransitionProposalGraph(db, project.projectId, created.membership.transitionId)
    ).rejects.toBeInstanceOf(TransitionMembershipIntegrityError);
  });

  it('rejects tampered server preparation before a provider can consume it', async () => {
    const project = await insertProject(db, testData.project({ name: 'Preparation Tamper' }));
    const input = membershipInput(project.projectId, 'preparation-tamper');
    const preparationCanonicalJson = '{"artifact":{"root_path":"device.yaml"}}';
    const created = await createTransitionProposalMembership(db, {
      ...input,
      preparationCanonicalJson,
      preparationDigest: digestTransitionPreparationCanonicalJson(preparationCanonicalJson),
    });

    await sql`
      UPDATE transition_proposal_preparations
      SET canonical_json = ${'{"artifact":{"root_path":"tampered.yaml"}}'}
      WHERE transition_id = ${created.membership.transitionId}
    `;

    await expect(
      resolveTransitionProposalGraph(db, project.projectId, created.membership.transitionId)
    ).rejects.toBeInstanceOf(TransitionMembershipIntegrityError);
  });

  it('stores no mutable lifecycle status in either membership table', async () => {
    const columns = await sql<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (
          'transition_proposal_memberships',
          'transition_proposal_preparations',
          'transition_statement_memberships'
        )
    `;
    expect(columns.map((column) => column.column_name)).not.toContain('status');
    expect(columns.map((column) => column.column_name)).not.toContain('outcome');
  });
});
