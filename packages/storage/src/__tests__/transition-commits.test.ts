import {
  authorizeDecisionForRepository,
  buildReplayVerificationStatement,
  type CommitDescriptor,
  createAcceptancePolicyResource,
  createCommitV2,
  describeCommitV2,
  describeTransitionObject,
  type Effect,
  InMemoryTransitionObjectResolver,
  type ProposalStatement,
  parseAcceptancePolicy,
  type RepositoryDecisionAuthority,
  type RepositoryDecisionAuthorization,
  type State,
} from '@t3x-dev/core';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { ensureMainBranch, findBranchByName, insertBranch } from '../queries/branches';
import { createCommit, SupersededYOpsLogIdsError } from '../queries/commits';
import { insertConversation } from '../queries/conversations';
import { deleteProject, insertProject, permanentDeleteProject } from '../queries/projects';
import {
  createTransitionCommit,
  DecisionNotAuthorizedError,
  DecisionRecordConflictError,
  DecisionRecordIntegrityError,
  getRepositoryDecisionAudit,
  getTransitionCommit,
  getTransitionRefHead,
  getTransitionViewForCommit,
  getVerifiedTransitionCommitGraph,
  listCommitHistory,
  listRepositoryDecisionAudit,
  listTransitionCommits,
  recordRepositoryDecision,
  recordRepositoryDecisionAuthorization,
  TransitionHeadConflictError,
  TransitionParentProjectMembershipError,
  TransitionProjectionAuthorizationInvalidError,
  TransitionYOpsLogMembershipError,
  TransitionRefHeadIntegrityError,
} from '../queries/transition-commits';
import {
  deleteYOpsLogEntry,
  findCommitHashesByYOpsLogIds,
  getYOpsForTransitionCommit,
  getYOpsLogEntry,
  insertYOpsLogEntry,
  supersedeActiveUncommittedYOpsLogEntries,
} from '../queries/yops-log';
import { branches } from '../schema';
import {
  transitionDecisionAuthorizations,
  transitionDecisionLedger,
  transitionCommits,
  transitionObjects,
} from '../schema-transition-commits';
import { createTestDB, testData } from './setup';

const DECIDED_AT = '2026-07-28T00:00:00.000Z';

function state(value: Record<string, unknown>): State {
  return {
    schema: 't3x/state/v1',
    codec: { mediaType: 'application/yaml', version: '1' },
    value,
  } as State;
}

function graph(base: State, result: State, suffix: string) {
  const effect: Effect = {
    schema: 't3x/effect/v1',
    base: describeTransitionObject(base),
    driver: {
      protocol: 't3x.dev/test',
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
    actor: { kind: 'agent', id: `agent:planner:${suffix}` },
    predicateType: 't3x.proposal/v1',
    predicate: {
      intent: { mode: 'inferred', value: `Apply ${suffix}`, evidence: [] },
      rationale: { mode: 'authored', value: `Prepare ${suffix}`, evidence: [] },
    },
  };
  const replay = buildReplayVerificationStatement({
    effect,
    actor: { kind: 'service', id: 'service:replay' },
    predicate: {
      outcome: 'verified',
      result: effect.result,
      tool: { name: 'test-replay', version: '1' },
      run: { id: `run:${suffix}`, recordedAt: DECIDED_AT },
      environment: { mode: 'unspecified' },
    },
  });
  return { base, result, effect, proposal, replay };
}

function authority(subject: ReturnType<typeof graph>): RepositoryDecisionAuthority {
  const bound = createAcceptancePolicyResource({
    policy: parseAcceptancePolicy({
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
          requirement: 'optional',
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
    }),
    uri: 't3x://project/policies/default',
  });
  return {
    async resolve() {
      return {
        actorContext: { actor: { kind: 'human', id: 'human:maintainer' } },
        observationScope: { completeness: 'complete', sources: ['project-store'] },
        policy: bound.policy,
        policyResource: bound.resource,
        statements: [{ statement: subject.replay, issuerContext: { actor: subject.replay.actor } }],
      };
    },
  };
}

async function prepare(
  projectId: string,
  refName: string,
  base: State,
  result: State,
  suffix: string,
  parents: readonly CommitDescriptor[] = []
) {
  const subject = graph(base, result, suffix);
  const issued = await authorizeDecisionForRepository({
    projectId,
    refName,
    proposal: subject.proposal,
    effect: subject.effect,
    outcome: 'accepted',
    rationale: { mode: 'unspecified' },
    decidedAt: DECIDED_AT,
    authority: authority(subject),
  });
  if (!issued.ok || issued.authorization === null) {
    throw new Error('Fixture Decision authorization failed');
  }
  const objects = [subject.base, subject.result, ...issued.authorization.objects];
  const resolver = new InMemoryTransitionObjectResolver(objects);
  for (const parent of parents) {
    const stored = await getTransitionCommit(db, projectId, parent.digest);
    if (stored !== null) resolver.put(stored.commit);
  }
  const commit = await createCommitV2({
    parents,
    decision: issued.decision,
    resolver,
  });
  return { subject, issued, commit, objects };
}

let db: AnyDB;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const setup = await createTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
});

