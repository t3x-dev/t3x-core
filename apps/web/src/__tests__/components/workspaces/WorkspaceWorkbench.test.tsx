// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import type { WorkspaceCandidate, WorkspaceYOpsDraftOperation } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({
  extractCandidate: vi.fn(),
  refreshWorkspaces: vi.fn(),
  saveDraft: vi.fn(),
  sendToYOps: vi.fn(),
  startNextIteration: vi.fn(),
  onSelectedWorkspaceChange: vi.fn(),
  onViewCommitInState: vi.fn(),
  sourceThreadGenerationOptions: vi.fn(),
  chatMessages: [] as Array<{
    content: string;
    id: string;
    rings?: Record<string, unknown>;
    role: 'assistant' | 'user';
  }>,
}));

vi.mock('@/hooks/workspaces/useWorkspaceFlow', () => ({
  useWorkspaceFlow: () => ({
    extractCandidate: mocks.extractCandidate,
    refreshWorkspaces: mocks.refreshWorkspaces,
    saveDraft: mocks.saveDraft,
    sendToYOps: mocks.sendToYOps,
    startNextIteration: mocks.startNextIteration,
  }),
}));

vi.mock('@/hooks/workspaces/useWorkspaceProposalGeneration', () => ({
  useWorkspaceProposalGeneration: () => ({
    generate: vi.fn(),
    verify: vi.fn(),
  }),
}));

vi.mock('@/hooks/shared/useChatModelSelection', () => ({
  useChatModelSelection: () => ({
    availabilityError: null,
    handleModelChange: vi.fn(),
    isSelectionReady: true,
    loading: false,
    selectedModel: 'gpt-5.4-mini',
    selectedProvider: 'openai',
  }),
}));

vi.mock('@/hooks/sourceThreads/useSourceThreadGeneration', () => ({
  useSourceThreadGeneration: (options: unknown) => {
    mocks.sourceThreadGenerationOptions(options);
    return {
      error: null,
      input: '',
      isLoading: false,
      isStreaming: false,
      messages: mocks.chatMessages,
      sendMessage: vi.fn(),
      setInput: vi.fn(),
      stopGenerating: vi.fn(),
      streamingContent: '',
      warning: null,
    };
  },
}));

vi.mock('@/hooks/materials/useMaterialUpload', () => ({
  useMaterialUpload: () => ({
    upload: vi.fn(),
    uploadUrl: vi.fn(),
    uploading: false,
  }),
}));

vi.mock('@/hooks/pins/usePinsCrud', () => ({
  usePinsCrud: () => ({
    add: vi.fn(),
    fetch: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
  }),
}));

vi.mock('@/store/pinsStore', () => {
  const state = { pins: [] };
  const usePinsStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state }
  );
  return { usePinsStore };
});

vi.mock('@/components/generation/GenerationModelSelector', () => ({
  GenerationModelSelector: ({ selectedModel }: { selectedModel: string }) => (
    <button aria-label={`Select model: ${selectedModel}`} type="button">
      {selectedModel}
    </button>
  ),
}));

function operation(id: string, path: string, afterValue: string): WorkspaceYOpsDraftOperation {
  return {
    id,
    op: 'set',
    path,
    summary: afterValue,
    afterValue,
    sourceRefs: ['material:brief'],
  };
}

function workspace(
  id: string,
  title: string,
  operations: WorkspaceYOpsDraftOperation[] = []
): WorkspaceCandidate {
  const starter = getProjectWorkspaceStarterCandidate('proj_1');
  return {
    ...starter,
    id,
    revision: 3,
    title,
    yopsDraft: {
      id: `draft:${id}`,
      operations,
    },
  };
}

