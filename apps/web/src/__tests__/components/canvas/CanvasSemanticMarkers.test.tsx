// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasNodeTypes } from '@/components/canvas/CanvasNodes';
import type { CanvasNodeData } from '@/types/nodes';

const navigationMocks = vi.hoisted(() => ({
  params: { projectId: 'proj_canvas' } as Record<string, string>,
  routerPush: vi.fn(),
  searchParams: new URLSearchParams(),
}));

const canvasUiMocks = vi.hoisted(() => ({ zoom: 1 }));

vi.mock('@xyflow/react', () => ({
  Handle: ({ type }: { type: string }) => <div data-testid={`handle-${type}`} />,
  NodeToolbar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="node-toolbar">{children}</div>
  ),
  Position: { Left: 'left', Right: 'right' },
  useStore: (selector: (state: { transform: [number, number, number] }) => unknown) =>
    selector({ transform: [0, 0, canvasUiMocks.zoom] }),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      animate: _animate,
      exit: _exit,
      initial: _initial,
      transition: _transition,
      variants: _variants,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props} />,
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => navigationMocks.params,
  useRouter: () => ({ push: navigationMocks.routerPush }),
  useSearchParams: () => navigationMocks.searchParams,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/canvas/SealAnimation', () => ({
  SealAnimation: () => null,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/canvas/useCanvasCommitActions', () => ({
  useCanvasCommitActions: () => ({
    addConversationFromCommit: vi.fn(),
    renameCommit: vi.fn(),
    startMerge: vi.fn(),
  }),
}));

vi.mock('@/hooks/canvas/useCanvasLeafActions', () => ({
  useCanvasLeafActions: () => ({ remove: vi.fn() }),
}));

vi.mock('@/hooks/canvas/useCanvasNodeActions', () => ({
  useCanvasNodeActions: () => ({ load: vi.fn() }),
}));

vi.mock('@/hooks/conversations/useConversationContext', () => ({
  useConversationContext: () => ({ contextConfig: null }),
}));

vi.mock('@/hooks/shared/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('@/hooks/shared/useTerminology', () => ({
  useTerminology: () => ({
    t: (key: string) =>
      ({
        branch: 'branch',
        commit: 'commit',
        committed: 'committed',
        draft: 'draft',
        merge: 'merge',
        resolved: 'resolved',
      })[key] ?? key,
  }),
}));

const openLeafPanelMock = vi.hoisted(() => vi.fn());
const openNodeModalMock = vi.hoisted(() => vi.fn());

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      getCommitTone: () => 'main-latest',
      hasMainCommit: false,
      openLeafPanel: openLeafPanelMock,
      openNodeModal: openNodeModalMock,
      projectId: 'proj_store',
      updateNode: vi.fn(),
    }),
}));

vi.mock('@/store/pinsStore', () => ({
  usePinsStore: () => ({ isPinned: () => false }),
}));

vi.mock('@/store/projectStore', () => ({
  useProjectStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      getProject: (projectId: string) => ({ id: projectId, name: 'Canvas Project' }),
      notifyCallback: vi.fn(),
    }),
}));

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

function makeNodeData(overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
  return {
    branchName: 'main',
    branchType: 'main',
    commit: {
      author: { type: 'human', name: 'Tester' },
      branch: 'main',
      committed_at: '2026-05-19T00:00:00Z',
      content: { trees: [{ key: 'goal', slots: {}, children: [] }], relations: [] },
      hash: 'sha256:abc123',
      message: 'Canvas marker fixture',
      schema: 't3x/commit/v2',
      sources: null,
    },
    commitHash: 'sha256:abc123',
    commitStatus: 'committed',
    conversationId: 'conv_canvas',
    kind: 'unit',
    leaves: [
      {
        id: 'leaf_canvas',
        title: 'Launch brief',
        type: 'article',
      },
    ],
    sources: [
      {
        id: 'conv_canvas',
        label: 'conv',
        title: 'Source conversation',
        type: 'conversation',
      },
    ],
    title: 'Semantic canvas node',
    ...overrides,
  } as CanvasNodeData;
}

