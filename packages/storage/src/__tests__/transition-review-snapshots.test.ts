import {
  describeTransitionObject,
  type Effect,
  type ProposalStatement,
  type State,
} from '@t3x-dev/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  createTransitionProposalMembership,
  digestTransitionRequestCanonicalJson,
} from '../queries/transition-memberships';
import {
  getLatestTransitionReviewSnapshot,
  getTransitionReviewSnapshot,
  saveTransitionReviewSnapshot,
  TransitionReviewSnapshotConflictError,
} from '../queries/transition-review-snapshots';
import { createTestDB } from './setup';

const ACTOR = { kind: 'agent' as const, id: 'agent:review-snapshot-test' };
const POLICY_DIGEST = `sha256:${'f'.repeat(64)}`;
const REVIEW_DIGEST = `sha256:${'9'.repeat(64)}`;

function digest(seed: string): string {
  return `sha256:${seed.repeat(64)}`;
}

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
      specDigest: digest('a'),
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

async function transitionMembership(projectId: string, suffix: string) {
  const graph = transitionGraph(suffix);
  const requestCanonicalJson = JSON.stringify({
    kind: 'structured_yops',
    workspace_id: `ws_review_${suffix}`,
  });
  return createTransitionProposalMembership(db, {
    projectId,
    workspaceId: `ws_review_${suffix}`,
    workspaceRevision: 1,
    refName: 'main',
    refHead: null,
    requestKind: 'structured_yops',
    requestCanonicalJson,
    requestDigest: digestTransitionRequestCanonicalJson(requestCanonicalJson),
    requestId: `request:${suffix}`,
    actor: ACTOR,
    ...graph,
  });
}

function snapshot(input: {
  projectId: string;
  workspaceId: string;
  transitionId: string;
  suffix: string;
  createdAt?: string;
}) {
  const snapshotDigest = digest(input.suffix);
  const snapshotId = `rvs_${input.suffix.repeat(32).slice(0, 32)}`;
  const createdAt = input.createdAt ?? `2026-08-17T00:00:0${input.suffix.length}.000Z`;
  const review = {
    digest: REVIEW_DIGEST,
    precondition: {
      workspaceRevision: 1,
      refName: 'main',
      refHead: null,
      effectDigest: digest('1'),
      proposalDigest: digest('2'),
      statementDigests: [digest('3')],
      policyDigest: POLICY_DIGEST,
    },
  };
  const objects = {
    base: { kind: 'state', schema: 't3x/state/v1', digest: digest('4') },
    result: { kind: 'state', schema: 't3x/state/v1', digest: digest('5') },
    effect: { kind: 'effect', schema: 't3x/effect/v1', digest: digest('1') },
    proposal: { kind: 'statement', schema: 't3x/statement/v1', digest: digest('2') },
    statements: [],
  };
  const reviewSnapshot = {
    schema: 't3x.application/review-snapshot/v1',
    version: 1,
    snapshotId,
    snapshotDigest,
    createdAt,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    transitionId: input.transitionId,
    request: {
      kind: 'structured_yops',
      id: `request:${input.suffix}`,
      createdAt: '2026-08-17T00:00:00.000Z',
    },
    review,
    objects,
    transition: { schema: 't3x.dev/test-transition-view/v1' },
  };
  return {
    reviewSnapshot,
    changeProjection: {
      schema: 't3x.application/change-projection/v1',
      version: 1,
      authoritative: false,
      source: {
        kind: 'review_snapshot',
        snapshotId,
        snapshotDigest,
        snapshotCreatedAt: createdAt,
      },
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      transitionId: input.transitionId,
      title: `Snapshot ${input.suffix}`,
      status: 'reviewing',
      review: {
        digest: REVIEW_DIGEST,
        refName: 'main',
        refHead: null,
        workspaceRevision: 1,
        policyDigest: POLICY_DIGEST,
      },
      objects,
      checks: {},
      actions: {},
    },
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
  await sql.unsafe(`
    INSERT INTO projects (project_id, name, created_at)
    VALUES ('proj_review_snapshots', 'Review snapshot tests', NOW())
  `);
});

afterAll(async () => cleanup());

