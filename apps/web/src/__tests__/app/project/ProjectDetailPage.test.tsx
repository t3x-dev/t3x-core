// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();
const pushMock = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useParams: () => ({ projectId: 'proj_test' }),
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

import ProjectDetailPage from '@/app/project/[projectId]/page';
import { fetchProject } from '@/queries/project';
import { useCanvasStore } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { useProjectStore } from '@/store/projectStore';

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsValue = new URLSearchParams();
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

describe('ProjectDetailPage — empty canvas states', () => {
  it('shows a no-conversations state and opens a project-aware chat URL', () => {
    // Reset chat store to simulate a cold direct-load: no in-memory project.
    useChatStore.setState({ activeProjectId: null, activeConversationId: null });

    render(<ProjectDetailPage />);

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    expect(
      screen.getByText('Start a chat in this project, then commit it to see the canvas.')
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Go to Chat/i }));

    // URL preserves project context so a refresh on the chat page still knows
    // which project to write into.
    expect(pushMock).toHaveBeenCalledWith('/chat/new?projectId=proj_test');
    // Store is also primed synchronously so the next mount of ChatWorkspace
    // reads the right project even if the URL handling is lazy.
    expect(useChatStore.getState().activeProjectId).toBe('proj_test');
    expect(screen.queryByTestId('canvas-workspace')).toBeNull();
  });

  it('shows a no-commits state when the project has conversations but no canvas nodes', () => {
    useProjectStore.setState({
      projects: [{ id: 'proj_test', name: 'Test Project', drafts: 1 } as never],
      initialized: true,
      loading: false,
    });

    render(<ProjectDetailPage />);

    expect(screen.getByText('No commits yet')).toBeInTheDocument();
    expect(
      screen.getByText('Commit a project chat to make it appear on Canvas.')
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('does NOT redirect while canvas is still loading', () => {
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      loading: true,
      loadError: null,
      projectId: 'proj_test',
    });

    render(<ProjectDetailPage />);

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('renders the canvas workspace when the project has nodes', () => {
    useCanvasStore.setState({
      nodes: [
        { id: 'n1', type: 'unit', position: { x: 0, y: 0 }, data: { kind: 'unit' } },
      ] as never,
      edges: [],
      loading: false,
      loadError: null,
      projectId: 'proj_test',
    });

    render(<ProjectDetailPage />);

    expect(screen.getByTestId('canvas-workspace')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('ignores selected-node deep links while the intro demo canvas tour is active', async () => {
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

    render(<ProjectDetailPage />);
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

    render(<ProjectDetailPage />);

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('confirms a direct empty project before showing not found', async () => {
    useProjectStore.setState({
      projects: [],
      initialized: true,
      loading: false,
    });
    useChatStore.setState({ activeProjectId: null, activeConversationId: null });

    render(<ProjectDetailPage />);

    expect(screen.getByText(/Loading project/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchProject).toHaveBeenCalledWith('proj_test');
      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Project not found/i)).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Go to Chat/i }));

    expect(pushMock).toHaveBeenCalledWith('/chat/new?projectId=proj_test');
    expect(useChatStore.getState().activeProjectId).toBe('proj_test');
  });
});
