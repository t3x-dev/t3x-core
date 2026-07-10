// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stateHookMocks = vi.hoisted(() => ({
  loadCommits: vi.fn(),
  loadLeaves: vi.fn(),
  loadOperations: vi.fn(),
  refreshBranches: vi.fn(),
  refreshWorkspaces: vi.fn(),
}));

const replaceMock = vi.fn();
const pushMock = vi.fn();
let searchParamsValue = new URLSearchParams();
let routeParamsValue: Record<string, string> = { projectId: 'proj_test' };
let pathnameValue = '/t3x-dev/test-project';

vi.mock('next/navigation', () => ({
  useParams: () => routeParamsValue,
  usePathname: () => pathnameValue,
  useSearchParams: () => searchParamsValue,
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}));

vi.mock('@/components/canvas', () => ({
  CanvasWorkspace: ({ projectName }: { projectName: string }) => (
    <div data-testid="canvas-workspace">{projectName}</div>
  ),
}));

vi.mock('@/components/onboarding/ProjectDemoTourOverlay', () => ({
  ProjectDemoTourOverlay: ({ open }: { open: boolean }) => (
    <div data-open={String(open)} data-testid="project-demo-tour" />
  ),
}));

vi.mock('@/hooks/canvas/useCanvasDeletionWiring', () => ({
  useCanvasDeletionWiring: () => undefined,
}));

vi.mock('@/hooks/canvas/useCanvasNodeActions', () => ({
  useCanvasNodeActions: () => ({ load: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('@/hooks/pins/usePinsCrud', () => ({
  usePinsCrud: () => ({ fetch: vi.fn() }),
}));

vi.mock('@/hooks/shared/useBranches', () => ({
  useBranches: () => ({
    branches: ['main'],
    create: vi.fn(),
    loading: false,
    refresh: stateHookMocks.refreshBranches,
  }),
}));

vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({
    error: null,
    loading: false,
    refresh: stateHookMocks.refreshWorkspaces,
    workspaces: [],
  }),
}));

vi.mock('@/hooks/commits/useCommitsList', () => ({
  useCommitsList: () => ({ loadCommits: stateHookMocks.loadCommits }),
}));

vi.mock('@/hooks/commits/useLeavesByCommit', () => ({
  useLeavesByCommit: () => ({ loadLeaves: stateHookMocks.loadLeaves }),
}));

vi.mock('@/hooks/commits/useCommitOperations', () => ({
  useCommitOperations: () => ({ loadOperations: stateHookMocks.loadOperations }),
}));

vi.mock('@/hooks/projects/useProjectCrud', () => ({
  useProjectCrud: () => ({ list: vi.fn() }),
}));

vi.mock('@/queries/project', () => ({
  fetchProject: vi.fn(),
}));

vi.mock('@/queries/yschemaValidation', () => ({
  fetchLatestYSchemaValidation: vi.fn(),
  runYSchemaValidation: vi.fn(),
}));

import ProjectDetailPage, { ProjectDetailPageContent } from '@/app/project/[projectId]/page';
import { fetchProject } from '@/queries/project';
import { fetchLatestYSchemaValidation, runYSchemaValidation } from '@/queries/yschemaValidation';
import { useCanvasStore } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { useProjectStore } from '@/store/projectStore';
import type { ApiCommit } from '@/types/api';

const STATE_COMMIT: ApiCommit = {
  author: { type: 'agent', name: 'T3X' },
  branch: 'main',
  committed_at: '2026-07-02T00:00:00.000Z',
  content: {
    trees: [
      {
        key: 'prd',
        slots: { title: 'Committed PRD state' },
        children: [
          {
            key: 'summary',
            slots: { problem: 'A problem', audience: 'A team', outcome: 'A result' },
            children: [],
          },
          { key: 'requirements', slots: {}, children: [] },
        ],
      },
    ],
    relations: [],
  },
  hash: 'sha256:abcdef1234567890',
  message: 'Committed PRD state',
  parents: [],
  project_id: 'proj_test',
  provenance: { method: 'workspace' },
  schema: 't3x/commit',
  sources: [],
  yops_log_ids: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  stateHookMocks.loadCommits.mockResolvedValue([]);
  stateHookMocks.loadLeaves.mockResolvedValue([]);
  stateHookMocks.loadOperations.mockResolvedValue({
    commit_hash: STATE_COMMIT.hash,
    operations: [],
  });
  stateHookMocks.refreshBranches.mockResolvedValue(undefined);
  stateHookMocks.refreshWorkspaces.mockResolvedValue(undefined);
  searchParamsValue = new URLSearchParams();
  pathnameValue = '/t3x-dev/test-project';
  routeParamsValue = { projectId: 'proj_test' };
  useChatStore.setState({ activeProjectId: null, activeConversationId: null });
  vi.mocked(fetchProject).mockResolvedValue({
    project_id: 'proj_test',
    name: 'Test Project',
    created_at: '2026-05-28T00:00:00.000Z',
    conversations_count: 0,
    commits_count: 0,
    turns_count: 0,
    branches_count: 0,
    metadata: {},
  } as never);
  vi.mocked(fetchLatestYSchemaValidation).mockResolvedValue(null);
  vi.mocked(runYSchemaValidation).mockReset();
  useProjectStore.setState({
    projects: [{ id: 'proj_test', name: 'Test Project' } as never],
    initialized: true,
    loading: false,
  });
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    loading: false,
    loadError: null,
    projectId: 'proj_test',
    openNodeId: null,
    modalViewMode: null,
  });
});

