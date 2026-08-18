// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProposalGenerationReviewView } from '@/components/workspaces/ProposalGenerationReviewView';
import type { WorkspaceProposalGenerationView } from '@/types/workspaces';

function generationView(
  verification: 'pending' | 'passed' | 'failed' = 'passed'
): WorkspaceProposalGenerationView {
  return {
    transition_id: 'transition_1',
    project_id: 'project_1',
    workspace_id: 'workspace_1',
    request_id: 'request_1',
    created_at: '2026-08-13T00:00:00.000Z',
    precondition: {
      workspace_revision: 2,
      ref_name: 'dev',
      ref_head: null,
      effect_digest: 'sha256:effect',
      proposal_digest: 'sha256:proposal',
      statement_digests: [],
      policy_digest: 'sha256:policy',
    },
    transition: {
      checks: {
        replay: { observation: 'observed', outcomes: ['verified'] },
        validation: { observation: 'observed', outcomes: ['passed'] },
      },
    } as WorkspaceProposalGenerationView['transition'],
    statements: [],
    generation: {
      posture: 'guided',
      profileResource: {
        uri: 't3x://proposal-postures/guided',
        mediaType: 'application/json',
        digest: 'sha256:profile',
      },
      requestedBy: { kind: 'human', id: 'human:reviewer' },
      generator: { kind: 'service', id: 'service:generator' },
      provider: 'configured-provider',
      model: 'configured-model',
      run: { id: 'run_1', recordedAt: '2026-08-13T00:00:00.000Z' },
      counts: { sourceBacked: 0, inferred: 1, recommended: 0, challenges: 0 },
      warnings: [],
      verification: {
        status: verification,
        findings:
          verification === 'failed'
            ? [
                {
                  severity: 'error',
                  code: 'POSTURE_VIOLATION',
                  message: 'The inference has no reviewable basis.',
                },
              ]
            : [],
      },
      groups: [
        {
          id: 'audience',
          origin: 'inferred',
          operationIndexes: [0],
          operations: [{ op: 'set', path: 'prd/audience', value: 'operators' }],
          paths: ['prd/audience'],
          values: [
            {
              path: 'prd/audience',
              before: { availability: 'unavailable' },
              after: { availability: 'available', value: 'operators' },
              changed: true,
            },
          ],
          evidence: [],
          basis: [{ rule: 'workspace context' }],
          assumptions: ['The audience follows the current launch scope.'],
          reason: 'The current launch scope supports this inference.',
          challenges: [],
        },
      ],
    },
  };
}

describe('ProposalGenerationReviewView', () => {
  it('shows one unambiguous mode selector and the origin-aware review sequence', () => {
    const onPostureChange = vi.fn();
    render(
      <ProposalGenerationReviewView
        onPostureChange={onPostureChange}
        onRegenerate={vi.fn()}
        onVerify={vi.fn()}
        selectedPosture="guided"
        view={generationView()}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Proposal mode' })).toHaveValue('guided');
    expect(screen.getByText('2 · Proposal outcomes')).toBeInTheDocument();
    expect(screen.getByText('3 · Verify')).toBeInTheDocument();
    expect(screen.getByText('4 · Human decision')).toBeInTheDocument();
    expect(screen.getAllByText('Inferred').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('combobox', { name: 'Proposal mode' }), {
      target: { value: 'recommend' },
    });
    expect(onPostureChange).toHaveBeenCalledWith('recommend');
  });

  it('requires regeneration when the selected mode differs from the generated posture', () => {
    render(
      <ProposalGenerationReviewView
        onPostureChange={vi.fn()}
        onRegenerate={vi.fn()}
        onVerify={vi.fn()}
        selectedPosture="source_only"
        view={generationView()}
      />
    );

    expect(screen.getByText('Regenerate to apply')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept and commit' })).toBeDisabled();
  });

  it('allows an accepted Decision to retry its pending Commit', () => {
    const onAction = vi.fn();
    render(
      <ProposalGenerationReviewView
        actionState="accepted"
        onAction={onAction}
        onPostureChange={vi.fn()}
        onRegenerate={vi.fn()}
        onVerify={vi.fn()}
        selectedPosture="guided"
        view={generationView()}
      />
    );

    expect(screen.getByText('Accepted · commit pending')).toBeInTheDocument();
    const commitButton = screen.getByRole('button', { name: 'Commit accepted proposal' });
    expect(commitButton).toBeEnabled();
    fireEvent.click(commitButton);
    expect(onAction).toHaveBeenCalledWith('accept');
  });

  it('shows a terminal rejected Decision without asking for another decision', () => {
    render(
      <ProposalGenerationReviewView
        actionState="rejected"
        onAction={vi.fn()}
        onPostureChange={vi.fn()}
        onRegenerate={vi.fn()}
        onVerify={vi.fn()}
        selectedPosture="guided"
        view={generationView()}
      />
    );

    expect(screen.getAllByText('Rejected')).toHaveLength(2);
    expect(screen.queryByText('Human decision required')).not.toBeInTheDocument();
  });

  it('keeps accept and commit disabled when posture verification fails', () => {
    render(
      <ProposalGenerationReviewView
        onAction={vi.fn()}
        onPostureChange={vi.fn()}
        onRegenerate={vi.fn()}
        onVerify={vi.fn()}
        selectedPosture="guided"
        view={generationView('failed')}
      />
    );

    expect(screen.getByRole('button', { name: 'Accept and commit' })).toBeDisabled();
    expect(screen.getByText('The inference has no reviewable basis.')).toBeInTheDocument();
  });

  it('keeps accept and commit disabled when schema validation fails', () => {
    const view = generationView();
    view.transition.checks.validation = {
      observation: 'observed',
      outcomes: ['rejected'],
    };

    render(
      <ProposalGenerationReviewView
        onAction={vi.fn()}
        onPostureChange={vi.fn()}
        onRegenerate={vi.fn()}
        onVerify={vi.fn()}
        selectedPosture="guided"
        view={view}
      />
    );

    expect(screen.getByText('Schema validation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept and commit' })).toBeDisabled();
  });

  it('treats an absent optional validation statement as not required', () => {
    const view = generationView();
    view.transition.checks.validation = {
      observation: 'no_statement_observed',
      outcomes: [],
    };

    render(
      <ProposalGenerationReviewView
        onAction={vi.fn()}
        onPostureChange={vi.fn()}
        onRegenerate={vi.fn()}
        onVerify={vi.fn()}
        selectedPosture="guided"
        view={view}
      />
    );

    expect(screen.getByText('Not required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept and commit' })).toBeEnabled();
  });
});