describe('Transition review snapshots', () => {
  it('stores immutable review snapshots idempotently', async () => {
    const created = await transitionMembership('proj_review_snapshots', 'a');
    const artifacts = snapshot({
      projectId: 'proj_review_snapshots',
      workspaceId: created.membership.workspaceId,
      transitionId: created.membership.transitionId,
      suffix: '8',
    });

    const first = await saveTransitionReviewSnapshot(db, {
      projectId: 'proj_review_snapshots',
      workspaceId: created.membership.workspaceId,
      transitionId: created.membership.transitionId,
      snapshot: artifacts.reviewSnapshot,
      changeProjection: artifacts.changeProjection,
    });
    const second = await saveTransitionReviewSnapshot(db, {
      projectId: 'proj_review_snapshots',
      workspaceId: created.membership.workspaceId,
      transitionId: created.membership.transitionId,
      snapshot: artifacts.reviewSnapshot,
      changeProjection: artifacts.changeProjection,
    });

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    await expect(
      getTransitionReviewSnapshot(db, {
        projectId: 'proj_review_snapshots',
        snapshotId: artifacts.reviewSnapshot.snapshotId,
      })
    ).resolves.toMatchObject({
      snapshotDigest: artifacts.reviewSnapshot.snapshotDigest,
      reviewDigest: REVIEW_DIGEST,
      changeProjection: expect.objectContaining({
        schema: 't3x.application/change-projection/v1',
      }),
    });
  });

  it('returns the latest snapshot for a workspace or transition', async () => {
    const created = await transitionMembership('proj_review_snapshots', 'b');
    const older = snapshot({
      projectId: 'proj_review_snapshots',
      workspaceId: created.membership.workspaceId,
      transitionId: created.membership.transitionId,
      suffix: '6',
      createdAt: '2026-08-17T00:00:00.000Z',
    });
    const newer = snapshot({
      projectId: 'proj_review_snapshots',
      workspaceId: created.membership.workspaceId,
      transitionId: created.membership.transitionId,
      suffix: '7',
      createdAt: '2026-08-17T00:00:01.000Z',
    });
    for (const artifacts of [older, newer]) {
      await saveTransitionReviewSnapshot(db, {
        projectId: 'proj_review_snapshots',
        workspaceId: created.membership.workspaceId,
        transitionId: created.membership.transitionId,
        snapshot: artifacts.reviewSnapshot,
        changeProjection: artifacts.changeProjection,
      });
    }

    await expect(
      getLatestTransitionReviewSnapshot(db, {
        projectId: 'proj_review_snapshots',
        workspaceId: created.membership.workspaceId,
      })
    ).resolves.toMatchObject({ snapshotId: newer.reviewSnapshot.snapshotId });
    await expect(
      getLatestTransitionReviewSnapshot(db, {
        projectId: 'proj_review_snapshots',
        transitionId: created.membership.transitionId,
      })
    ).resolves.toMatchObject({ snapshotId: newer.reviewSnapshot.snapshotId });
  });

  it('rejects conflicting content for an existing snapshot id', async () => {
    const created = await transitionMembership('proj_review_snapshots', 'c');
    const artifacts = snapshot({
      projectId: 'proj_review_snapshots',
      workspaceId: created.membership.workspaceId,
      transitionId: created.membership.transitionId,
      suffix: '5',
    });
    await saveTransitionReviewSnapshot(db, {
      projectId: 'proj_review_snapshots',
      workspaceId: created.membership.workspaceId,
      transitionId: created.membership.transitionId,
      snapshot: artifacts.reviewSnapshot,
      changeProjection: artifacts.changeProjection,
    });

    await expect(
      saveTransitionReviewSnapshot(db, {
        projectId: 'proj_review_snapshots',
        workspaceId: created.membership.workspaceId,
        transitionId: created.membership.transitionId,
        snapshot: { ...artifacts.reviewSnapshot, snapshotDigest: digest('4') },
        changeProjection: {
          ...artifacts.changeProjection,
          source: { ...artifacts.changeProjection.source, snapshotDigest: digest('4') },
        },
      })
    ).rejects.toBeInstanceOf(TransitionReviewSnapshotConflictError);
  });
});