describe('WorkspaceWorkbench Compose/Review integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chatMessages.length = 0;
    mocks.refreshWorkspaces.mockResolvedValue([]);
    mocks.extractCandidate.mockImplementation(async (candidate: WorkspaceCandidate) => ({
      candidate_id: `candidate:${candidate.id}`,
      workspace: candidate,
    }));
    mocks.sendToYOps.mockImplementation(async (candidate: WorkspaceCandidate) => ({
      candidate_id: `candidate:${candidate.id}`,
      workspace: candidate,
      yops_draft_id: candidate.yopsDraft.id,
    }));
    mocks.saveDraft.mockImplementation(async (candidate: WorkspaceCandidate, command?: string) => ({
      candidate_id: `candidate:${candidate.id}`,
      command,
      receipt: { request_id: `request:${command ?? 'draft.save'}` },
      workspace: { ...candidate, revision: (candidate.revision ?? 0) + 1 },
      yops_draft_id: candidate.yopsDraft.id,
    }));
  });

  it('exposes only the current Compose and Review workflow surfaces', () => {
    render(
      <WorkspaceWorkbench
        candidates={[workspace('workspace_main', 'Main workspace')]}
        projectId="proj_1"
      />
    );

    expect(screen.getByRole('tab', { name: 'Compose' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Review' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Source' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Proposal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Commit' })).not.toBeInTheDocument();
  });

  it('uses the externally selected workspace as the Compose context', () => {
    const main = workspace('workspace_main', 'Main workspace');
    const release = workspace('workspace_release', 'Release workspace');
    render(
      <WorkspaceWorkbench
        candidates={[main, release]}
        projectId="proj_1"
        selectedWorkspaceId={release.id}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Workspace scenario' })).toHaveValue(release.id);
  });

  it('keeps Compose chat on the regular generation lane and renders stored replies verbatim', () => {
    const storedReply = [
      'Source draft',
      '',
      'Summary: 1 captured item, 0 boundaries, 1 confirmation item.',
      '',
      'Needs confirmation',
      '- Confirm the target environment.',
    ].join('\n');
    mocks.chatMessages.push({
      content: storedReply,
      id: 'sha256:assistant_turn',
      rings: {
        source_chat_draft: {
          display: {
            captured: ['Target environment: production'],
            excluded: [],
            needs_confirmation: ['Confirm the target environment.'],
          },
        },
      },
      role: 'assistant',
    });

    render(
      <WorkspaceWorkbench
        candidates={[workspace('workspace_main', 'Main workspace')]}
        projectId="proj_1"
      />
    );

    expect(mocks.sourceThreadGenerationOptions).toHaveBeenCalledWith(
      expect.not.objectContaining({ sourceDraftReply: expect.anything() })
    );
    expect(
      screen.getByText(
        (content) =>
          content.includes('Source draft') && content.includes('Confirm the target environment.')
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/I saved this as proposal source/)).not.toBeInTheDocument();
  });

  it('renders structured changes in Compose and lets Review nodes select their evidence', () => {
    const candidate = workspace('workspace_main', 'Main workspace', [
      operation('op_outcome', 'prd/summary/outcome', 'Auditable rollouts'),
      operation('op_title', 'prd/requirements/canary/title', 'Canary rollout'),
    ]);
    render(<WorkspaceWorkbench candidates={[candidate]} projectId="proj_1" />);

    expect(screen.getByText('2 changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));

    expect(screen.getByLabelText('Workspace review structure')).toBeInTheDocument();
    const secondNode = screen.getByRole('button', {
      name: 'Select change prd/requirements/canary/title',
    });
    fireEvent.click(secondNode);
    expect(secondNode).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('article', { name: 'Change card prd/requirements/canary/title' })
    ).toBeInTheDocument();
    expect(screen.getAllByText('material:brief').length).toBeGreaterThan(0);
  });

  it('switches scenarios through the new sidebar selector and updates the URL owner', () => {
    const baseline = workspace('workspace_main', 'Main workspace', [
      operation('op_outcome', 'prd/summary/outcome', 'Baseline'),
    ]);
    const scenario = {
      ...workspace('workspace_scenario', 'Risk scenario', [
        operation('op_outcome_scenario', 'prd/summary/outcome', 'Reduced risk'),
      ]),
      scenario: {
        id: 'workspace_scenario',
        name: 'Risk scenario',
        createdAt: '2026-08-26T00:00:00.000Z',
        sourceWorkspaceId: baseline.id,
      },
    };
    const { rerender } = render(
      <WorkspaceWorkbench
        candidates={[baseline, scenario]}
        onSelectedWorkspaceChange={mocks.onSelectedWorkspaceChange}
        projectId="proj_1"
        selectedWorkspaceId={baseline.id}
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Workspace scenario' }), {
      target: { value: scenario.id },
    });

    expect(mocks.onSelectedWorkspaceChange).toHaveBeenCalledWith(scenario.id);
    rerender(
      <WorkspaceWorkbench
        candidates={[baseline, scenario]}
        onSelectedWorkspaceChange={mocks.onSelectedWorkspaceChange}
        projectId="proj_1"
        selectedWorkspaceId={scenario.id}
      />
    );
    expect(screen.getByRole('combobox', { name: 'Workspace scenario' })).toHaveValue(scenario.id);
  });

  it('renders the selected workspace changes in Review without the retired compare control', () => {
    const baseline = workspace('workspace_main', 'Main workspace', [
      operation('op_outcome', 'prd/summary/outcome', 'Baseline'),
      operation('op_audience', 'prd/summary/audience', 'Platform engineers'),
    ]);
    const scenario = {
      ...workspace('workspace_scenario', 'Risk scenario', [
        operation('op_outcome_scenario', 'prd/summary/outcome', 'Reduced risk'),
        operation('op_extra', 'prd/requirements/canary/title', 'Canary rollout'),
      ]),
      scenario: {
        id: 'workspace_scenario',
        name: 'Risk scenario',
        createdAt: '2026-08-26T00:00:00.000Z',
        sourceWorkspaceId: baseline.id,
      },
    };
    render(
      <WorkspaceWorkbench
        candidates={[baseline, scenario]}
        projectId="proj_1"
        selectedWorkspaceId={baseline.id}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Workspace scenario' })).toHaveValue(baseline.id);
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));

    expect(screen.queryByRole('combobox', { name: 'Compare scenario' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Workspace review structure')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select change prd/summary/outcome' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select change prd/summary/audience' })
    ).toBeInTheDocument();
  });

  it('restores View in State for an already committed Workspace', () => {
    const committed = {
      ...workspace('workspace_main', 'Committed workspace'),
      lastCommitHash: 'sha256:committed-workspace',
      status: 'committed' as const,
      targetBranch: 'feature/canary',
    };
    render(
      <WorkspaceWorkbench
        candidates={[committed]}
        onViewCommitInState={mocks.onViewCommitInState}
        projectId="proj_1"
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'View in State' }));

    expect(mocks.onViewCommitInState).toHaveBeenCalledWith(
      'sha256:committed-workspace',
      'feature/canary'
    );
  });

  it('fails honestly when preparation produces no deterministic operations', async () => {
    render(
      <WorkspaceWorkbench
        candidates={[workspace('workspace_main', 'Main workspace')]}
        projectId="proj_1"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Proceed to Review' }));

    await waitFor(() => expect(mocks.extractCandidate).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.sendToYOps).toHaveBeenCalledOnce());
    expect(await screen.findByRole('alert')).toHaveTextContent('No YOps operations were generated');
    expect(screen.getByRole('tab', { name: 'Review' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders loading, error, and no-candidate states explicitly', () => {
    const { rerender } = render(
      <WorkspaceWorkbench candidates={[]} projectId="proj_1" viewState="loading" />
    );
    expect(screen.getByText('Loading workspaces')).toBeInTheDocument();

    rerender(
      <WorkspaceWorkbench
        candidates={[]}
        errorMessage="Workspace API unavailable"
        projectId="proj_1"
        viewState="error"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Workspace API unavailable');

    rerender(<WorkspaceWorkbench candidates={[]} projectId="proj_1" />);
    expect(screen.getByText('No workspaces yet.')).toBeInTheDocument();
  });
});