afterAll(async () => cleanup());

describe('CommitV2 repository', () => {
  it('classifies empty and legacy ref heads without fabricating Transition assurance', async () => {
    const emptyProject = await insertProject(db, testData.project({ name: 'Empty Ref Project' }));
    await ensureMainBranch(db, emptyProject.projectId);
    await expect(
      getTransitionRefHead(db, { projectId: emptyProject.projectId, refName: 'main' })
    ).resolves.toEqual({ format: 'empty', refName: 'main', head: null });

    const legacyProject = await insertProject(db, testData.project({ name: 'Legacy Ref Project' }));
    await ensureMainBranch(db, legacyProject.projectId);
    const legacy = await createCommit(db, {
      project_id: legacyProject.projectId,
      content: { trees: [], relations: [] },
      author: { type: 'human', id: 'human:legacy' },
      branch: 'main',
      enforceBranchLinearity: true,
    });
    await expect(
      getTransitionRefHead(db, { projectId: legacyProject.projectId, refName: 'main' })
    ).resolves.toEqual({ format: 'legacy_v1', refName: 'main', head: legacy.hash });
  });

  it('returns only a verified CommitV2 result State as a ref base', async () => {
    const project = await insertProject(db, testData.project({ name: 'Verified Ref Project' }));
    await ensureMainBranch(db, project.projectId);
    const prepared = await prepare(
      project.projectId,
      'main',
      state({}),
      state({ device: 'verified-head' }),
      'verified-head'
    );
    await recordRepositoryDecisionAuthorization(db, prepared.issued.authorization);
    const created = await createTransitionCommit(db, {
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      commit: prepared.commit,
      objects: prepared.objects,
    });

    await expect(
      getTransitionRefHead(db, { projectId: project.projectId, refName: 'main' })
    ).resolves.toMatchObject({
      format: 'transition_v2',
      refName: 'main',
      head: created.digest,
      commit: prepared.commit,
      state: prepared.subject.result,
    });
  });

  it('fails closed when a ref points to a commit outside its project', async () => {
    const owner = await insertProject(db, testData.project({ name: 'Head Owner Project' }));
    await ensureMainBranch(db, owner.projectId);
    const legacy = await createCommit(db, {
      project_id: owner.projectId,
      content: { trees: [], relations: [] },
      author: { type: 'human', id: 'human:owner' },
    });
    const other = await insertProject(db, testData.project({ name: 'Cross Project Head' }));
    await ensureMainBranch(db, other.projectId);
    await db
      .update(branches)
      .set({ headCommitHash: legacy.hash })
      .where(and(eq(branches.projectId, other.projectId), eq(branches.name, 'main')));

    await expect(
      getTransitionRefHead(db, { projectId: other.projectId, refName: 'main' })
    ).rejects.toBeInstanceOf(TransitionRefHeadIntegrityError);
  });

  it('requires the unforgeable issuance capability before recording authority', async () => {
    const project = await insertProject(db, testData.project({ name: 'Capability Project' }));
    await ensureMainBranch(db, project.projectId);
    const prepared = await prepare(
      project.projectId,
      'main',
      state({}),
      state({ device: 'one' }),
      'capability'
    );
    const forged = { ...prepared.issued.authorization } as RepositoryDecisionAuthorization;
    await expect(recordRepositoryDecisionAuthorization(db, forged)).rejects.toThrow(
      'was not issued by the trusted service'
    );
    await expect(recordRepositoryDecision(db, { ...prepared.issued.record })).rejects.toThrow(
      'was not issued by the trusted service'
    );
    await recordRepositoryDecision(db, prepared.issued.record);
    await expect(
      createTransitionCommit(db, {
        projectId: project.projectId,
        refName: 'main',
        expectedHead: null,
        commit: prepared.commit,
        objects: prepared.objects,
      })
    ).rejects.toBeInstanceOf(DecisionNotAuthorizedError);
    expect(await listTransitionCommits(db, project.projectId)).toEqual([]);
  });

  it('durably records rejection without granting commit authority or rebinding its ref', async () => {
    const project = await insertProject(db, testData.project({ name: 'Decision Ledger Project' }));
    const branch = await ensureMainBranch(db, project.projectId);
    await insertBranch(db, { projectId: project.projectId, name: 'other' });
    const subject = graph(state({}), state({ device: 'revise-me' }), 'rejected-ledger');
    const rejected = await authorizeDecisionForRepository({
      projectId: project.projectId,
      refName: 'main',
      proposal: subject.proposal,
      effect: subject.effect,
      outcome: 'rejected',
      rationale: { mode: 'authored', value: 'Revise the proposal', evidence: [] },
      decidedAt: DECIDED_AT,
      authority: authority(subject),
    });
    if (!rejected.ok) throw new Error('Fixture rejection failed');

    await recordRepositoryDecision(db, rejected.record);
    await recordRepositoryDecision(db, rejected.record);

    const entry = await getRepositoryDecisionAudit(db, {
      projectId: project.projectId,
      refName: 'main',
      decisionDigest: describeTransitionObject(rejected.decision).digest,
    });
    expect(entry).toMatchObject({
      projectId: project.projectId,
      refName: 'main',
      decision: { predicate: { outcome: 'rejected' } },
      proposal: subject.proposal,
      effect: subject.effect,
      observations: [{ issuerContext: { actor: subject.replay.actor } }],
    });
    expect(
      await listRepositoryDecisionAudit(db, {
        projectId: project.projectId,
        refName: 'main',
      })
    ).toHaveLength(1);
    expect((await findBranchByName(db, project.projectId, branch.name))?.headCommitHash).toBeNull();
    expect(await listTransitionCommits(db, project.projectId)).toEqual([]);

    const rebound = await authorizeDecisionForRepository({
      projectId: project.projectId,
      refName: 'other',
      proposal: subject.proposal,
      effect: subject.effect,
      outcome: 'rejected',
      rationale: { mode: 'authored', value: 'Revise the proposal', evidence: [] },
      decidedAt: DECIDED_AT,
      authority: authority(subject),
    });
    if (!rebound.ok) throw new Error('Fixture rebound rejection failed');
    expect(describeTransitionObject(rebound.decision)).toEqual(
      describeTransitionObject(rejected.decision)
    );
    await expect(recordRepositoryDecision(db, rebound.record)).rejects.toBeInstanceOf(
      DecisionRecordConflictError
    );
  });

  it('preserves Decision audit on soft delete and removes it on permanent project deletion', async () => {
    const project = await insertProject(db, testData.project({ name: 'Audit Retention Project' }));
    await ensureMainBranch(db, project.projectId);
    const subject = graph(state({}), state({ device: 'retain-me' }), 'audit-retention');
    const rejected = await authorizeDecisionForRepository({
      projectId: project.projectId,
      refName: 'main',
      proposal: subject.proposal,
      effect: subject.effect,
      outcome: 'rejected',
      rationale: { mode: 'authored', value: 'Revise the proposal', evidence: [] },
      decidedAt: DECIDED_AT,
      authority: authority(subject),
    });
    if (!rejected.ok) throw new Error('Fixture rejection failed');
    const decisionDigest = describeTransitionObject(rejected.decision).digest;
    await recordRepositoryDecision(db, rejected.record);

    expect(await deleteProject(db, project.projectId)).toBe(true);
    expect(
      await getRepositoryDecisionAudit(db, {
        projectId: project.projectId,
        refName: 'main',
        decisionDigest,
      })
    ).not.toBeNull();

    expect(await permanentDeleteProject(db, project.projectId)).toBe(true);
    expect(
      await getRepositoryDecisionAudit(db, {
        projectId: project.projectId,
        refName: 'main',
        decisionDigest,
      })
    ).toBeNull();
  });

  it('fails closed when persisted Decision audit issuer facts are corrupted', async () => {
    const project = await insertProject(db, testData.project({ name: 'Audit Integrity Project' }));
    await ensureMainBranch(db, project.projectId);
    const subject = graph(state({}), state({ device: 'audit' }), 'audit-integrity');
    const issued = await authorizeDecisionForRepository({
      projectId: project.projectId,
      refName: 'main',
      proposal: subject.proposal,
      effect: subject.effect,
      outcome: 'rejected',
      rationale: { mode: 'unspecified' },
      decidedAt: DECIDED_AT,
      authority: authority(subject),
    });
    if (!issued.ok) throw new Error('Fixture Decision failed');
    const digest = describeTransitionObject(issued.decision).digest;
    await recordRepositoryDecision(db, issued.record);
    await db
      .update(transitionDecisionLedger)
      .set({ statementIssuers: [] })
      .where(eq(transitionDecisionLedger.decisionDigest, digest));

    await expect(
      getRepositoryDecisionAudit(db, {
        projectId: project.projectId,
        refName: 'main',
        decisionDigest: digest,
      })
    ).rejects.toBeInstanceOf(DecisionRecordIntegrityError);
  });

  it('fails closed when a persisted Decision graph object is missing', async () => {
    const project = await insertProject(db, testData.project({ name: 'Audit Graph Project' }));
    await ensureMainBranch(db, project.projectId);
    const subject = graph(state({}), state({ device: 'graph' }), 'audit-graph');
    const issued = await authorizeDecisionForRepository({
      projectId: project.projectId,
      refName: 'main',
      proposal: subject.proposal,
      effect: subject.effect,
      outcome: 'rejected',
      rationale: { mode: 'unspecified' },
      decidedAt: DECIDED_AT,
      authority: authority(subject),
    });
    if (!issued.ok) throw new Error('Fixture Decision failed');
    const digest = describeTransitionObject(issued.decision).digest;
    await recordRepositoryDecision(db, issued.record);
    await db
      .delete(transitionObjects)
      .where(eq(transitionObjects.digest, describeTransitionObject(subject.proposal).digest));

    await expect(
      getRepositoryDecisionAudit(db, {
        projectId: project.projectId,
        refName: 'main',
        decisionDigest: digest,
      })
    ).rejects.toThrow('was not found');
  });

  it('orders Decision audit by repository time rather than claimed decidedAt', async () => {
    const project = await insertProject(db, testData.project({ name: 'Audit Ordering Project' }));
    await ensureMainBranch(db, project.projectId);
    const firstSubject = graph(state({}), state({ device: 'first' }), 'audit-first');
    const secondSubject = graph(state({}), state({ device: 'second' }), 'audit-second');
    const first = await authorizeDecisionForRepository({
      projectId: project.projectId,
      refName: 'main',
      proposal: firstSubject.proposal,
      effect: firstSubject.effect,
      outcome: 'accepted',
      rationale: { mode: 'unspecified' },
      decidedAt: '2030-01-01T00:00:00.000Z',
      authority: authority(firstSubject),
    });
    const second = await authorizeDecisionForRepository({
      projectId: project.projectId,
      refName: 'main',
      proposal: secondSubject.proposal,
      effect: secondSubject.effect,
      outcome: 'accepted',
      rationale: { mode: 'unspecified' },
      decidedAt: '2020-01-01T00:00:00.000Z',
      authority: authority(secondSubject),
    });
    if (!first.ok || !second.ok) throw new Error('Fixture Decisions failed');
    await recordRepositoryDecision(db, first.record);
    await recordRepositoryDecision(db, second.record);
    const firstDigest = describeTransitionObject(first.decision).digest;
    const secondDigest = describeTransitionObject(second.decision).digest;
    await db
      .update(transitionDecisionLedger)
      .set({ recordedAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(transitionDecisionLedger.decisionDigest, firstDigest));
    await db
      .update(transitionDecisionLedger)
      .set({ recordedAt: new Date('2026-01-02T00:00:00.000Z') })
      .where(eq(transitionDecisionLedger.decisionDigest, secondDigest));

    const page = await listRepositoryDecisionAudit(db, {
      projectId: project.projectId,
      refName: 'main',
      limit: 1,
    });
    expect(page.map((entry) => entry.decisionDigest)).toEqual([secondDigest]);
    expect(
      (
        await listRepositoryDecisionAudit(db, {
          projectId: project.projectId,
          refName: 'main',
          limit: 1,
          offset: 1,
        })
      ).map((entry) => entry.decisionDigest)
    ).toEqual([firstDigest]);
  });

  it('persists canonical CommitV2 bytes and advances the ref only after exact authorization', async () => {
    const project = await insertProject(db, testData.project({ name: 'CommitV2 Project' }));
    const branch = await ensureMainBranch(db, project.projectId);
    const prepared = await prepare(
      project.projectId,
      'main',
      state({}),
      state({ device: 'kitchen' }),
      'genesis'
    );
    await recordRepositoryDecisionAuthorization(db, prepared.issued.authorization);
    const audit = await getRepositoryDecisionAudit(db, {
      projectId: project.projectId,
      refName: 'main',
      decisionDigest: describeTransitionObject(prepared.issued.decision).digest,
    });
    const created = await createTransitionCommit(db, {
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      commit: prepared.commit,
      objects: prepared.objects,
    });
    const stored = await getTransitionCommit(db, project.projectId, created.digest);

    expect(created.mediaType).toBe('application/vnd.t3x.commit-v2+json');
    expect(audit).toMatchObject({ outcome: 'accepted', decision: prepared.issued.decision });
    expect(stored?.commit).toEqual(prepared.commit);
    const refreshed = await findBranchByName(db, project.projectId, branch.name);
    expect(refreshed?.headCommitHash).toBe(created.digest);
  });

  it('rejects a parent CommitV2 that has no membership in the repository project', async () => {
    const sourceProject = await insertProject(
      db,
      testData.project({ name: 'CommitV2 Source Membership Project' })
    );
    await ensureMainBranch(db, sourceProject.projectId);
    const parent = await prepare(
      sourceProject.projectId,
      'main',
      state({}),
      state({ version: 1 }),
      'membership-parent'
    );
    await recordRepositoryDecisionAuthorization(db, parent.issued.authorization);
    const parentCreated = await createTransitionCommit(db, {
      projectId: sourceProject.projectId,
      refName: 'main',
      expectedHead: null,
      commit: parent.commit,
      objects: parent.objects,
    });
    const child = await prepare(
      sourceProject.projectId,
      'main',
      parent.subject.result,
      state({ version: 2 }),
      'membership-child',
      [describeCommitV2(parent.commit)]
    );
    await recordRepositoryDecisionAuthorization(db, child.issued.authorization);
    const childCreated = await createTransitionCommit(db, {
      projectId: sourceProject.projectId,
      refName: 'main',
      expectedHead: parentCreated.digest,
      commit: child.commit,
      objects: child.objects,
    });

    const targetProject = await insertProject(
      db,
      testData.project({ name: 'CommitV2 Target Membership Project' })
    );
    await ensureMainBranch(db, targetProject.projectId);
    await db
      .update(branches)
      .set({ headCommitHash: parentCreated.digest })
      .where(and(eq(branches.projectId, targetProject.projectId), eq(branches.name, 'main')));
    await expect(
      createTransitionCommit(db, {
        projectId: targetProject.projectId,
        refName: 'main',
        expectedHead: parentCreated.digest,
        commit: child.commit,
        objects: child.objects,
      })
    ).rejects.toBeInstanceOf(TransitionParentProjectMembershipError);

    await db.insert(transitionCommits).values({
      projectId: targetProject.projectId,
      digest: childCreated.digest,
      mediaType: childCreated.mediaType,
    });

    await expect(
      getVerifiedTransitionCommitGraph(db, targetProject.projectId, childCreated.digest)
    ).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
  });

  it('records CommitV2 YOps consumption atomically and protects the consumed rows', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'CommitV2 YOps Consumption Project' })
    );
    await ensureMainBranch(db, project.projectId);
    const conversation = await insertConversation(db, {
      projectId: project.projectId,
      title: 'CommitV2 YOps source',
    });
    const yops = await insertYOpsLogEntry(db, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      source: 'manual',
      yops: [
        {
          define: { path: 'device' },
          source: { type: 'human', author: 'transition-test', at: DECIDED_AT },
        },
      ],
    });
    const prepared = await prepare(
      project.projectId,
      'main',
      state({}),
      state({ device: true }),
      'yops-consumption'
    );
    await recordRepositoryDecisionAuthorization(db, prepared.issued.authorization);
    const created = await createTransitionCommit(db, {
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      commit: prepared.commit,
      objects: prepared.objects,
      yopsLogIds: [yops.id],
    });

    const commitByYOpsId = await findCommitHashesByYOpsLogIds(db, project.projectId, [yops.id]);
    expect(commitByYOpsId.get(yops.id)).toEqual([created.digest]);
    await expect(getYOpsForTransitionCommit(db, project.projectId, created.digest)).resolves.toEqual([
      expect.objectContaining({ id: yops.id, supersededAt: null }),
    ]);
    await expect(
      supersedeActiveUncommittedYOpsLogEntries(db, conversation.conversationId)
    ).resolves.toEqual([]);
    await expect(deleteYOpsLogEntry(db, yops.id)).resolves.toBeUndefined();
    await expect(getYOpsLogEntry(db, yops.id)).resolves.toMatchObject({
      id: yops.id,
      supersededAt: null,
    });
  });

  it('rejects CommitV2 consumption rows from another project without advancing the ref', async () => {
    const sourceProject = await insertProject(
      db,
      testData.project({ name: 'Foreign YOps Source Project' })
    );
    const conversation = await insertConversation(db, {
      projectId: sourceProject.projectId,
      title: 'Foreign YOps source',
    });
    const yops = await insertYOpsLogEntry(db, {
      projectId: sourceProject.projectId,
      conversationId: conversation.conversationId,
      source: 'manual',
      yops: [
        {
          define: { path: 'foreign' },
          source: { type: 'human', author: 'transition-test', at: DECIDED_AT },
        },
      ],
    });
    const targetProject = await insertProject(
      db,
      testData.project({ name: 'Foreign YOps Target Project' })
    );
    await ensureMainBranch(db, targetProject.projectId);
    const prepared = await prepare(
      targetProject.projectId,
      'main',
      state({}),
      state({ accepted: false }),
      'foreign-yops'
    );
    await recordRepositoryDecisionAuthorization(db, prepared.issued.authorization);

    await expect(
      createTransitionCommit(db, {
        projectId: targetProject.projectId,
        refName: 'main',
        expectedHead: null,
        commit: prepared.commit,
        objects: prepared.objects,
        yopsLogIds: [yops.id],
      })
    ).rejects.toBeInstanceOf(TransitionYOpsLogMembershipError);
    await expect(
      getTransitionRefHead(db, { projectId: targetProject.projectId, refName: 'main' })
    ).resolves.toEqual({ format: 'empty', refName: 'main', head: null });
  });

  it('serializes CommitV2 consumption against superseding the same YOps row', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'CommitV2 YOps Concurrency Project' })
    );
    await ensureMainBranch(db, project.projectId);
    const conversation = await insertConversation(db, {
      projectId: project.projectId,
      title: 'Contested YOps source',
    });
    const yops = await insertYOpsLogEntry(db, {
      projectId: project.projectId,
      conversationId: conversation.conversationId,
      source: 'manual',
      yops: [
        {
          define: { path: 'contested' },
          source: { type: 'human', author: 'transition-test', at: DECIDED_AT },
        },
      ],
    });
    const prepared = await prepare(
      project.projectId,
      'main',
      state({}),
      state({ contested: true }),
      'contested-yops'
    );
    await recordRepositoryDecisionAuthorization(db, prepared.issued.authorization);

    const [commitResult, supersedeResult] = await Promise.allSettled([
      createTransitionCommit(db, {
        projectId: project.projectId,
        refName: 'main',
        expectedHead: null,
        commit: prepared.commit,
        objects: prepared.objects,
        yopsLogIds: [yops.id],
      }),
      supersedeActiveUncommittedYOpsLogEntries(db, conversation.conversationId),
    ]);
    const finalYOps = await getYOpsLogEntry(db, yops.id);

    if (commitResult.status === 'fulfilled') {
      expect(finalYOps?.supersededAt).toBeNull();
      if (supersedeResult.status === 'fulfilled') {
        expect(supersedeResult.value).not.toContain(yops.id);
      }
    } else {
      expect(commitResult.reason).toBeInstanceOf(SupersededYOpsLogIdsError);
      expect(finalYOps?.supersededAt).toBeInstanceOf(Date);
    }
  });

  it('recursively verifies every ancestor Transition graph', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'CommitV2 Recursive Integrity Project' })
    );
    await ensureMainBranch(db, project.projectId);
    const parent = await prepare(
      project.projectId,
      'main',
      state({}),
      state({ version: 1 }),
      'recursive-parent'
    );
    await recordRepositoryDecisionAuthorization(db, parent.issued.authorization);
    const parentCreated = await createTransitionCommit(db, {
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      commit: parent.commit,
      objects: parent.objects,
    });
    const child = await prepare(
      project.projectId,
      'main',
      parent.subject.result,
      state({ version: 2 }),
      'recursive-child',
      [describeCommitV2(parent.commit)]
    );
    await recordRepositoryDecisionAuthorization(db, child.issued.authorization);
    const childCreated = await createTransitionCommit(db, {
      projectId: project.projectId,
      refName: 'main',
      expectedHead: parentCreated.digest,
      commit: child.commit,
      objects: child.objects,
    });

    await db
      .delete(transitionObjects)
      .where(eq(transitionObjects.digest, describeTransitionObject(parent.subject.proposal).digest));

    await expect(
      getVerifiedTransitionCommitGraph(db, project.projectId, childCreated.digest)
    ).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
  });

  it('derives a committed TransitionView from verified objects and trusted issuer facts', async () => {
    const project = await insertProject(db, testData.project({ name: 'Transition View Project' }));
    await ensureMainBranch(db, project.projectId);
    const prepared = await prepare(
      project.projectId,
      'main',
      state({}),
      state({ device: 'office' }),
      'view'
    );
    await recordRepositoryDecisionAuthorization(db, prepared.issued.authorization);
    const created = await createTransitionCommit(db, {
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      commit: prepared.commit,
      objects: prepared.objects,
    });

    const view = await getTransitionViewForCommit(db, {
      projectId: project.projectId,
      refName: 'main',
      commitId: created.digest,
    });

    expect(view).toMatchObject({
      schema: 't3x.dev/transition-view/v1',
      mode: 'transition',
      claims: {
        actor: prepared.subject.proposal.actor,
        intent: { mode: 'inferred', origin: 'inferred', value: 'Apply view' },
        rationale: { mode: 'authored', origin: 'actor_authored', value: 'Prepare view' },
      },
      checks: {
        objectIntegrity: 'verified',
        observationScope: { completeness: 'complete', sources: ['project-store'] },
        replay: { observation: 'observed', outcomes: ['verified'] },
      },
      decision: { observation: 'supplied', outcome: 'accepted' },
      history: { observation: 'committed', commit: { id: created.digest } },
    });
    expect(view).toHaveProperty('audit.statements.0.issuerActor', prepared.subject.replay.actor);
  });

  it('fails closed when trusted issuer facts are missing or the ref is wrong', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Transition View Trust Project' })
    );
    await ensureMainBranch(db, project.projectId);
    await insertBranch(db, { projectId: project.projectId, name: 'other' });
    const prepared = await prepare(
      project.projectId,
      'main',
      state({}),
      state({ device: 'trusted' }),
      'trusted-view'
    );
    await recordRepositoryDecisionAuthorization(db, prepared.issued.authorization);
    const created = await createTransitionCommit(db, {
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      commit: prepared.commit,
      objects: prepared.objects,
    });

    await expect(
      getTransitionViewForCommit(db, {
        projectId: project.projectId,
        refName: 'other',
        commitId: created.digest,
      })
    ).rejects.toBeInstanceOf(TransitionProjectionAuthorizationInvalidError);

    await db
      .update(transitionDecisionAuthorizations)
      .set({
        statementIssuers: [
          {
            statement: describeTransitionObject(prepared.subject.replay),
            actor: { kind: 'service', id: '' },
          },
        ],
      })
      .where(
        and(
          eq(transitionDecisionAuthorizations.projectId, project.projectId),
          eq(transitionDecisionAuthorizations.refName, 'main'),
          eq(transitionDecisionAuthorizations.decisionDigest, prepared.commit.decision.digest)
        )
      );
    await expect(
      getTransitionViewForCommit(db, {
        projectId: project.projectId,
        refName: 'main',
        commitId: created.digest,
      })
    ).rejects.toBeInstanceOf(TransitionProjectionAuthorizationInvalidError);

    await db
      .update(transitionDecisionAuthorizations)
      .set({ statementIssuers: [] })
      .where(
        and(
          eq(transitionDecisionAuthorizations.projectId, project.projectId),
          eq(transitionDecisionAuthorizations.refName, 'main'),
          eq(transitionDecisionAuthorizations.decisionDigest, prepared.commit.decision.digest)
        )
      );
    await expect(
      getTransitionViewForCommit(db, {
        projectId: project.projectId,
        refName: 'main',
        commitId: created.digest,
      })
    ).rejects.toBeInstanceOf(TransitionProjectionAuthorizationInvalidError);
  });

  it('binds authorization to the exact project and ref', async () => {
    const project = await insertProject(db, testData.project({ name: 'Ref Binding Project' }));
    await ensureMainBranch(db, project.projectId);
    await insertBranch(db, { projectId: project.projectId, name: 'other' });
    const prepared = await prepare(
      project.projectId,
      'main',
      state({}),
      state({ device: 'bound' }),
      'ref-bound'
    );
    await recordRepositoryDecisionAuthorization(db, prepared.issued.authorization);
    await expect(
      createTransitionCommit(db, {
        projectId: project.projectId,
        refName: 'other',
        expectedHead: null,
        commit: prepared.commit,
        objects: prepared.objects,
      })
    ).rejects.toBeInstanceOf(DecisionNotAuthorizedError);
  });

  it('allows exactly one writer to win an expected-head race', async () => {
    const project = await insertProject(db, testData.project({ name: 'CAS Project' }));
    await ensureMainBranch(db, project.projectId);
    const genesis = await prepare(
      project.projectId,
      'main',
      state({}),
      state({ version: 1 }),
      'cas-genesis'
    );
    await recordRepositoryDecisionAuthorization(db, genesis.issued.authorization);
    const first = await createTransitionCommit(db, {
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      commit: genesis.commit,
      objects: genesis.objects,
    });
    const parent = describeCommitV2(genesis.commit);
    const left = await prepare(
      project.projectId,
      'main',
      genesis.subject.result,
      state({ version: 2, writer: 'left' }),
      'left',
      [parent]
    );
    const right = await prepare(
      project.projectId,
      'main',
      genesis.subject.result,
      state({ version: 2, writer: 'right' }),
      'right',
      [parent]
    );
    await Promise.all([
      recordRepositoryDecisionAuthorization(db, left.issued.authorization),
      recordRepositoryDecisionAuthorization(db, right.issued.authorization),
    ]);
    const attempts = await Promise.allSettled([
      createTransitionCommit(db, {
        projectId: project.projectId,
        refName: 'main',
        expectedHead: first.digest,
        commit: left.commit,
        objects: left.objects,
      }),
      createTransitionCommit(db, {
        projectId: project.projectId,
        refName: 'main',
        expectedHead: first.digest,
        commit: right.commit,
        objects: right.objects,
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    const failure = attempts.find((attempt) => attempt.status === 'rejected');
    expect(failure).toMatchObject({ reason: expect.any(TransitionHeadConflictError) });
    if (failure?.status === 'rejected') {
      expect(failure.reason).toMatchObject({ code: 'STALE_BASE', expectedHead: first.digest });
    }
  });

  it('lists CommitV1 and CommitV2 together without promoting legacy assurance', async () => {
    const project = await insertProject(db, testData.project({ name: 'Mixed History Project' }));
    await ensureMainBranch(db, project.projectId);
    const legacy = await createCommit(db, {
      project_id: project.projectId,
      content: { trees: [], relations: [] },
      author: { type: 'human', id: 'human:legacy' },
      branch: 'legacy',
    });
    const prepared = await prepare(
      project.projectId,
      'main',
      state({}),
      state({ device: 'v2' }),
      'mixed'
    );
    await recordRepositoryDecisionAuthorization(db, prepared.issued.authorization);
    await createTransitionCommit(db, {
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      commit: prepared.commit,
      objects: prepared.objects,
    });

    const history = await listCommitHistory(db, project.projectId);
    const legacyEntry = history.find((entry) => entry.format === 'legacy_v1');
    expect(history.map((entry) => entry.format).sort()).toEqual(['legacy_v1', 'transition_v2']);
    expect(legacyEntry).toMatchObject({
      id: legacy.hash,
      assurance: { mode: 'legacy_unavailable' },
    });
    expect(legacyEntry).not.toHaveProperty('decision');

    const legacyView = await getTransitionViewForCommit(db, {
      projectId: project.projectId,
      refName: 'legacy',
      commitId: legacy.hash,
    });
    expect(legacyView).toMatchObject({
      schema: 't3x.dev/transition-view/v1',
      mode: 'legacy',
      claims: { observation: 'unavailable', reason: 'legacy_v1' },
      checks: { observation: 'unavailable', reason: 'legacy_v1' },
    });
    await expect(
      getTransitionViewForCommit(db, {
        projectId: project.projectId,
        refName: 'main',
        commitId: legacy.hash,
      })
    ).resolves.toBeNull();
  });
});
