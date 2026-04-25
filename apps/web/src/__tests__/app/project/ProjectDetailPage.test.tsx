// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();
const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ projectId: 'proj_test' }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}));

vi.mock('@/components/canvas', () => ({
  CanvasWorkspace: ({ projectName }: { projectName: string }) => (
    <div data-testid="canvas-workspace">{projectName}</div>
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

import ProjectDetailPage from '@/app/project/[projectId]/page';
import { useCanvasStore } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { useProjectStore } from '@/store/projectStore';

beforeEach(() => {
  vi.clearAllMocks();
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
  });
});

describe('ProjectDetailPage — empty-project redirect', () => {
  it('redirects to a project-aware chat URL and primes activeProjectId', async () => {
    // Reset chat store to simulate a cold direct-load: no in-memory project.
    useChatStore.setState({ activeProjectId: null, activeConversationId: null });

    render(<ProjectDetailPage />);

    expect(screen.getByText(/Opening chat workspace/i)).toBeInTheDocument();
    // URL preserves project context so a refresh on the chat page still
    // knows which project to write into.
    expect(replaceMock).toHaveBeenCalledWith('/chat/new?projectId=proj_test');
    // Store is also primed synchronously so the next mount of ChatWorkspace
    // reads the right project even if the URL handling is lazy.
    expect(useChatStore.getState().activeProjectId).toBe('proj_test');
    expect(screen.queryByTestId('canvas-workspace')).toBeNull();
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
});
