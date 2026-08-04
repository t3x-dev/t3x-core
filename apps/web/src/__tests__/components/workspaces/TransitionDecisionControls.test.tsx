// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type { TransitionViewV1 } from '@t3x-dev/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransitionDecisionControls } from '@/components/workspaces/TransitionDecisionControls';

function pendingView({
  accept = 'allowed',
  override = 'denied',
  reject = 'allowed',
}: {
  accept?: 'allowed' | 'denied';
  override?: 'allowed' | 'denied';
  reject?: 'allowed' | 'denied';
} = {}): TransitionViewV1 {
  return {
    mode: 'transition',
    decision: { observation: 'not_supplied' },
    checks: {
      validation: { observation: 'observed', outcomes: ['failed'] },
    },
    capabilities: {
      accept: {
        disposition: accept,
        reasons:
          accept === 'allowed' ? [] : [{ code: 'VALIDATION_FAILED', message: 'Validation failed' }],
      },
      override: {
        disposition: override,
        reasons:
          override === 'allowed'
            ? []
            : [{ code: 'OVERRIDE_NOT_REQUIRED', message: 'No override is required' }],
      },
      reject: {
        disposition: reject,
        reasons:
          reject === 'allowed'
            ? []
            : [{ code: 'POLICY_CONTEXT_REQUIRED', message: 'Policy unavailable' }],
      },
    },
  } as TransitionViewV1;
}

describe('TransitionDecisionControls', () => {
  it('uses projected capabilities instead of deriving permission from failed checks', () => {
    const onDecide = vi.fn();
    render(
      <TransitionDecisionControls
        busy={false}
        onDecide={onDecide}
        onOverrideReasonChange={vi.fn()}
        overrideReason=""
        view={pendingView()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve and save' }));
    expect(onDecide).toHaveBeenCalledWith('accepted');
    expect(
      screen.queryByRole('button', { name: 'Continue anyway and save' })
    ).not.toBeInTheDocument();
  });

  it('requires an override reason before exposing an actionable override', () => {
    const onDecide = vi.fn();
    const onOverrideReasonChange = vi.fn();
    const { rerender } = render(
      <TransitionDecisionControls
        busy={false}
        onDecide={onDecide}
        onOverrideReasonChange={onOverrideReasonChange}
        overrideReason=""
        view={pendingView({ accept: 'denied', override: 'allowed' })}
      />
    );

    const override = screen.getByRole('button', { name: 'Continue anyway and save' });
    expect(override).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Why continue despite the failed check?'), {
      target: { value: 'Known gap is acceptable.' },
    });
    expect(onOverrideReasonChange).toHaveBeenCalledWith('Known gap is acceptable.');

    rerender(
      <TransitionDecisionControls
        busy={false}
        onDecide={onDecide}
        onOverrideReasonChange={onOverrideReasonChange}
        overrideReason="Known gap is acceptable."
        view={pendingView({ accept: 'denied', override: 'allowed' })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue anyway and save' }));
    expect(onDecide).toHaveBeenCalledWith('overridden', 'Known gap is acceptable.');
  });

  it('shows projected denial reasons when no Decision action is allowed', () => {
    render(
      <TransitionDecisionControls
        busy={false}
        onDecide={vi.fn()}
        onOverrideReasonChange={vi.fn()}
        overrideReason=""
        view={pendingView({ accept: 'denied', override: 'denied', reject: 'denied' })}
      />
    );

    expect(screen.getByText('Validation failed')).toBeInTheDocument();
    expect(screen.getByText('No override is required')).toBeInTheDocument();
    expect(screen.getByText('Policy unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders rejection as audited without claiming the branch changed', () => {
    const view = pendingView() as Extract<TransitionViewV1, { mode: 'transition' }>;
    view.decision = { observation: 'supplied', outcome: 'rejected' } as typeof view.decision;

    render(
      <TransitionDecisionControls
        busy={false}
        onDecide={vi.fn()}
        onOverrideReasonChange={vi.fn()}
        overrideReason=""
        view={view}
      />
    );

    expect(screen.getByRole('region', { name: 'Rejected decision' })).toHaveTextContent(
      'The branch was not changed.'
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
