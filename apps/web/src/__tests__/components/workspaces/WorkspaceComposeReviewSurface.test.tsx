// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceComposeReviewSurface } from '@/components/workspaces/WorkspaceComposeReviewSurface';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import type { WorkspaceComposeReviewController } from '@/hooks/workspaces/useWorkspaceComposeReviewController';

const modelSelectionMocks = vi.hoisted(() => ({
  handleModelChange: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  pathname: '/t3x-dev/test-project/workspaces',
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/components/generation/GenerationModelSelector', () => ({
  GenerationModelSelector: ({
    onModelChange,
    selectedModel,
  }: {
    onModelChange: (provider: string, model: string) => void;
    selectedModel: string;
  }) => (
    <button
      aria-label={`Select model: ${selectedModel}`}
      onClick={() => onModelChange('openai', 'gpt-5.4-mini')}
      type="button"
    >
      {selectedModel}
    </button>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({ replace: navigationMocks.replace }),
  useSearchParams: () => navigationMocks.searchParams,
}));

describe('WorkspaceComposeReviewSurface composer', () => {
  beforeEach(() => {
    modelSelectionMocks.handleModelChange.mockReset();
    navigationMocks.replace.mockReset();
    navigationMocks.searchParams = new URLSearchParams();
  });

  it('groups the real model entry with send and uses plus as the only source icon', () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const controller = {
      busyAction: null,
      candidate,
      chat: {
        error: null,
        input: '',
        isLoading: false,
        isStreaming: false,
        messages: [],
        send: vi.fn(),
        setInput: vi.fn(),
        stop: vi.fn(),
        warning: null,
      },
      error: null,
      hasCollaborationConflict: false,
      isBusy: false,
      materialSources: [],
      model: {
        availabilityError: null,
        change: modelSelectionMocks.handleModelChange,
        loading: false,
        ready: true,
        selectedModel: 'gpt-5.4',
        selectedProvider: 'openai',
      },
      notice: null,
      scenarios: { options: [], selectedId: candidate.id },
      sourceBusy: false,
    } as unknown as WorkspaceComposeReviewController;
    const branchChange = vi.fn();
    render(
      <WorkspaceComposeReviewSurface
        branchOptions={['main', 'release']}
        candidate={candidate}
        controller={controller}
        mode="compose"
        onBranchChange={branchChange}
        onModeChange={vi.fn()}
      />
    );

    const addSource = screen.getByRole('button', { name: 'Add source' });
    const modelSelector = screen.getByRole('button', { name: 'Select model: gpt-5.4' });
    const send = screen.getByRole('button', { name: 'Send message' });
    const branchSelector = screen.getByRole('combobox', { name: 'Branch workspace' });

    expect(screen.queryByRole('button', { name: 'Add attachment' })).not.toBeInTheDocument();
    expect(addSource.querySelector('.lucide-plus')).toBeInTheDocument();
    expect(addSource.querySelector('.lucide-database')).not.toBeInTheDocument();
    expect(branchSelector).toHaveClass('w-[188px]');
    fireEvent.change(branchSelector, { target: { value: 'release' } });
    expect(branchChange).toHaveBeenCalledWith('release');
    expect(modelSelector.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    fireEvent.click(modelSelector);
    expect(modelSelectionMocks.handleModelChange).toHaveBeenCalledWith('openai', 'gpt-5.4-mini');
  });

  it('routes composer send, pasted text, and file input to the controller', async () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const send = vi.fn();
    const addPaste = vi.fn().mockResolvedValue(true);
    const uploadFile = vi.fn().mockResolvedValue(true);
    const controller = {
      addPaste,
      busyAction: null,
      candidate,
      chat: {
        error: null,
        input: 'Prepare the reviewed change.',
        isLoading: false,
        isStreaming: false,
        messages: [],
        send,
        setInput: vi.fn(),
        stop: vi.fn(),
        warning: null,
      },
      error: null,
      hasCollaborationConflict: false,
      isBusy: false,
      materialSources: [],
      model: {
        availabilityError: null,
        change: vi.fn(),
        loading: false,
        ready: true,
        selectedModel: 'gpt-5.4-mini',
        selectedProvider: 'openai',
      },
      notice: null,
      scenarios: { options: [], selectedId: candidate.id },
      sourceBusy: false,
      uploadFile,
    } as unknown as WorkspaceComposeReviewController;
    render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="compose"
        onModeChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(send).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByLabelText('Upload source material'), {
      target: { files: [new File(['exact source'], 'source.txt', { type: 'text/plain' })] },
    });
    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'source.txt' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste text' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Source title' }), {
      target: { value: 'Exact requirement' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Pasted source text' }), {
      target: { value: 'Audience is platform engineers.' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add source' }).at(-1)!);

    await waitFor(() =>
      expect(addPaste).toHaveBeenCalledWith('Exact requirement', 'Audience is platform engineers.')
    );
  });

  it('wires artifact, changed-node, and evidence controls to real review interactions', async () => {
    const starter = getProjectWorkspaceStarterCandidate('proj_1');
    const candidate = {
      ...starter,
      yopsDraft: {
        ...starter.yopsDraft,
        operations: [
          {
            id: 'op_outcome',
            op: 'set',
            path: 'prd/summary/outcome',
            summary: 'Auditable rollout outcome',
            afterValue: 'Auditable rollout outcome',
          },
          {
            id: 'op_title',
            op: 'set',
            path: 'prd/requirements/canary/title',
            summary: 'Canary rollout',
            afterValue: 'Canary rollout',
            sourceRefs: ['material:brief'],
          },
        ],
      },
    };
    const prepareReview = vi.fn().mockResolvedValue(true);
    const decide = vi.fn().mockResolvedValue(null);
    const onModeChange = vi.fn();
    const controller = {
      busyAction: null,
      candidate,
      chat: {
        error: null,
        input: '',
        isLoading: false,
        isStreaming: false,
        messages: [],
        send: vi.fn(),
        setInput: vi.fn(),
        stop: vi.fn(),
        warning: null,
      },
      copyReceipt: vi.fn(),
      decide,
      decisionReason: '',
      error: null,
      hasCollaborationConflict: false,
      isBusy: false,
      materialSources: [],
      model: {
        availabilityError: null,
        change: vi.fn(),
        loading: false,
        ready: true,
        selectedModel: 'gpt-5.4-mini',
        selectedProvider: 'openai',
      },
      notice: null,
      prepareReview,
      renderedYaml: '',
      review: {
        changeProjection: null,
        commands: null,
        content: null,
        deterministicValidation: null,
        precondition: null,
        reviewSnapshot: null,
        transitionId: null,
        view: {
          capabilities: {
            accept: { disposition: 'allowed' },
            override: { disposition: 'denied' },
            reject: { disposition: 'allowed' },
          },
          checks: {
            replay: undefined,
            validation: undefined,
          },
          history: { observation: 'pending' },
          mode: 'proposal',
        },
      },
      scenarios: { options: [], selectedId: candidate.id },
      setDecisionReason: vi.fn(),
      sourceBusy: false,
      viewCommit: vi.fn(),
    } as unknown as WorkspaceComposeReviewController;
    const { rerender } = render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="compose"
        onModeChange={onModeChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Review change prd/summary/outcome' }));
    await waitFor(() => expect(prepareReview).toHaveBeenCalledOnce());
    expect(onModeChange).toHaveBeenCalledWith('review');

    rerender(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={onModeChange}
      />
    );

    expect(screen.getByLabelText('Workspace review structure')).toBeInTheDocument();
    expect(screen.getByLabelText('Workspace review structure')).toHaveClass(
      'h-full',
      'min-h-0',
      'min-w-0'
    );
    expect(screen.queryByRole('button', { name: 'Review actions' })).not.toBeInTheDocument();
    expect(screen.queryByText('draft:candidate:workspace_branch:main')).not.toBeInTheDocument();
    const selectedChange = screen.getAllByLabelText('Workspace selected change')[0];
    expect(selectedChange).toHaveClass('h-full', '[--review-scroll-gutter:0.875rem]');
    expect(
      within(selectedChange).getByRole('region', { name: 'Workspace selected change' })
        .parentElement
    ).toHaveClass(
      'pr-[var(--review-scroll-gutter)]',
      '[&>[data-slot=state-scroll-area-scrollbar]]:invisible'
    );
    expect(
      screen.getByRole('region', { name: 'Workspace structure rows' }).parentElement
    ).not.toHaveClass('[&>[data-slot=state-scroll-area-scrollbar]]:invisible');
    const firstNode = screen.getByRole('button', {
      name: 'Select change prd/summary/outcome',
    });
    fireEvent.click(firstNode);
    expect(firstNode).toHaveAttribute('aria-pressed', 'true');
    expect(within(selectedChange).getByText('Selected change')).toBeInTheDocument();
    expect(within(selectedChange).getByText('Why')).toBeInTheDocument();
    expect(within(selectedChange).getByText('Source')).toBeInTheDocument();
    expect(within(selectedChange).getByText('Verified')).toBeInTheDocument();
    const schemaNotice = within(selectedChange).getByText('Schema needs review').parentElement!;
    expect(schemaNotice).toHaveClass('min-w-0', 'px-2.5', '[overflow-wrap:anywhere]');
    expect(schemaNotice.parentElement).toHaveClass('grid-cols-1', 'min-w-0');
    expect(selectedChange.querySelector('footer')).toHaveClass('px-4');
    expect(selectedChange.querySelector('footer')).toHaveClass(
      'pr-[calc(1rem+var(--review-scroll-gutter))]'
    );
    const workspaceValueChange = within(selectedChange).getByTestId('workspace-value-change');
    expect(workspaceValueChange).toHaveClass('mt-3', 'min-w-0');
    expect(workspaceValueChange.firstElementChild).toHaveClass(
      'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
      'px-2'
    );
    const workspaceValueFrame = within(workspaceValueChange).getByTestId('workspace-value-frame');
    expect(workspaceValueFrame).toHaveClass(
      'h-9',
      'overflow-hidden',
      'rounded-[8px]',
      'shadow-[var(--fx-shadow-sm)]'
    );
    expect(within(workspaceValueChange).getByTestId('workspace-before-value')).toHaveClass(
      'block',
      'overflow-hidden',
      'rounded-[6px]',
      'hover:bg-[var(--surface-elevated)]'
    );
    expect(within(workspaceValueChange).getByText('Before')).toHaveClass('text-[10px]');
    expect(within(workspaceValueChange).getByText('Result')).toHaveClass('text-[10px]');
    expect(within(workspaceValueFrame).getByText('->')).toBeInTheDocument();
    expect(within(workspaceValueChange).getByTestId('workspace-before-value')).toHaveAttribute(
      'aria-label',
      'Before full value: No parent value'
    );
    expect(within(workspaceValueChange).getByTestId('workspace-before-value')).toHaveAttribute(
      'title',
      'No parent value'
    );
    expect(within(workspaceValueChange).getByTestId('workspace-result-value')).toHaveAttribute(
      'aria-label',
      'Result full value: Auditable rollout outcome'
    );
    expect(within(workspaceValueChange).getByTestId('workspace-result-value')).toHaveAttribute(
      'title',
      'Auditable rollout outcome'
    );
    expect(
      within(workspaceValueChange).queryByRole('button', { name: 'View full value' })
    ).toBeNull();
    expect(within(selectedChange).getAllByText('Auditable rollout outcome').length).toBeGreaterThan(
      0
    );
    fireEvent.click(within(selectedChange).getByRole('button', { name: 'View' }));
    expect(within(selectedChange).getByText('State path')).toBeInTheDocument();
    expect(within(selectedChange).queryByRole('button', { name: 'Edit result' })).toBeNull();
    expect(within(selectedChange).queryByRole('button', { name: 'Comment' })).toBeNull();
    expect(screen.queryByText('Awaiting your decision')).not.toBeInTheDocument();
    fireEvent.click(within(selectedChange).getByRole('button', { name: 'Edit in Compose' }));
    expect(onModeChange).toHaveBeenCalledWith('compose');
    fireEvent.click(within(selectedChange).getByRole('button', { name: 'Reject' }));
    expect(decide).toHaveBeenCalledWith('rejected');
    fireEvent.click(within(selectedChange).getByRole('button', { name: 'Commit 2 changes' }));
    expect(decide).toHaveBeenCalledWith('accepted');

    const secondNode = screen.getByRole('button', {
      name: 'Select change prd/requirements/canary/title',
    });
    fireEvent.click(secondNode);
    expect(secondNode).toHaveAttribute('aria-pressed', 'true');
    expect(within(selectedChange).getByText('title')).toBeInTheDocument();
    expect(within(selectedChange).getAllByText('Canary rollout').length).toBeGreaterThan(0);
    expect(within(selectedChange).getAllByRole('article')).toHaveLength(1);

    // Group selection includes all descendant fields even after collapsing the tree.
    fireEvent.click(screen.getByRole('button', { name: 'Collapse prd', exact: true }));
    const cards = within(selectedChange).getByRole('region', { name: 'Selected change cards' });
    expect(cards).toHaveClass('min-w-0', 'w-full', 'max-w-full');
    expect(cards).not.toHaveClass('grid');
    expect(within(cards).getAllByText('Selected change')).toHaveLength(1);
    expect(within(cards).getByText('Selected change').closest('article')).toBeNull();
    expect(within(cards).queryByText('Node details')).not.toBeInTheDocument();
    expect(within(cards).getByRole('button', { name: 'Collapse card area' })).toHaveClass(
      'min-w-0',
      'w-full',
      'max-w-full'
    );
    expect(
      within(cards)
        .getAllByRole('article')
        .map((card) => card.getAttribute('aria-label'))
    ).toEqual(
      expect.arrayContaining([
        'Change card prd/summary/outcome',
        'Change card prd/requirements/canary/title',
      ])
    );
    for (const card of within(cards).getAllByRole('article')) {
      expect(card.className.split(' ')).not.toContain('border');
      expect(card.className).not.toContain('rounded-');
      expect(card).toHaveClass('py-3');
      expect(
        within(card).queryByText(
          /Selected change|State field|Modified|Added|Removed|Unchanged|Missing/
        )
      ).not.toBeInTheDocument();
      expect(within(card).queryByText(/^prd\//)).not.toBeInTheDocument();
      expect(within(card).getByText('Before')).toBeInTheDocument();
      expect(within(card).getByText('Result')).toBeInTheDocument();
      expect(within(card).getByTestId('workspace-value-frame')).toHaveClass('h-9');
      expect(within(card).queryByText('Current value')).not.toBeInTheDocument();
      if (['Unchanged', 'Missing'].includes(card.getAttribute('aria-description') ?? '')) {
        expect(
          within(card).getByTestId('workspace-before-value').firstElementChild
        ).not.toHaveClass('text-[var(--diff-removed-text)]');
        expect(
          within(card).getByTestId('workspace-result-value').firstElementChild
        ).not.toHaveClass('text-[var(--diff-added-text)]');
      }
    }
    const cardCount = within(cards).getAllByRole('article').length;
    expect(within(cards).getByRole('region', { name: 'Node cards' })).toHaveClass(
      'max-h-[40dvh]',
      'max-w-full',
      'overscroll-contain'
    );
    expect(within(cards).getByRole('region', { name: 'Node cards' }).parentElement).toHaveClass(
      '[&>[data-slot=state-scroll-area-scrollbar]]:invisible'
    );
    const collapseArea = within(cards).getByRole('button', { name: 'Collapse card area' });
    expect(collapseArea).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(collapseArea);
    expect(within(cards).queryAllByRole('article')).toHaveLength(0);
    expect(within(cards).getAllByText('Selected change')).toHaveLength(1);
    expect(within(cards).queryByRole('region', { name: 'Node cards' })).not.toBeInTheDocument();
    expect(within(selectedChange).getByText('Why')).toBeVisible();
    expect(within(selectedChange).getByRole('button', { name: 'Commit 2 changes' })).toBeVisible();
    const expandArea = within(cards).getByRole('button', { name: 'Expand card area' });
    expect(expandArea).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(expandArea.getAttribute('aria-controls')!)).not.toBeVisible();
    fireEvent.click(expandArea);
    expect(within(cards).getAllByRole('article')).toHaveLength(cardCount);
    expect(screen.getByRole('button', { name: 'Expand prd', exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand prd', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse summary', exact: true }));
    expect(
      within(selectedChange)
        .getAllByRole('article')
        .every((card) => card.getAttribute('aria-label')?.startsWith('Change card prd/summary/'))
    ).toBe(true);
    expect(
      within(selectedChange).getByRole('article', {
        name: 'Change card prd/summary/outcome',
      })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rendered YAML' }));
    const yaml = screen.getByLabelText('YAML code view');
    expect(screen.getByText(/Draft preview — base not verified/)).toBeInTheDocument();
    expect(
      within(selectedChange).getByRole('article', { name: 'Change card prd/summary/outcome' })
    ).toBeInTheDocument();
    fireEvent.click(
      within(yaml).getByRole('button', {
        name: /Select code path prd\/requirements\/canary\/title, line/,
      })
    );
    expect(within(selectedChange).getAllByRole('article')).toHaveLength(1);
    expect(
      within(selectedChange).getByRole('article', {
        name: 'Change card prd/requirements/canary/title',
      })
    ).toBeInTheDocument();
    fireEvent.click(firstNode);
    expect(screen.getByLabelText('YAML code view')).toBeInTheDocument();
    expect(
      within(selectedChange).getByRole('article', { name: 'Change card prd/summary/outcome' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Changes', exact: true }));
    expect(
      within(selectedChange).getByRole('article', { name: 'Change card prd/summary/outcome' })
    ).toBeInTheDocument();
  });
});