afterEach(() => {
  useChatStore.setState({ activeProjectId: null, activeConversationId: null });
  useProjectStore.setState({ projects: [], initialized: false, loading: false });
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    loading: false,
    loadError: null,
    projectId: null,
    openNodeId: null,
    modalViewMode: null,
  });
});

describe('ProjectDetailPage — project-first shell states', () => {
  const renderProjectContent = () =>
    render(<ProjectDetailPageContent projectIdOverride="proj_test" />);

  it('canonicalizes project id routes to owner/repo routes', async () => {
    searchParamsValue = new URLSearchParams('tab=workspaces&zoom=1.00&x=10&y=20');
    pathnameValue = '/project/proj_test';

    render(<ProjectDetailPage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/t3x-dev/test-project/workspaces');
    });
  });

  it('renders project detail from an owner/repo route override', () => {
    routeParamsValue = { owner: 't3x-dev', repo: 'test-project' };
    useChatStore.setState({ activeProjectId: null, activeConversationId: null });

    render(<ProjectDetailPageContent projectIdOverride="proj_test" />);

    expect(screen.getByRole('heading', { name: 'Test Project' })).toBeInTheDocument();
    expect(screen.getByText('/t3x-dev/test-project')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'State' })).toHaveAttribute('aria-selected', 'true');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('renders a verified YSchema badge from the latest validation run', async () => {
    stateHookMocks.loadCommits.mockResolvedValue([STATE_COMMIT]);
    vi.mocked(fetchLatestYSchemaValidation).mockResolvedValueOnce({
      commit_hash: 'sha256:abcdef1234567890',
      created_at: '2026-07-02T00:00:00.000Z',
      error_count: 0,
      finished_at: '2026-07-02T00:00:01.000Z',
      fix_count: 0,
      gap_count: 0,
      id: 'ysvr_passed',
      project_id: 'proj_test',
      ready: true,
      result: { validation: { gaps: [] } },
      schema_hash: 'sha256:schema',
      schema_name: 't3x/prd',
      schema_version: 'PRD Schema v2',
      started_at: '2026-07-02T00:00:00.000Z',
      status: 'passed',
      valid: true,
      validator_version: 'yschema-p0@0.1',
    });

    render(<ProjectDetailPageContent projectIdOverride="proj_test" />);

    await waitFor(() => {
      expect(screen.getAllByText('YSchema verified').length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('tab', { name: 'State' })).toHaveAttribute('aria-selected', 'true');
    const stateOverview = await screen.findByRole('region', { name: 'State overview' });
    expect(within(stateOverview).getByText('YSchema verified')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Committed PRD state' })).toBeInTheDocument();
    expect(screen.getByText('output-ready')).toBeInTheDocument();
  });

  it('shows failed YSchema gaps and can rerun validation from State', async () => {
    searchParamsValue = new URLSearchParams('tab=state');
    stateHookMocks.loadCommits.mockResolvedValue([STATE_COMMIT]);
    vi.mocked(fetchLatestYSchemaValidation).mockResolvedValueOnce({
      commit_hash: STATE_COMMIT.hash,
      created_at: '2026-07-02T00:00:00.000Z',
      error_count: 0,
      finished_at: '2026-07-02T00:00:01.000Z',
      fix_count: 2,
      gap_count: 2,
      id: 'ysvr_failed',
      project_id: 'proj_test',
      ready: false,
      result: {
        validation: {
          gaps: [
            {
              code: 'REQUIRED_NODE_MISSING',
              message: 'summary is required before commit.',
              path: 'summary',
            },
            {
              code: 'REQUIRED_NODE_MISSING',
              message: 'requirements is required before commit.',
              path: 'requirements',
            },
          ],
        },
      },
      schema_hash: 'sha256:schema',
      schema_name: 't3x/prd',
      schema_version: 'PRD Schema v2',
      started_at: '2026-07-02T00:00:00.000Z',
      status: 'failed',
      valid: true,
      validator_version: 'yschema-p0@0.1',
    });
    vi.mocked(runYSchemaValidation).mockResolvedValueOnce({
      commit_hash: 'sha256:abcdef1234567890',
      created_at: '2026-07-02T00:01:00.000Z',
      error_count: 0,
      finished_at: '2026-07-02T00:01:01.000Z',
      fix_count: 0,
      gap_count: 0,
      id: 'ysvr_passed',
      project_id: 'proj_test',
      ready: true,
      result: { validation: { gaps: [] } },
      schema_hash: 'sha256:schema',
      schema_name: 't3x/prd',
      schema_version: 'PRD Schema v2',
      started_at: '2026-07-02T00:01:00.000Z',
      status: 'passed',
      valid: true,
      validator_version: 'yschema-p0@0.1',
    });

    render(<ProjectDetailPageContent projectIdOverride="proj_test" />);

    expect(screen.getByRole('tab', { name: 'State' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      expect(screen.getAllByText('YSchema failed · 2 gaps').length).toBeGreaterThan(0);
    });
    const stateOverview = await screen.findByRole('region', { name: 'State overview' });
    expect(within(stateOverview).getByText('2 required fields missing')).toBeInTheDocument();
    expect(screen.getByText('2 validation gap')).toBeInTheDocument();
    expect(screen.getByText('output blocked')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run validation' }));

    await waitFor(() => {
      expect(runYSchemaValidation).toHaveBeenCalledWith('proj_test');
      expect(screen.getAllByText('YSchema verified').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('output-ready')).toBeInTheDocument();
  });

  it('shows an empty committed State and can switch to Workspaces', async () => {
    // Reset chat store to simulate a cold direct-load: no in-memory project.
    useChatStore.setState({ activeProjectId: null, activeConversationId: null });

    renderProjectContent();

    expect(screen.getByRole('link', { name: 'Back to t3x-dev' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { name: 'Test Project' })).toBeInTheDocument();
    expect(screen.getByText('t3x-dev')).toBeInTheDocument();
    expect(screen.getByText('/t3x-dev/test-project')).toBeInTheDocument();
    expect(screen.getByText('repo')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getAllByText('YSchema pending').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'State' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('No commit on this branch')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Points/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('canvas-workspace')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Workspaces' }));

    expect(replaceMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('/t3x-dev/test-project/workspaces', { scroll: false });
    expect(screen.getByRole('tab', { name: 'Workspaces' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('keeps committed State visible when the project has sources but no commit', async () => {
    useProjectStore.setState({
      projects: [{ id: 'proj_test', name: 'Test Project', drafts: 1 } as never],
      initialized: true,
      loading: false,
    });

    renderProjectContent();

    expect(await screen.findByText('No commit on this branch')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'State overview' })).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-workspace')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('renders the fixture-backed Workspaces workbench from the query string', async () => {
    searchParamsValue = new URLSearchParams('tab=workspaces');

    renderProjectContent();

    expect(screen.getByRole('tab', { name: 'Workspaces' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('heading', { name: 'Workspaces' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'PRD audience handoff' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Workspace candidates' })).not.toBeInTheDocument();
    expect(screen.getByText('No source material yet.')).toBeInTheDocument();
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/t3x-dev/test-project/workspaces', {
        scroll: false,
      });
    });
  });

  it('renders the fixture-backed Schemas tab preview from the query string', () => {
    searchParamsValue = new URLSearchParams('tab=schemas');

    renderProjectContent();

    expect(screen.getByRole('tab', { name: 'Schemas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Schema templates' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Templates' })).toBeInTheDocument();
    expect(screen.getAllByText('PRD Schema v2').length).toBeGreaterThan(0);
  });

  it('does NOT redirect while canvas is still loading', () => {
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      loading: true,
      loadError: null,
      projectId: 'proj_test',
    });

    renderProjectContent();

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('keeps the committed State view when legacy canvas nodes exist', async () => {
    useCanvasStore.setState({
      nodes: [
        { id: 'n1', type: 'unit', position: { x: 0, y: 0 }, data: { kind: 'unit' } },
      ] as never,
      edges: [],
      loading: false,
      loadError: null,
      projectId: 'proj_test',
    });

    renderProjectContent();

    expect(await screen.findByText('No commit on this branch')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Points/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('canvas-workspace')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('ignores selected-node deep links while the intro demo opens committed State', async () => {
    searchParamsValue = new URLSearchParams('introDemo=1&selected=sha256%3Aabc123');
    useCanvasStore.setState({
      nodes: [
        { id: 'sha256:abc123', type: 'unit', position: { x: 0, y: 0 }, data: { kind: 'unit' } },
      ] as never,
      edges: [],
      loading: false,
      loadError: null,
      projectId: 'proj_test',
      openNodeId: null,
      modalViewMode: null,
    });

    renderProjectContent();

    expect(await screen.findByText('No commit on this branch')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'State overview' })).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-workspace')).not.toBeInTheDocument();
    expect(useCanvasStore.getState().openNodeId).toBeNull();
    expect(useCanvasStore.getState().modalViewMode).toBeNull();
  });

  it('does NOT redirect when load is for a different project (race guard)', () => {
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      loading: false,
      loadError: null,
      projectId: 'proj_other', // load completed for a different project
    });

    renderProjectContent();

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('confirms a direct empty project before showing not found', async () => {
    useProjectStore.setState({
      projects: [],
      initialized: true,
      loading: false,
    });
    useChatStore.setState({ activeProjectId: null, activeConversationId: null });

    renderProjectContent();

    expect(screen.getByText(/Loading project/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchProject).toHaveBeenCalledWith('proj_test');
      expect(screen.getByRole('region', { name: 'State overview' })).toBeInTheDocument();
    });
    expect(await screen.findByText('No commit on this branch')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-workspace')).not.toBeInTheDocument();
    expect(screen.queryByText(/Project not found/i)).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
