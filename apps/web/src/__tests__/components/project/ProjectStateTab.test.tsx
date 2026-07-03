// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStateTab } from '@/components/project/ProjectStateTab';
import type { YSchemaValidationSummary } from '@/domain/project/yschemaValidation';
import { useCanvasStore } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';

const branchMocks = vi.hoisted(() => ({
  create: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/hooks/shared/useBranches', () => ({
  useBranches: () => ({
    branches: ['main'],
    create: branchMocks.create,
    loading: false,
    refresh: branchMocks.refresh,
  }),
}));

describe('ProjectStateTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    branchMocks.create.mockResolvedValue(undefined);
    branchMocks.refresh.mockResolvedValue(undefined);
    useChatStore.setState({ activeBranch: 'main' });
    useCommitStore.setState({ commitBranch: 'main' });
    useCanvasStore.setState({
      edges: [{ id: 'edge_1', source: 'commit_1', target: 'commit_2' }],
      nodes: [
        {
          id: 'commit_1',
          type: 'unit',
          position: { x: 0, y: 0 },
          data: {
            branchType: 'main',
            commitHash: 'sha256:mainhead123456',
            commitStatus: 'committed',
            kind: 'unit',
            leaves: [{ id: 'leaf_1' }],
            summary: 'Current committed state',
            timestamp: '2026-07-02T08:00:00.000Z',
            title: 'Main state',
          },
        },
        {
          id: 'commit_2',
          type: 'unit',
          position: { x: 120, y: 0 },
          data: {
            branchName: 'feature/prd',
            branchType: 'branch',
            commitHash: 'sha256:featurehead123456',
            commitStatus: 'committed',
            kind: 'unit',
            leaves: [],
            summary: 'Branch state',
            timestamp: '2026-07-02T09:00:00.000Z',
            title: 'Feature state',
          },
        },
      ],
    } as never);
  });

  it('renders the whole repo Canvas as the default State view', () => {
    render(
      <ProjectStateTab projectId="proj_test" projectName="Test Project">
        <div data-testid="state-canvas-child" />
      </ProjectStateTab>
    );

    expect(screen.getByText('Repo canvas')).toBeInTheDocument();
    expect(screen.getByText('State status')).toBeInTheDocument();
    expect(screen.getByText('YSchema pending')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch focus')).toHaveValue('all');
    expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('state-canvas-child')).toBeInTheDocument();
    expect(screen.queryByText('State tree')).toBeNull();
  });

  it('opens the State tree as a focused repo inspection view', () => {
    render(
      <ProjectStateTab projectId="proj_test" projectName="Test Project">
        <div data-testid="state-canvas-child" />
      </ProjectStateTab>
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Tree' }));

    expect(screen.getByRole('tab', { name: 'Tree' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('State tree')).toBeInTheDocument();
    expect(screen.getByText(/view: all/)).toBeInTheDocument();
    expect(screen.getByText(/focus: All repo/)).toBeInTheDocument();
    expect(screen.queryByTestId('state-canvas-child')).toBeNull();
  });

  it('creates a branch from the branch focus bar and switches the focused branch', async () => {
    render(
      <ProjectStateTab projectId="proj_test" projectName="Test Project">
        <div data-testid="state-canvas-child" />
      </ProjectStateTab>
    );

    fireEvent.click(screen.getByRole('button', { name: 'New branch' }));
    fireEvent.change(screen.getByLabelText('New branch name'), {
      target: { value: 'feature state' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(branchMocks.create).toHaveBeenCalledWith('feature-state', 'main');
    });
    expect(screen.getByLabelText('Branch focus')).toHaveValue('feature-state');
    expect(useChatStore.getState().activeBranch).toBe('feature-state');
    expect(useCommitStore.getState().commitBranch).toBe('feature-state');
  });

  it('opens the Diff view from the Compare action', () => {
    render(
      <ProjectStateTab projectId="proj_test" projectName="Test Project">
        <div data-testid="state-canvas-child" />
      </ProjectStateTab>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));

    expect(screen.getByRole('tab', { name: 'Diff' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'State diff' })).toBeInTheDocument();
  });

  it('shows the current commit YSchema gate inside State next to the repo canvas', () => {
    const onRunValidation = vi.fn();
    const validation: YSchemaValidationSummary = {
      checkedAt: '2026-07-02T00:00:01.000Z',
      commitHash: 'sha256:5fbfafd8fa2fec3e',
      errorCount: 0,
      fixCount: 2,
      gapCount: 2,
      gaps: [
        {
          code: 'REQUIRED_NODE_MISSING',
          label: 'Missing required node',
          message: 'summary is required before commit.',
          path: 'summary',
        },
        {
          code: 'REQUIRED_NODE_MISSING',
          label: 'Missing required node',
          message: 'requirements is required before commit.',
          path: 'requirements',
        },
      ],
      ready: false,
      runId: 'ysvr_failed',
      schemaName: 't3x/prd',
      status: 'failed',
      valid: true,
    };

    render(
      <ProjectStateTab
        onRunValidation={onRunValidation}
        projectId="proj_test"
        projectName="Test Project"
        validation={validation}
      >
        <div data-testid="state-canvas-child" />
      </ProjectStateTab>
    );

    expect(screen.getByTestId('state-canvas-child')).toBeInTheDocument();
    expect(screen.getByText('State status')).toBeInTheDocument();
    expect(screen.getByText('YSchema failed · 2 gaps')).toBeInTheDocument();
    expect(screen.getByText('Schema t3x/prd')).toBeInTheDocument();
    expect(screen.getByText('Repo canvas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 validation gaps' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByText('summary is required before commit.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2 validation gaps' }));

    expect(screen.getByRole('button', { name: '2 validation gaps' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText('summary is required before commit.')).toBeInTheDocument();
    expect(screen.getByText('requirements is required before commit.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run validation' }));

    expect(onRunValidation).toHaveBeenCalledTimes(1);
  });
});
