// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { type TransitionViewV1, YAML_SOURCE_MUTATION_DRIVER_REF } from '@t3x-dev/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceTransitionTab } from '@/components/workspaces/SourceTransitionTab';
import { useCommitTransitionView } from '@/hooks/workspaces/useCommitTransitionView';
import { useWorkspaceSourceTransition } from '@/hooks/workspaces/useWorkspaceSourceTransition';
import { WORKSPACE_SOURCE_ARTIFACT_FORMAT, type WorkspaceCandidate } from '@/types/workspaces';

vi.mock('@/hooks/workspaces/useCommitTransitionView', () => ({
  useCommitTransitionView: vi.fn(),
}));

vi.mock('@/hooks/workspaces/useWorkspaceSourceTransition', () => ({
  useWorkspaceSourceTransition: vi.fn(),
}));

const digest = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}` as const;
const review = vi.fn();
const reviewRevert = vi.fn();
const decide = vi.fn();
const reset = vi.fn();

const candidate = {
  id: 'workspace_esphome',
  projectId: 'proj_1',
  title: 'ESPHome configuration',
  targetBranch: 'main',
  baseCommitHash: digest('0'),
  sourceArtifact: {
    format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
    rootPath: 'device.yaml',
    root: { materialId: 'mat_root', contentHash: 'hash:root' },
    resources: [],
  },
} as unknown as WorkspaceCandidate;

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
        ...YAML_SOURCE_MUTATION_DRIVER_REF,
      },
      operations: [
        {
          op: 'replace_scalar',
          path: ['logger', 'level'],
          expect: 'DEBUG',
          value: 'INFO',
        },
      ],
    },
    claims: {
      proposal: { kind: 'statement', schema: 't3x/statement/v1', digest: digest('e') },
      actor: { kind: 'human', id: 'human:test' },
      intent: { mode: 'unspecified', origin: 'not_provided', evidence: [] },
      rationale: {
        mode: 'authored',
        origin: 'actor_authored',
        value: 'Reduce production log volume.',
        evidence: [],
      },
    },
    checks: {
      objectIntegrity: 'verified',
      observationScope: { completeness: 'complete', sources: ['workspace-source'] },
      replay: {
        observation: 'observed',
        outcomes: ['verified'],
        runs: [],
        unsupportedProfiles: [],
      },
      validation: {
        observation: 'no_statement_observed',
        outcomes: [],
        runs: [],
        unsupportedProfiles: [],
      },
      runner: {
        observation: 'observed',
        outcomes: ['failed'],
        runs: [],
        unsupportedProfiles: [],
      },
      humanConfirmation: { observation: 'no_statement_observed', runs: [] },
    },
    decision: { observation: 'not_supplied' },
    history: { observation: 'not_committed' },
    capabilities: {
      accept: {
        disposition: 'denied',
        reasons: [{ code: 'RUNNER_FAILED', message: 'The environment check failed.' }],
      },
      override: {
        disposition: 'allowed',
        reasons: [{ code: 'RUNNER_FAILED', message: 'The environment check failed.' }],
      },
      reject: { disposition: 'allowed', reasons: [] },
      commit: { disposition: 'not_applicable', reasons: [] },
      revert: { disposition: 'not_applicable', reasons: [] },
    },
    audit: {
      effect: { kind: 'effect', schema: 't3x/effect/v1', digest: digest('a') },
      proposal: { kind: 'statement', schema: 't3x/statement/v1', digest: digest('e') },
      statements: [],
    },
  };
}

function mockSourceTransition(
  view: TransitionViewV1 | null = null,
  task: 'change' | 'revert' | null = view ? 'change' : null
) {
  vi.mocked(useWorkspaceSourceTransition).mockReturnValue({
    decide,
    reset,
    review,
    reviewRevert,
    state: {
      error: null,
      errorCode: null,
      phase: view ? 'reviewed' : 'idle',
      runner: view ? { mode: 'statement', statementDigest: digest('1'), outcome: 'failed' } : null,
      task,
      view,
    },
  });
}

describe('SourceTransitionTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    review.mockResolvedValue(true);
    reviewRevert.mockResolvedValue(true);
    decide.mockResolvedValue(null);
    vi.mocked(useCommitTransitionView).mockReturnValue({
      error: null,
      loading: false,
      view: null,
    });
    mockSourceTransition();
  });

  it('submits one source-preserving scalar task without requiring chat or intent', async () => {
    const onViewChange = vi.fn();
    render(
      <SourceTransitionTab active candidate={candidate} onViewChange={onViewChange} view="ops" />
    );

    fireEvent.change(screen.getByLabelText('YAML path'), {
      target: { value: 'logger/level' },
    });
    fireEvent.change(screen.getByLabelText(/Why this change/), {
      target: { value: 'Reduce production log volume.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review and run checks' }));

    await waitFor(() =>
      expect(review).toHaveBeenCalledWith(
        {
          mode: 'edit',
          operations: [
            {
              op: 'replace_scalar',
              path: ['logger', 'level'],
              expect: 'DEBUG',
              value: 'INFO',
            },
          ],
        },
        'Reduce production log volume.'
      )
    );
    expect(onViewChange).toHaveBeenCalledWith('validation');
    expect(screen.queryByLabelText(/intent/i)).not.toBeInTheDocument();
  });

  it('shows Runner separately and carries a reviewed change to Preview', () => {
    mockSourceTransition(transitionView());
    const onViewChange = vi.fn();
    render(
      <SourceTransitionTab
        active
        candidate={candidate}
        onViewChange={onViewChange}
        view="validation"
      />
    );

    expect(screen.getByLabelText('Environment: attention required')).toHaveTextContent('failed');
    expect(screen.getByLabelText('Validation: not observed')).toHaveTextContent(
      'No check observed'
    );
    fireEvent.click(screen.getByRole('button', { name: /Review before and after/i }));
    expect(onViewChange).toHaveBeenCalledWith('preview');
  });

  it('requires an authored reason before invoking the projected override action', () => {
    mockSourceTransition(transitionView());
    render(<SourceTransitionTab active candidate={candidate} view="commit" />);

    const continueButton = screen.getByRole('button', { name: 'Continue anyway and save' });
    expect(continueButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Why continue despite the failed check/), {
      target: { value: 'The known environment risk is acceptable for this device.' },
    });
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);
    expect(decide).toHaveBeenCalledWith(
      'overridden',
      'The known environment risk is acceptable for this device.'
    );
  });

  it('offers revert only for the selected committed source edit and sends only its commit id', async () => {
    const commitId = digest('9');
    const committed = transitionView();
    committed.history = {
      observation: 'committed',
      commit: { id: commitId },
    } as Extract<typeof committed.history, { observation: 'committed' }>;
    vi.mocked(useCommitTransitionView).mockReturnValue({
      error: null,
      loading: false,
      view: committed,
    });
    const onViewChange = vi.fn();
    render(
      <SourceTransitionTab
        active
        candidate={{ ...candidate, lastCommitHash: commitId }}
        onViewChange={onViewChange}
        view="ops"
      />
    );

    fireEvent.change(screen.getByLabelText(/Why revert/), {
      target: { value: 'Restore the previous configuration.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review revert' }));

    await waitFor(() =>
      expect(reviewRevert).toHaveBeenCalledWith(commitId, 'Restore the previous configuration.')
    );
    expect(review).not.toHaveBeenCalled();
    expect(onViewChange).toHaveBeenCalledWith('validation');
  });

  it('does not offer revert for an import or an unknown mutation driver', () => {
    const commitId = digest('9');
    const imported = transitionView();
    imported.history = {
      observation: 'committed',
      commit: { id: commitId },
    } as Extract<typeof imported.history, { observation: 'committed' }>;
    imported.change = {
      ...imported.change,
      driver: {
        protocol: 't3x.dev/state-import',
        protocolVersion: '1',
        specDigest: digest('f'),
      },
      operations: [],
    };
    vi.mocked(useCommitTransitionView).mockReturnValue({
      error: null,
      loading: false,
      view: imported,
    });

    render(
      <SourceTransitionTab
        active
        candidate={{ ...candidate, lastCommitHash: commitId }}
        view="ops"
      />
    );
    expect(screen.queryByRole('button', { name: 'Review revert' })).not.toBeInTheDocument();
  });

  it('does not offer revert when the source driver specification is not the pinned version', () => {
    const commitId = digest('9');
    const unknownSpecification = transitionView();
    unknownSpecification.history = {
      observation: 'committed',
      commit: { id: commitId },
    } as Extract<typeof unknownSpecification.history, { observation: 'committed' }>;
    unknownSpecification.change.driver = {
      ...YAML_SOURCE_MUTATION_DRIVER_REF,
      specDigest: digest('f'),
    };
    vi.mocked(useCommitTransitionView).mockReturnValue({
      error: null,
      loading: false,
      view: unknownSpecification,
    });

    render(
      <SourceTransitionTab
        active
        candidate={{ ...candidate, lastCommitHash: commitId }}
        view="ops"
      />
    );
    expect(screen.queryByRole('button', { name: 'Review revert' })).not.toBeInTheDocument();
  });

  it('previews the server-derived reverse operation instead of the local edit form', () => {
    const reverted = transitionView();
    reverted.change.operations = [
      {
        op: 'replace_scalar',
        path: ['logger', 'level'],
        expect: 'INFO',
        value: 'DEBUG',
      },
    ];
    mockSourceTransition(reverted, 'revert');
    render(<SourceTransitionTab active candidate={candidate} view="preview" />);

    expect(screen.getByText('Source-preserving revert preview')).toBeInTheDocument();
    expect(screen.getByText('INFO')).toBeInTheDocument();
    expect(screen.getByText('DEBUG')).toBeInTheDocument();
  });
});
