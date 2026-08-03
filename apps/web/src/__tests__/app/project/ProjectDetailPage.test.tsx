// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMIT_CREATED_EVENT } from '@/hooks/commits/commitEvents';

const stateHookMocks = vi.hoisted(() => ({
  loadCommits: vi.fn(),
  loadOperations: vi.fn(),
  refreshBranches: vi.fn(),
  refreshWorkspaces: vi.fn(),
}));

const canvasSurfaceMocks = vi.hoisted(() => ({
  fetchPins: vi.fn(),
  loadCanvas: vi.fn(),
  wireDeletion: vi.fn(),
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
  CanvasWorkspace: ({
    embedded,
    focusedBranch,
    projectName,
  }: {
    embedded?: boolean;
    focusedBranch?: string;
    projectName: string;
  }) => (
    <div
      data-embedded={String(embedded)}
      data-focused-branch={focusedBranch}
      data-testid="canvas-workspace"
    >
      {projectName}
    </div>
  ),
}));

vi.mock('@/components/onboarding/ProjectDemoTourOverlay', () => ({
  ProjectDemoTourOverlay: ({ open }: { open: boolean }) => (
    <div data-open={String(open)} data-testid="project-demo-tour" />
  ),
}));

vi.mock('@/hooks/canvas/useCanvasDeletionWiring', () => ({
  useCanvasDeletionWiring: canvasSurfaceMocks.wireDeletion,
}));

vi.mock('@/hooks/canvas/useCanvasNodeActions', () => ({
  useCanvasNodeActions: () => ({ load: canvasSurfaceMocks.loadCanvas }),
}));

