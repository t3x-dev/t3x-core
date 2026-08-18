// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type { ChangeProjectionV1, ReviewSnapshotV1 } from '@t3x-dev/api-client';
import type { TransitionViewV1 } from '@t3x-dev/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransitionReviewPanel } from '@/components/workspaces/TransitionReviewPanel';

const digest = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}` as const;

function transitionView(): Extract<TransitionViewV1, { mode: 'transition' }> {
  return {
    schema: 't3x.dev/transition-view/v1',
    version: 1,
    mode: 'transition',
    change: {
      effect: { kind: 'effect', schema: 't3x/effect/v1', digest: digest('a') },
      base: { kind: 'state', schema: 't3x/state/v1', digest: digest('b') },
      result: { kind: 'state', schema: 't3x/state/v1', digest: digest('c') },
      driver: {
        protocol: 't3x.dev/yops',
        protocolVersion: '1',
        specDigest: digest('d'),
      },
      operations: [{ op: 'set', path: 'logger/level', value: 'INFO' }],
    },
    claims: {
      proposal: { kind: 'statement', schema: 't3x/statement/v1', digest: digest('e') },
      actor: { kind: 'agent', id: 'agent:workspace' },
      intent: {
        mode: 'inferred',
        origin: 'inferred',
        value: 'Reduce device log volume',
        evidence: [],
      },
      rationale: {
        mode: 'authored',
        origin: 'actor_authored',
        value: 'Keep production logs concise.',
        evidence: [],
      },
    },
    checks: {
      objectIntegrity: 'verified',
      observationScope: { completeness: 'complete', sources: ['project-store'] },
      replay: {
        observation: 'observed',
        outcomes: ['verified'],
        runs: [],
        unsupportedProfiles: [],
      },
      validation: {
        observation: 'observed',
        outcomes: ['passed'],
        runs: [],
        unsupportedProfiles: [],
      },
      runner: {
        observation: 'observed',
        outcomes: ['passed'],
        runs: [],
        unsupportedProfiles: [],
      },
      humanConfirmation: { observation: 'no_statement_observed', runs: [] },
    },
    decision: {
      observation: 'supplied',
      statement: { kind: 'statement', schema: 't3x/statement/v1', digest: digest('f') },
      actor: { kind: 'human', id: 'human:maintainer' },
      outcome: 'accepted',
      policy: {
        mode: 'evaluated',
        resource: {
          uri: 't3x://project/policies/default',
          mediaType: 'application/vnd.t3x.acceptance-policy+json',
          digest: digest('1'),
        },
      },
      considered: [],
      rationale: { mode: 'unspecified', origin: 'not_provided', evidence: [] },
      decidedAt: '2026-07-30T00:00:00.000Z',
    },
    history: {
      observation: 'committed',
      commit: {
        format: 'transition_v2',
        id: digest('2'),
        schema: 't3x/commit/v2',
        parents: [],
        recordedAt: '2026-07-30T00:00:00.000Z',
        result: {
          mode: 'state_descriptor',
          descriptor: { kind: 'state', schema: 't3x/state/v1', digest: digest('c') },
        },
        assurance: {
          mode: 'decision_bound',
          decision: { kind: 'statement', schema: 't3x/statement/v1', digest: digest('f') },
        },
      },
    },
    capabilities: {
      accept: { disposition: 'not_applicable', reasons: [] },
      override: { disposition: 'not_applicable', reasons: [] },
      reject: { disposition: 'not_applicable', reasons: [] },
      commit: { disposition: 'not_applicable', reasons: [] },
      revert: {
        disposition: 'not_evaluated',
        reasons: [
          {
            code: 'REPOSITORY_AUTHORIZATION_REQUIRED',
            message: 'Revert requires a new reviewed change.',
          },
        ],
      },
    },
    audit: {
      effect: { kind: 'effect', schema: 't3x/effect/v1', digest: digest('a') },
      proposal: { kind: 'statement', schema: 't3x/statement/v1', digest: digest('e') },
      statements: [
        {
          statement: { kind: 'statement', schema: 't3x/statement/v1', digest: digest('3') },
          subjects: [{ kind: 'effect', schema: 't3x/effect/v1', digest: digest('a') }],
          predicateType: 't3x.dev/replay-verification/v1',
          claimedActor: { kind: 'service', id: 'service:replay' },
          issuerActor: { kind: 'service', id: 'service:replay' },
        },
      ],
      decision: { kind: 'statement', schema: 't3x/statement/v1', digest: digest('f') },
      commit: { kind: 'commit', schema: 't3x/commit/v2', digest: digest('2') },
    },
  };
}

function reviewArtifacts(
  view: Extract<TransitionViewV1, { mode: 'transition' }>,
  status: ChangeProjectionV1['status']
) {
  const objects: ReviewSnapshotV1['objects'] = {
    base: view.change.base,
    result: view.change.result,
    effect: view.audit.effect,
    proposal: view.audit.proposal,
    statements: view.audit.statements.map((statement) => statement.statement),
    ...(view.audit.decision ? { decision: view.audit.decision } : {}),
    ...(view.audit.commit ? { commit: view.audit.commit } : {}),
  };
  const reviewSnapshot: ReviewSnapshotV1 = {
    schema: 't3x.application/review-snapshot/v1',
    version: 1,
    snapshotId: 'rvs_review_snapshot_panel',
    snapshotDigest: digest('9'),
    createdAt: '2026-07-30T00:00:00.000Z',
    projectId: 'proj_1',
    workspaceId: 'workspace_prd_handoff',
    transitionId: 'trn_review_panel',
    request: {
      kind: 'structured_yops',
      id: 'request:workspace_prd_handoff',
      createdAt: '2026-07-30T00:00:00.000Z',
    },
    review: {
      digest: digest('8'),
      precondition: {
        workspaceRevision: 7,
        refName: 'feature/prd-audience',
        refHead: null,
        effectDigest: view.audit.effect.digest,
        proposalDigest: view.audit.proposal.digest,
        statementDigests: objects.statements.map((statement) => statement.digest),
        policyDigest: digest('1'),
      },
    },
    objects,
    transition: view,
  };
  const changeProjection: ChangeProjectionV1 = {
    schema: 't3x.application/change-projection/v1',
    version: 1,
    authoritative: false,
    source: {
      kind: 'review_snapshot',
      snapshotId: reviewSnapshot.snapshotId,
      snapshotDigest: reviewSnapshot.snapshotDigest,
      snapshotCreatedAt: reviewSnapshot.createdAt,
    },
    projectId: reviewSnapshot.projectId,
    workspaceId: reviewSnapshot.workspaceId,
    transitionId: reviewSnapshot.transitionId,
    title: 'Reduce device log volume',
    status,
    review: {
      digest: reviewSnapshot.review.digest,
      refName: reviewSnapshot.review.precondition.refName,
      refHead: reviewSnapshot.review.precondition.refHead,
      workspaceRevision: reviewSnapshot.review.precondition.workspaceRevision,
      policyDigest: reviewSnapshot.review.precondition.policyDigest,
    },
    objects,
    checks: view.checks,
    actions: view.capabilities,
  };
  return { changeProjection, reviewSnapshot };
}

describe('TransitionReviewPanel', () => {
  it('renders a verified Transition in task language from the shared view', () => {
    render(<TransitionReviewPanel error={null} loading={false} view={transitionView()} />);

    expect(screen.getByRole('region', { name: 'Saved change review' })).toHaveTextContent(
      'Saved change'
    );
    expect(screen.getByText('Reduce device log volume')).toBeInTheDocument();
    expect(screen.getByText('Keep production logs concise.')).toBeInTheDocument();
    expect(screen.getByText('SET logger/level')).toBeInTheDocument();
    expect(screen.getByText('Approved and saved')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Saved change checks' })).toHaveTextContent(
      'Change integrity'
    );
    expect(screen.getByLabelText('Environment: passed')).toHaveTextContent('passed');
    expect(
      screen.getByText('Next action: Revert requires a new reviewed change.')
    ).toBeInTheDocument();
  });

  it('does not present an observed failed validation as successful', () => {
    const view = transitionView();
    view.checks.validation = {
      observation: 'observed',
      outcomes: ['failed'],
      runs: [],
      unsupportedProfiles: [],
    };

    render(<TransitionReviewPanel error={null} loading={false} view={view} />);

    expect(screen.getByLabelText('Validation: attention required')).toHaveTextContent('failed');
    expect(screen.queryByLabelText('Validation: passed')).not.toBeInTheDocument();
  });

  it('renders exact-source before and after values without interpreting policy', () => {
    const view = transitionView();
    view.change.operations = [
      {
        op: 'replace_scalar',
        path: ['logger', 'level'],
        expect: 'DEBUG',
        value: 'INFO',
      },
    ];
    view.checks.runner = {
      observation: 'no_statement_observed',
      outcomes: [],
      runs: [],
      unsupportedProfiles: [],
    };

    render(<TransitionReviewPanel error={null} loading={false} view={view} />);

    expect(screen.getByText('REPLACE_SCALAR logger/level')).toBeInTheDocument();
    expect(screen.getByText('"DEBUG" → "INFO"')).toBeInTheDocument();
    expect(screen.getByLabelText('Environment: not observed')).toHaveTextContent(
      'No check observed'
    );
  });

  it('renders an uncommitted graph as a pending review rather than saved history', () => {
    const view = transitionView();
    view.decision = { observation: 'not_supplied' };
    view.history = { observation: 'not_committed' };
    view.audit.decision = undefined;
    view.audit.commit = undefined;

    render(<TransitionReviewPanel error={null} loading={false} view={view} />);

    expect(screen.getByRole('region', { name: 'Change review' })).toHaveTextContent(
      'Review change'
    );
    expect(screen.getByText('Awaiting decision')).toBeInTheDocument();
    expect(screen.queryByText(/saved with verified history/i)).not.toBeInTheDocument();
  });

  it('renders ReviewSnapshot and derived Changes projection metadata when present', () => {
    const view = transitionView();
    const { changeProjection, reviewSnapshot } = reviewArtifacts(view, 'committed');

    render(
      <TransitionReviewPanel
        changeProjection={changeProjection}
        error={null}
        loading={false}
        reviewSnapshot={reviewSnapshot}
        view={view}
      />
    );

    expect(screen.getByRole('region', { name: 'Review snapshot' })).toHaveTextContent(
      'Immutable ReviewSnapshot'
    );
    expect(screen.getByRole('region', { name: 'Review snapshot' })).toHaveTextContent(
      'Changes projection: Reduce device log volume'
    );
    expect(screen.getByText('Committed')).toBeInTheDocument();
    expect(screen.getByText('feature/prd-audience')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});
