// @vitest-environment jsdom

import '@testing-library/jest-dom';
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
});