function renderUnitNode(data: CanvasNodeData) {
  const UnitNode = canvasNodeTypes.unit;
  return render(
    <UnitNode
      data={data}
      dragging={false}
      id="unit_canvas"
      isConnectable={true}
      selected={false}
      type="unit"
      zIndex={0}
    />
  );
}

function renderSelectedUnitNode(data: CanvasNodeData) {
  const UnitNode = canvasNodeTypes.unit;
  return render(
    <UnitNode
      data={data}
      dragging={false}
      id="unit_canvas"
      isConnectable={true}
      selected={true}
      type="unit"
      zIndex={0}
    />
  );
}

describe('Canvas node semantic markers', () => {
  beforeEach(() => {
    openLeafPanelMock.mockClear();
    navigationMocks.params = { projectId: 'proj_canvas' };
    navigationMocks.routerPush.mockClear();
    navigationMocks.searchParams = new URLSearchParams();
    canvasUiMocks.zoom = 1;
  });

  it('renders a ringed short commit id in overview mode', () => {
    canvasUiMocks.zoom = 0.2;
    const data = makeNodeData();
    data.commit = { ...data.commit!, hash: 'sha256:7d92785f' };
    data.commitHash = 'sha256:7d92785f';

    renderUnitNode(data);

    const node = screen.getByRole('treeitem', { name: /Semantic canvas node \(minified\)/i });
    expect(node).toHaveStyle({ height: '50px', width: '50px' });
    expect(node.style.boxShadow).toContain('0 0 0 4px');
    expect(within(node).getByText('7d92785')).toBeInTheDocument();
  });

  it('uses the full card branch color for the overview dot and ring', () => {
    canvasUiMocks.zoom = 0.2;
    const data = makeNodeData({ branchName: 'dev', branchType: 'branch' });
    data.commit = { ...data.commit!, branch: 'dev' };

    renderUnitNode(data);

    const node = screen.getByRole('treeitem', { name: /Semantic canvas node \(minified\)/i });
    expect(node).toHaveStyle({ backgroundColor: '#ec4899' });
    expect(node.style.boxShadow).toContain('#ec4899');
  });

  it('labels committed, source, and leaf regions without relying on color alone', () => {
    renderUnitNode(makeNodeData());

    const node = screen.getByRole('treeitem', { name: /Semantic canvas node/i });

    expect(node).toHaveAttribute('data-node-semantic-kind', 'committed');
    expect(within(node).getByTestId('node-kind-committed')).toHaveAttribute(
      'data-kind-shape',
      'solid-circle'
    );
    expect(within(node).getByTestId('node-kind-source')).toHaveAttribute(
      'data-kind-shape',
      'dotted-square'
    );
    expect(within(node).getByTestId('node-kind-leaf')).toHaveAttribute(
      'data-kind-shape',
      'diamond'
    );
  });

  it('labels pending conversation nodes with a dashed-square marker', () => {
    renderUnitNode(
      makeNodeData({
        commit: undefined,
        commitHash: undefined,
        commitStatus: 'staging',
        title: 'Pending canvas node',
      })
    );

    const node = screen.getByRole('treeitem', { name: /Pending canvas node/i });

    expect(node).toHaveAttribute('data-node-semantic-kind', 'pending');
    expect(within(node).getByTestId('node-kind-pending')).toHaveAttribute(
      'data-kind-shape',
      'dashed-square'
    );
  });

  it('renders one yellow branch summary with every pending conversation name', () => {
    renderUnitNode(
      makeNodeData({
        commit: undefined,
        commitHash: undefined,
        commitStatus: undefined,
        conversationId: undefined,
        pendingBranch: 'main',
        pendingConversationGroup: {
          branch: 'main',
          conversations: [
            {
              branch: 'main',
              conversationId: 'conv_a',
              createdAt: '2026-05-29T00:00:00Z',
              title: 'First change',
              turnsCount: 2,
            },
            {
              branch: 'main',
              conversationId: 'conv_b',
              createdAt: '2026-05-29T00:01:00Z',
              title: 'Second change',
              turnsCount: 4,
            },
          ],
        },
        title: '2 pending',
      })
    );

    const node = screen.getByRole('treeitem', { name: /2 pending conversations on main/i });
    expect(node).toHaveAttribute('data-node-type', 'pending-group');
    expect(node).toHaveAttribute('data-branch-color', 'pending');
    expect(within(node).getByRole('link', { name: /First change/i })).toHaveAttribute(
      'href',
      expect.stringContaining('sourceConversation=conv_a')
    );
    expect(within(node).getByRole('link', { name: /Second change/i })).toBeInTheDocument();
    expect(within(node).getByTitle('Highlight main branch')).toHaveAttribute(
      'data-branch-highlight',
      'main'
    );
  });

  it('applies a stable branch color while retaining a textual branch identity', () => {
    const data = makeNodeData({
      branchName: 'dev',
      branchType: 'branch',
    });
    data.commit = { ...data.commit!, branch: 'dev' };
    renderSelectedUnitNode(data);

    const node = screen.getByRole('treeitem', { name: /Semantic canvas node/i });
    expect(node).toHaveAttribute('data-branch-color', 'dev');
    expect(node.style.getPropertyValue('--branch-accent')).toBe('#ec4899');
    expect(node.className).toContain('border-[var(--stroke-default)]');
    expect(node.className).toContain('ring-[var(--accent-commit)]/30');
    expect(node.className).not.toContain('border-l-');
    expect(within(node).getByTitle('Highlight dev branch')).toHaveAttribute(
      'data-branch-highlight',
      'dev'
    );
  });

  it('does not duplicate committed node actions inside every card', () => {
    renderUnitNode(makeNodeData({ leaves: [] }));

    const node = screen.getByRole('treeitem', { name: /Semantic canvas node/i });
    expect(within(node).queryByText(/Create Output/i)).not.toBeInTheDocument();
  });

  it('does not allow renaming a committed node title on the canvas', () => {
    renderUnitNode(makeNodeData());

    expect(screen.queryByTitle('Rename commit')).not.toBeInTheDocument();
  });

  it('renders the committed hash without an old commit-detail action', () => {
    renderUnitNode(makeNodeData());

    expect(screen.getByText('hash:abc123')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open commit hash:abc123' })
    ).not.toBeInTheDocument();
    expect(openNodeModalMock).not.toHaveBeenCalled();
    expect(navigationMocks.routerPush).not.toHaveBeenCalled();
  });

  it('does not restore the old commit-detail action during the intro demo', () => {
    navigationMocks.searchParams = new URLSearchParams({ introDemo: '1' });
    renderUnitNode(makeNodeData());

    expect(
      screen.queryByRole('button', { name: 'Open commit hash:abc123' })
    ).not.toBeInTheDocument();
    expect(openNodeModalMock).not.toHaveBeenCalled();
    expect(navigationMocks.routerPush).not.toHaveBeenCalled();
  });

  it('keeps expanded legacy output readable without create or delete controls', () => {
    renderUnitNode(makeNodeData());

    expect(screen.queryByRole('link', { name: /Launch brief/i })).not.toBeInTheDocument();
    expect(screen.getByText('Launch brief')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Expand leaf list/i }));

    expect(screen.queryByRole('button', { name: /New Leaf|Remove leaf/i })).not.toBeInTheDocument();
    expect(openLeafPanelMock).not.toHaveBeenCalled();
  });

  it('keeps archived Leaf names informational on canonical repository routes', () => {
    navigationMocks.params = {};
    renderUnitNode(makeNodeData());

    expect(screen.getByText('Launch brief')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Launch brief/i })).not.toBeInTheDocument();
  });

  it('omits redundant tree stats and empty leaf placeholders from committed cards', () => {
    renderUnitNode(makeNodeData({ leaves: [] }));

    expect(screen.queryByText('initial goal tree')).not.toBeInTheDocument();
    expect(screen.queryByText('1 node')).not.toBeInTheDocument();
    expect(screen.queryByText('No leaf yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New Leaf/i })).not.toBeInTheDocument();
  });
});
