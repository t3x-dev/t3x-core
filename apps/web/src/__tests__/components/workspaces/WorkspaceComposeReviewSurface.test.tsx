// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceComposeReviewSurface } from '@/components/workspaces/WorkspaceComposeReviewSurface';
import {
  getProjectWorkspaceStarterCandidate,
  getWorkspacePreviewCandidates,
} from '@/data/workspaceCandidates';
import type { WorkspaceComposeReviewController } from '@/hooks/workspaces/useWorkspaceComposeReviewController';

const comparisonMocks = vi.hoisted(() => ({ validate: vi.fn() }));
vi.mock('@/hooks/workspaces/useWorkspaceYOps', () => ({
  validateWorkspaceCandidateYOps: comparisonMocks.validate,
}));

vi.mock('@/hooks/schemas/useStudioCandidates', () => ({
  useStudioCandidates: () => ({
    items: [{ available: true, id: 'product-brief', kind: 'module' }],
    loading: false,
  }),
}));

vi.mock('@/infrastructure/schemaStudio', () => ({
  applyStudioSelection: vi.fn(),
  previewStudioSelection: vi.fn(),
}));

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
    const branchSelector = screen.getByRole('button', {
      name: 'Switch branches/tags, current branch main',
    });

    expect(screen.queryByRole('button', { name: 'Add attachment' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Workspace workflow tabs')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Workspace scenario' })).not.toBeInTheDocument();
    expect(addSource.querySelector('.lucide-plus')).toBeInTheDocument();
    expect(addSource.querySelector('.lucide-database')).not.toBeInTheDocument();
    expect(branchSelector).toHaveTextContent('main');
    fireEvent.click(branchSelector);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'release' }));
    expect(branchChange).toHaveBeenCalledWith('release');
    expect(modelSelector.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    fireEvent.click(modelSelector);
    expect(modelSelectionMocks.handleModelChange).toHaveBeenCalledWith('openai', 'gpt-5.4-mini');

    expect(screen.getByRole('button', { name: 'Apply schema' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Review full draft' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Proposed changes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Discuss change' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Compose' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('navigation', { name: 'Workspace navigation' })).not.toBeInTheDocument();
  });

  it('starts AI summary instead of rule extraction', async () => {
    const starter = getProjectWorkspaceStarterCandidate('proj_1');
    const candidate = {
      ...starter,
      schemaBindings: getWorkspacePreviewCandidates('proj_1')[0]!.schemaBindings,
    };
    const summarizeWithAi = vi.fn().mockResolvedValue(true);
    const controller = {
      busyAction: null,
      candidate,
      chat: {
        error: null,
        input: 'Raise allocation to 25%.',
        isLoading: false,
        isStreaming: false,
        messages: [{ author: 'You', content: 'Raise allocation to 25%.', id: 'u1', role: 'user' }],
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
        change: vi.fn(),
        loading: false,
        ready: true,
        selectedModel: 'gpt-5.4-mini',
        selectedProvider: 'openai',
      },
      notice: null,
      scenarios: { options: [], selectedId: candidate.id },
      sourceBusy: false,
      summarizeWithAi,
    } as unknown as WorkspaceComposeReviewController;
    render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="compose"
        onModeChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'AI总结' }));
    expect(summarizeWithAi).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Generate changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply schema' })).not.toBeInTheDocument();
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
      schemaBindings: getWorkspacePreviewCandidates('proj_1')[0]!.schemaBindings,
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
    let resolveComparison!: (value: unknown) => void;
    comparisonMocks.validate.mockReturnValue(
      new Promise((resolve) => {
        resolveComparison = resolve;
      })
    );
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

    expect(screen.getByRole('tab', { name: 'Compose' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('navigation', { name: 'Workspace navigation' })).not.toBeInTheDocument();
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

    expect(screen.getByLabelText('Rendered result')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Workspace navigation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Validation' })).not.toBeInTheDocument();
    expect(document.querySelector('.workspace-rendered-review-theme')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open checks' }));
    expect(screen.getByRole('region', { name: 'Workspace review checks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project checks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Run history' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Review' }));
    expect(screen.getByLabelText('Rendered result')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Structure diff' }));
    expect(document.querySelector('.workspace-rendered-review-theme')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Workspace review structure')).not.toBeInTheDocument();
    expect(screen.getByText('Loading the exact before and after values…')).toBeInTheDocument();
    expect(comparisonMocks.validate).toHaveBeenCalledWith(candidate);
    await act(async () =>
      resolveComparison({
        ok: true,
        applied: 2,
        baselineRelations: [],
        previewRelations: [],
        yops: [],
        baselineTrees: [
          {
            key: 'prd',
            slots: {},
            children: [
              { key: 'summary', slots: { outcome: 'Previous outcome' }, children: [] },
              {
                key: 'requirements',
                slots: {},
                children: [{ key: 'canary', slots: { title: 'Previous title' }, children: [] }],
              },
            ],
          },
        ],
        previewTrees: [
          {
            key: 'prd',
            slots: {},
            children: [
              { key: 'summary', slots: { outcome: 'Auditable rollout outcome' }, children: [] },
              {
                key: 'requirements',
                slots: {},
                children: [{ key: 'canary', slots: { title: 'Canary rollout' }, children: [] }],
              },
            ],
          },
        ],
      })
    );
    expect(await screen.findByLabelText('Workspace review structure')).toBeInTheDocument();
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
    expect(screen.getByRole('table').querySelector('[data-diff-kind="added"]')).toBeNull();
    expect(
      screen
        .getByRole('table')
        .querySelectorAll('[data-diff-kind="modified"][data-diff-exact="true"]')
    ).toHaveLength(2);

    fireEvent.click(
      within(screen.getByRole('table')).getByTitle('prd/summary/outcome').closest('tr')!
    );
    const selectedChange = screen.getByRole('region', { name: 'Selected change' });
    expect(within(selectedChange).getByTitle('prd/summary/outcome')).toHaveTextContent(
      'prd.summary.outcome'
    );
    expect(within(selectedChange).getByText('Previous outcome')).toBeInTheDocument();
    expect(within(selectedChange).getByText('Auditable rollout outcome')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse prd', exact: true }));
    expect(within(screen.getByRole('table')).queryByTitle('prd/summary/outcome')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand prd', exact: true }));
    expect(within(screen.getByRole('table')).getByTitle('prd/summary/outcome')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rendered YAML' }));
    const code = screen.getByLabelText('YAML code view');
    fireEvent.click(
      within(code)
        .getAllByRole('button', {
          name: /Select code path prd\/requirements\/canary\/title, line/,
        })
        .at(-1)!
    );
    expect(
      within(screen.getByRole('region', { name: 'Selected change' })).getByTitle(
        'prd/requirements/canary/title'
      )
    ).toHaveTextContent('prd.requirements.canary.title');
    expect(screen.getByRole('button', { name: 'Commit draft' })).toBeDisabled();

    rerender(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={{
          ...controller,
          review: {
            ...controller.review,
            content: { relations: [], trees: [] },
            precondition: { workspaceRevision: 1 },
            transitionId: 'tr_review',
          },
        }}
        mode="review"
        onModeChange={onModeChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Commit draft' }));
    expect(decide).toHaveBeenCalledWith('accepted', undefined);
  });

  it('treats a stale validation review pane as Render', () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    navigationMocks.searchParams = new URLSearchParams(
      'workspaceMode=review&reviewPane=validation'
    );
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
        change: vi.fn(),
        loading: false,
        ready: true,
        selectedModel: 'gpt-5.4-mini',
        selectedProvider: 'openai',
      },
      notice: null,
      prepareReview: vi.fn(),
      renderedYaml: '',
      review: {
        changeProjection: null,
        commands: null,
        content: null,
        deterministicValidation: null,
        precondition: null,
        reviewSnapshot: null,
        transitionId: null,
        view: null,
      },
      scenarios: { options: [], selectedId: candidate.id },
      sourceBusy: false,
    } as unknown as WorkspaceComposeReviewController;

    render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Validation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Render' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Rendered result')).toBeInTheDocument();
    expect(navigationMocks.replace).toHaveBeenCalledWith(
      '/t3x-dev/test-project/workspaces?workspaceMode=review',
      { scroll: false }
    );
  });

  it.each([
    {
      path: 'candidate/product/title',
      schemaName: 'Product brief',
      title: 'T3X Product Brief Demo',
    },
    {
      path: 'candidate/checklist/title',
      schemaName: 'Care checklist',
      title: 'Daily dog care',
    },
    {
      path: 'candidate/services/web/image',
      schemaName: 'Compose services',
      title: 'nginx:1.28-alpine',
    },
  ] as const)(
    'keeps Apply, Review, and Commit on one path for $schemaName',
    async ({ path, schemaName, title }) => {
      const starter = getProjectWorkspaceStarterCandidate('proj_1');
      const candidate = {
        ...starter,
        schemaBindings: [{ mode: 'pinned' as const, schemaName, version: '1.0.0' }],
        yopsDraft: {
          ...starter.yopsDraft,
          operations: [
            {
              afterValue: title,
              id: 'op_bound',
              op: 'set',
              path,
              summary: title,
            },
          ],
        },
      };
      comparisonMocks.validate.mockResolvedValue({
        applied: 1,
        baselineRelations: [],
        baselineTrees: [{ children: [], key: 'candidate', slots: {} }],
        ok: true,
        previewRelations: [],
        previewTrees: [
          {
            children: [],
            key: 'candidate',
            slots: { title },
          },
        ],
        yops: [],
      });
      const decide = vi.fn().mockResolvedValue(null);
      const reviewReady = {
        changeProjection: null,
        commands: null,
        content: { relations: [], trees: [] },
        deterministicValidation: null,
        precondition: { workspaceRevision: 1 },
        reviewSnapshot: null,
        transitionId: `tr_${schemaName}`,
        view: {
          capabilities: {
            accept: { disposition: 'allowed' },
            override: { disposition: 'denied' },
            reject: { disposition: 'allowed' },
          },
          checks: { replay: undefined, validation: undefined },
          history: { observation: 'pending' },
          mode: 'proposal',
        },
      };
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
        prepareReview: vi.fn().mockResolvedValue(true),
        renderedYaml: '',
        review: reviewReady,
        scenarios: { options: [], selectedId: candidate.id },
        sourceBusy: false,
        viewCommit: vi.fn(),
      } as unknown as WorkspaceComposeReviewController;

      const { rerender } = render(
        <WorkspaceComposeReviewSurface
          candidate={candidate}
          controller={controller}
          mode="compose"
          onModeChange={vi.fn()}
        />
      );
      expect(screen.queryByRole('button', { name: 'Apply schema' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Review full draft' })).toBeEnabled();

      rerender(
        <WorkspaceComposeReviewSurface
          candidate={candidate}
          controller={controller}
          mode="review"
          onModeChange={vi.fn()}
        />
      );
      expect(screen.getByLabelText('Rendered result')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Commit draft' })).toBeEnabled();

      fireEvent.click(screen.getByRole('button', { name: 'Structure diff' }));
      expect(await screen.findByLabelText('Workspace review structure')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Commit draft' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Commit draft' }));
      expect(decide).toHaveBeenCalledWith('accepted', undefined);
    }
  );
});
