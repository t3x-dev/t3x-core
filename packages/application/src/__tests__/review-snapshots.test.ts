import { createHash } from 'node:crypto';
import { projectTransitionView } from '@t3x-dev/core';
import type { CommitDescriptor, StatementDescriptor } from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import {
  assertReviewSnapshotCurrent,
  buildReviewSnapshot,
  CHANGE_PROJECTION_SCHEMA,
  projectChangeFromReviewSnapshot,
  REVIEW_SNAPSHOT_SCHEMA,
  ReviewSnapshotPolicyRequiredError,
  ReviewSnapshotStaleError,
  type ReviewSnapshotV1,
} from '../change';
import type { TransitionInspectionView } from '../transition';
import { graph } from './support/transitionGraph';

const POLICY_DIGEST = `sha256:${'e'.repeat(64)}` as const;

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function inspection(): TransitionInspectionView {
  const subject = graph();
  const transition = projectTransitionView({
    mode: 'transition',
    effect: subject.effect,
    proposal: subject.proposal,
    observations: subject.observations.map((observation) => ({
      statement: observation.statement,
      issuerContext: observation.issuerContext,
    })),
    observationScope: {
      completeness: 'complete',
      sources: ['repository:transition-statement-memberships'],
    },
    objectIntegrity: 'verified',
  });

  return {
    transitionId: subject.membership.transitionId,
    projectId: subject.membership.projectId,
    workspaceId: subject.membership.workspaceId,
    requestKind: subject.membership.requestKind,
    requestId: subject.membership.requestId,
    createdAt: subject.membership.createdAt,
    precondition: {
      workspaceRevision: subject.membership.workspaceRevision,
      refName: subject.membership.refName,
      refHead: subject.membership.refHead,
      effectDigest: subject.membership.effectDigest,
      proposalDigest: subject.membership.proposalDigest,
      statementDigests: subject.observations.map(
        (observation) => observation.membership.statementDigest
      ),
      policyDigest: POLICY_DIGEST,
    },
    transition,
    statements: subject.observations.map((observation) => ({
      digest: observation.membership.statementDigest,
      source: observation.membership.source,
      issuer: observation.membership.issuer,
      requestId: observation.membership.requestId,
      createdAt: observation.membership.createdAt,
    })),
  };
}

function snapshot(input?: { view?: TransitionInspectionView }): ReviewSnapshotV1 {
  return buildReviewSnapshot({
    inspection: input?.view ?? inspection(),
    createdAt: '2026-08-17T00:00:00.000Z',
    digestCanonicalRequest: digest,
  });
}

function withDecision(
  view: TransitionInspectionView,
  outcome: 'accepted' | 'overridden' | 'rejected'
): TransitionInspectionView {
  const decision: StatementDescriptor = {
    kind: 'statement',
    schema: 't3x/statement/v1',
    digest: `sha256:${outcome === 'accepted' ? 'a' : outcome === 'overridden' ? 'b' : 'c'}`.padEnd(
      71,
      outcome === 'accepted' ? 'a' : outcome === 'overridden' ? 'b' : 'c'
    ),
  } as StatementDescriptor;
  return {
    ...view,
    transition: {
      ...view.transition,
      decision: {
        observation: 'supplied',
        statement: decision,
        actor: { kind: 'human', id: 'human:reviewer' },
        outcome,
        policy: { mode: 'not_evaluated' },
        considered: [],
        rationale: { mode: 'unspecified', origin: 'not_provided', evidence: [] },
        decidedAt: '2026-08-17T00:00:00.000Z',
      },
      audit: { ...view.transition.audit, decision },
    },
  };
}

function withCommit(view: TransitionInspectionView): TransitionInspectionView {
  const decisionView = withDecision(view, 'accepted');
  const decision = decisionView.transition.audit.decision as StatementDescriptor;
  const commit: CommitDescriptor = {
    kind: 'commit',
    schema: 't3x/commit/v2',
    digest: `sha256:${'d'.repeat(64)}`,
  };
  return {
    ...decisionView,
    transition: {
      ...decisionView.transition,
      history: {
        observation: 'committed',
        commit: {
          format: 'transition_v2',
          id: commit.digest,
          schema: 't3x/commit/v2',
          parents: [],
          recordedAt: '2026-08-17T00:00:00.000Z',
          result: {
            mode: 'state_descriptor',
            descriptor: decisionView.transition.change.result,
          },
          assurance: {
            mode: 'decision_bound',
            decision,
          },
        },
      },
      audit: { ...decisionView.transition.audit, commit },
    },
  };
}