vi.mock('@/hooks/pins/usePinsCrud', () => ({
  usePinsCrud: () => ({ fetch: canvasSurfaceMocks.fetchPins }),
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
  schema: 't3x/commit/v2',
  sources: [],
  yops_log_ids: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  canvasSurfaceMocks.fetchPins.mockResolvedValue(undefined);
  canvasSurfaceMocks.loadCanvas.mockResolvedValue(undefined);
  stateHookMocks.loadCommits.mockResolvedValue([]);
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
    expect(screen.queryByText('/t3x-dev/test-project')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'State' })).toHaveAttribute('aria-current', 'page');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('follows project route changes without preserving a stale active view', () => {
    const view = render(
      <ProjectDetailPageContent initialTabOverride="schemas" projectIdOverride="proj_test" />
    );

    expect(screen.getByRole('link', { name: 'Schemas' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();

    view.rerender(
      <ProjectDetailPageContent initialTabOverride="workspaces" projectIdOverride="proj_test" />
    );

    expect(screen.getByRole('link', { name: 'Workspaces' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('heading', { name: 'T3X Workspace' })).toBeInTheDocument();
  });

  it('renders Canvas only on the independent Canvas surface', async () => {
    render(<ProjectDetailPageContent projectIdOverride="proj_test" surface="canvas" />);

    expect(screen.getByTestId('canvas-workspace')).toHaveTextContent('Test Project');
    expect(screen.getByTestId('project-demo-tour')).toHaveAttribute('data-open', 'false');
    expect(screen.queryByRole('region', { name: 'State overview' })).not.toBeInTheDocument();
    expect(canvasSurfaceMocks.wireDeletion).toHaveBeenLastCalledWith(true);
    await waitFor(() => {
      expect(canvasSurfaceMocks.loadCanvas).toHaveBeenCalledWith('proj_test');
      expect(canvasSurfaceMocks.fetchPins).toHaveBeenCalledWith('proj_test');
    });
  });

  it('refreshes Canvas when a same-window commit event targets this project', async () => {
    render(<ProjectDetailPageContent projectIdOverride="proj_test" surface="canvas" />);

    await waitFor(() => {
      expect(canvasSurfaceMocks.loadCanvas).toHaveBeenCalledWith('proj_test');
    });
    canvasSurfaceMocks.loadCanvas.mockClear();

    window.dispatchEvent(
      new CustomEvent(COMMIT_CREATED_EVENT, {
        detail: {
          type: 'commit.created',
          projectId: 'proj_test',
          branch: 'main',
          payload: { hash: 'sha256:new', branch: 'main' },
        },
      })
    );

    await waitFor(() => {
      expect(canvasSurfaceMocks.loadCanvas).toHaveBeenCalledWith('proj_test', { merge: true });
    });
  });

  it('does not start Canvas I/O on repository surfaces', async () => {
    renderProjectContent();

    expect(await screen.findByRole('heading', { name: 'State details' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Snapshot/ })).toHaveAttribute('aria-selected', 'true');
    expect(canvasSurfaceMocks.wireDeletion).toHaveBeenLastCalledWith(false);
    expect(canvasSurfaceMocks.loadCanvas).not.toHaveBeenCalled();
    expect(canvasSurfaceMocks.fetchPins).not.toHaveBeenCalled();
  });

  it('renders Canvas inside State and starts Canvas I/O from the canonical repository route', async () => {
    searchParamsValue = new URLSearchParams('view=canvas&branch=main');

    renderProjectContent();

    expect(screen.queryByRole('region', { name: 'State overview' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Canvas/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('canvas-workspace')).toHaveAttribute('data-embedded', 'true');
    expect(screen.getByTestId('canvas-workspace')).toHaveAttribute('data-focused-branch', 'main');
    expect(canvasSurfaceMocks.wireDeletion).toHaveBeenLastCalledWith(true);
    await waitFor(() => {
      expect(canvasSurfaceMocks.loadCanvas).toHaveBeenCalledWith('proj_test');
      expect(canvasSurfaceMocks.fetchPins).toHaveBeenCalledWith('proj_test');
    });
  });

  it('stops automatic Canvas reloads for an unverifiable CommitV2 ref but keeps manual retry', async () => {
    searchParamsValue = new URLSearchParams('view=canvas&branch=main');
    const intervalSpy = vi.spyOn(globalThis, 'setInterval');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      loading: false,
      loadError: Object.assign(new Error('Ref main points to an unverifiable commit'), {
        code: 'REF_HEAD_INTEGRITY_INVALID',
      }),
      projectId: 'proj_test',
    });

    renderProjectContent();

    expect(
      await screen.findByText(
        "This repository's branch head cannot be verified as CommitV2. For a pre-cut local database, use a fresh database or reset local development data."
      )
    ).toBeInTheDocument();
    await waitFor(() => expect(canvasSurfaceMocks.loadCanvas).toHaveBeenCalledWith('proj_test'));
    canvasSurfaceMocks.loadCanvas.mockClear();

    document.dispatchEvent(new Event('visibilitychange'));

    expect(canvasSurfaceMocks.loadCanvas).not.toHaveBeenCalled();
    expect(intervalSpy.mock.calls.some(([, delay]) => delay === 30_000)).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(canvasSurfaceMocks.loadCanvas).toHaveBeenCalledWith('proj_test');
    intervalSpy.mockRestore();
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

    expect((await screen.findAllByText('Validated at HEAD')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'State' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('heading', { name: 'Committed PRD state' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'State overview' })).not.toBeInTheDocument();
    expect(screen.queryByText('output-ready')).not.toBeInTheDocument();
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

    expect(screen.getByRole('link', { name: 'State' })).toHaveAttribute('aria-current', 'page');
    expect((await screen.findAllByText('Validation pending')).length).toBeGreaterThan(0);
    expect(await screen.findAllByText('missing')).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'State overview' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run validation' }));

    await waitFor(() => {
      expect(runYSchemaValidation).toHaveBeenCalledWith('proj_test', {
        commit_hash: STATE_COMMIT.hash,
        schema_name: 't3x/prd',
      });
      expect(screen.getAllByText('Validated at HEAD').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('output-ready')).not.toBeInTheDocument();
  });

  it('shows an empty committed State with route links to other project views', async () => {
    // Reset chat store to simulate a cold direct-load: no in-memory project.
    useChatStore.setState({ activeProjectId: null, activeConversationId: null });

    renderProjectContent();

    expect(screen.getByRole('link', { name: 'Back to t3x-dev' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { name: 'Test Project' })).toBeInTheDocument();
    expect(screen.getByText('t3x-dev')).toBeInTheDocument();
    expect(screen.queryByText('/t3x-dev/test-project')).not.toBeInTheDocument();
    expect(screen.queryByText('repo')).not.toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getAllByText('Validation pending').length).toBeGreaterThan(0);
    const projectNavigation = screen.getByRole('navigation', { name: 'Project views' });
    expect(projectNavigation.parentElement).toHaveClass('h-dvh', 'overflow-hidden');
    expect(screen.getByRole('link', { name: 'State' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('No commit on this branch')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Structure/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('canvas-workspace')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();

    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Workspaces' })).toHaveAttribute(
      'href',
      '/t3x-dev/test-project/workspaces'
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
    expect(screen.getByRole('heading', { name: 'State details' })).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-workspace')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('renders the clean main Workspaces workbench from the query string', async () => {
    searchParamsValue = new URLSearchParams('tab=workspaces');

    renderProjectContent();

    expect(screen.getByRole('link', { name: 'Workspaces' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('heading', { name: 'T3X Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Main workspace' })).toBeInTheDocument();
    expect(screen.queryByText('PRD audience handoff')).not.toBeInTheDocument();
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

    expect(screen.getByRole('link', { name: 'Schemas' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Schema versions' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Selected schema version' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /v2 Current/i })).toBeChecked();
  });

  it('keeps repository State visible while Canvas is loading', async () => {
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      loading: true,
      loadError: null,
      projectId: 'proj_test',
    });

    renderProjectContent();

    expect(await screen.findByRole('heading', { name: 'State details' })).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-workspace')).not.toBeInTheDocument();
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
    expect(screen.getByRole('tab', { name: /Structure/ })).toHaveAttribute('aria-selected', 'true');
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
    expect(screen.getByRole('heading', { name: 'State details' })).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-workspace')).not.toBeInTheDocument();
    expect(useCanvasStore.getState().openNodeId).toBeNull();
    expect(useCanvasStore.getState().modalViewMode).toBeNull();
  });

  it('waits for matching project data before rendering Canvas', () => {
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      loading: false,
      loadError: null,
      projectId: 'proj_other', // load completed for a different project
    });

    render(<ProjectDetailPageContent projectIdOverride="proj_test" surface="canvas" />);

    expect(screen.getByText('Loading project data...')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-workspace')).not.toBeInTheDocument();
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
      expect(screen.getByRole('heading', { name: 'State details' })).toBeInTheDocument();
    });
    expect(await screen.findByText('No commit on this branch')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-workspace')).not.toBeInTheDocument();
    expect(screen.queryByText(/Project not found/i)).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
