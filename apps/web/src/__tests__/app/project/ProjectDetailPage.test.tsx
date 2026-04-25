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
  it('redirects to /chat when canvas finishes loading with zero nodes', async () => {
    render(<ProjectDetailPage />);

    expect(screen.getByText(/Opening chat workspace/i)).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith('/chat');
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