describe('ReviewSnapshot foundation', () => {
  it('builds an immutable review snapshot from a Transition inspection view', () => {
    const view = inspection();
    const built = snapshot({ view });

    expect(built).toMatchObject({
      schema: REVIEW_SNAPSHOT_SCHEMA,
      version: 1,
      projectId: 'project_1',
      workspaceId: 'workspace_1',
      transitionId: 'trn_00000000000000000000000000000001',
      request: { kind: 'structured_yops', id: 'request_1' },
      review: {
        precondition: {
          workspaceRevision: 7,
          refName: 'main',
          refHead: null,
          policyDigest: POLICY_DIGEST,
        },
      },
    });
    expect(built.snapshotId).toMatch(/^rvs_/);
    expect(built.snapshotDigest).toMatch(/^sha256:/);
    expect(built.objects.effect).toEqual(view.transition.audit.effect);
    expect(built.objects.proposal).toEqual(view.transition.audit.proposal);
    expect(built.objects.statements).toEqual(
      view.transition.audit.statements.map((statement) => statement.statement)
    );
  });

  it('requires server-selected policy facts before a review snapshot is created', () => {
    const view = inspection();
    expect(() =>
      snapshot({
        view: { ...view, precondition: { ...view.precondition, policyDigest: null } },
      })
    ).toThrow(ReviewSnapshotPolicyRequiredError);
  });

  it('keeps review freshness tied to immutable graph and ref facts', () => {
    const view = inspection();
    const built = snapshot({ view });

    expect(() => assertReviewSnapshotCurrent({ snapshot: built, inspection: view })).not.toThrow();
    expect(() =>
      assertReviewSnapshotCurrent({
        snapshot: built,
        inspection: {
          ...view,
          precondition: {
            ...view.precondition,
            statementDigests: [...view.precondition.statementDigests, `sha256:${'f'.repeat(64)}`],
          },
        },
      })
    ).toThrow(ReviewSnapshotStaleError);
    expect(() =>
      assertReviewSnapshotCurrent({
        snapshot: built,
        inspection: {
          ...view,
          precondition: { ...view.precondition, refHead: `sha256:${'1'.repeat(64)}` },
        },
      })
    ).toThrow(ReviewSnapshotStaleError);
  });

  it('records superseding snapshots without rewriting the previous digest', () => {
    const first = snapshot();
    const staleView = inspection();
    const second = buildReviewSnapshot({
      inspection: {
        ...staleView,
        precondition: { ...staleView.precondition, workspaceRevision: 8 },
      },
      createdAt: '2026-08-17T00:01:00.000Z',
      supersedes: {
        snapshotId: first.snapshotId,
        snapshotDigest: first.snapshotDigest,
      },
      digestCanonicalRequest: digest,
    });

    expect(second.supersedes).toEqual({
      snapshotId: first.snapshotId,
      snapshotDigest: first.snapshotDigest,
    });
    expect(second.snapshotDigest).not.toBe(first.snapshotDigest);
  });
});

describe('ChangeProjection foundation', () => {
  it('derives a non-authoritative Changes shell from a review snapshot', () => {
    const built = snapshot();
    const projection = projectChangeFromReviewSnapshot(built);

    expect(projection).toMatchObject({
      schema: CHANGE_PROJECTION_SCHEMA,
      version: 1,
      authoritative: false,
      source: { kind: 'review_snapshot' },
      status: 'reviewing',
      title: 'Rename the record',
      review: {
        refName: 'main',
        refHead: null,
        workspaceRevision: 7,
        policyDigest: POLICY_DIGEST,
      },
    });
    expect(projection.objects.effect).toEqual(built.objects.effect);
    expect(projection.actions.commit.disposition).toBe('not_applicable');
  });

  it('projects decision and commit status without creating mutable permission flags', () => {
    expect(
      projectChangeFromReviewSnapshot(snapshot({ view: withDecision(inspection(), 'accepted') }))
        .status
    ).toBe('accepted');
    expect(
      projectChangeFromReviewSnapshot(snapshot({ view: withDecision(inspection(), 'overridden') }))
        .status
    ).toBe('overridden');
    expect(
      projectChangeFromReviewSnapshot(snapshot({ view: withDecision(inspection(), 'rejected') }))
        .status
    ).toBe('rejected');
    const committed = projectChangeFromReviewSnapshot(snapshot({ view: withCommit(inspection()) }));
    expect(committed.status).toBe('committed');
    expect(committed.objects.commit?.digest).toBe(`sha256:${'d'.repeat(64)}`);
  });
});
