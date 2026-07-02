// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeEach(() => {
  vi.clearAllMocks();
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
    useProjectStore.setState({
      projects: [{ id: 'proj_test', name: 'Test Project', commitsCount: 1 } as never],
      initialized: true,
      loading: false,
    });
    useChatStore.setState({ activeProjectId: null, activeConversationId: null });

    render(<ProjectDetailPageContent projectIdOverride="proj_test" />);

    expect(screen.getByRole('heading', { name: 'Test Project' })).toBeInTheDocument();
    expect(screen.getAllByText('/t3x-dev/test-project').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Repository overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use repository' })).toBeDisabled();
    expect(screen.getByText('Not checked')).toBeInTheDocument();
    expect(
      screen.getByText('Run YSchema validation before using this repository.')
    ).toBeInTheDocument();
    expect(screen.getByText('0 outputs')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('renders a verified YSchema badge from the latest validation run', async () => {
    vi.mocked(fetchLatestYSchemaValidation).mockResolvedValueOnce({
      commit_hash: 'sha256:abcdef1234567890',
      created_at: '2026-07-02T00:00:00.000Z',
      error_count: 0,
      finished_at: '2026-07-02T00:00:01.000Z',
      fix_count: 0,
      gap_count: 0,
      id: 'ysvr_test',
      project_id: 'proj_test',
      ready: true,
      result: {},
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
    expect(screen.getByText('Verified abcdef12')).toBeInTheDocument();
    expect(screen.getByText('Validated')).toBeInTheDocument();
  });

  it('shows failed YSchema gaps and can rerun validation from the repository overview', async () => {
    vi.mocked(fetchLatestYSchemaValidation).mockResolvedValueOnce({
      commit_hash: 'sha256:5fbfafd8fa2fec3e',
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

    await waitFor(() => {
      expect(screen.getAllByText('YSchema failed · 2 gaps').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Schema')).toBeInTheDocument();
    expect(screen.getByText('t3x/prd')).toBeInTheDocument();
    expect(screen.getByText('Blocked until YSchema passes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View gaps' }));

    expect(screen.getAllByText('Missing required node')).toHaveLength(2);
    expect(screen.getByText('summary is required before commit.')).toBeInTheDocument();
    expect(screen.getByText('requirements is required before commit.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run validation' }));

    await waitFor(() => {
      expect(runYSchemaValidation).toHaveBeenCalledWith('proj_test');
      expect(screen.getAllByText('YSchema verified').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Validated')).toBeInTheDocument();
  });

  it('shows a project-first empty State tab and can switch to the Workspaces preview', async () => {
    searchParamsValue = new URLSearchParams('tab=state');
    // Reset chat store to simulate a cold direct-load: no in-memory project.
    useChatStore.setState({ activeProjectId: null, activeConversationId: null });

    renderProjectContent();

    expect(screen.getByRole('link', { name: 'Back to t3x-dev' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { name: 'Test Project' })).toBeInTheDocument();
    expect(screen.getByText('t3x-dev')).toBeInTheDocument();
    expect(screen.getByText('/t3x-dev/test-project')).toBeInTheDocument();
    expect(screen.getByText('repo')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('YSchema pending')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'State' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('No committed state yet')).toBeInTheDocument();
    expect(
      screen.getByText('Create a workspace from sources, then commit it to populate State.')
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/t3x-dev/test-project/state', { scroll: false });
    });
    replaceMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /Create Workspace/i }));

    expect(pushMock).toHaveBeenCalledWith('/t3x-dev/test-project/workspaces', { scroll: false });
    expect(screen.queryByTestId('canvas-workspace')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Workspaces' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('keeps chat available as a secondary source action without making it required', () => {
    searchParamsValue = new URLSearchParams('tab=state');
    useChatStore.setState({ activeProjectId: null, activeConversationId: null });

    renderProjectContent();

    fireEvent.click(screen.getByRole('button', { name: /Add Chat Source/i }));

    expect(pushMock).toHaveBeenCalledWith('/chat/new?projectId=proj_test');
    expect(useChatStore.getState().activeProjectId).toBe('proj_test');
  });

  it('shows a no-state state when the project has sources but no canvas nodes', () => {
    searchParamsValue = new URLSearchParams('tab=state');
    useProjectStore.setState({
      projects: [{ id: 'proj_test', name: 'Test Project', drafts: 1 } as never],
      initialized: true,
      loading: false,
    });

    renderProjectContent();

    expect(screen.getByText('No committed state yet')).toBeInTheDocument();
    expect(
      screen.getByText('Review existing sources in a workspace, then commit structured state.')
    ).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith('/t3x-dev/test-project/state', { scroll: false });
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
    expect(screen.getByRole('button', { name: /PRD audience handoff/ })).toBeInTheDocument();
    expect(screen.getAllByText('1 chat, 1 doc').length).toBeGreaterThan(0);
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
    expect(screen.getByText('Schema registry')).toBeInTheDocument();
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

  it('renders the canvas workspace when the project has nodes', () => {
    searchParamsValue = new URLSearchParams('tab=state');
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

    expect(screen.getByTestId('canvas-workspace')).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith('/t3x-dev/test-project/state', { scroll: false });
  });

  it('ignores selected-node deep links while the intro demo canvas tour is active', async () => {
    searchParamsValue = new URLSearchParams('tab=state&introDemo=1&selected=sha256%3Aabc123');
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
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('canvas-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('project-demo-tour')).toHaveAttribute('data-open', 'true');
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
    searchParamsValue = new URLSearchParams('tab=state');
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
      expect(screen.getByText('No committed state yet')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Project not found/i)).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith('/t3x-dev/test-project/state', { scroll: false });

    fireEvent.click(screen.getByRole('button', { name: /Add Chat Source/i }));

    expect(pushMock).toHaveBeenCalledWith('/chat/new?projectId=proj_test');
    expect(useChatStore.getState().activeProjectId).toBe('proj_test');
  });
});
