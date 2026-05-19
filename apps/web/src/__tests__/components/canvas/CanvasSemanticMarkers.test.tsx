// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { canvasNodeTypes } from '@/components/canvas/CanvasNodes';
import type { CanvasNodeData } from '@/types/nodes';

vi.mock('@xyflow/react', () => ({
  Handle: ({ type }: { type: string }) => <div data-testid={`handle-${type}`} />,
  NodeToolbar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="node-toolbar">{children}</div>
  ),
  Position: { Left: 'left', Right: 'right' },
  useStore: (selector: (state: { transform: [number, number, number] }) => unknown) =>
    selector({ transform: [0, 0, 1] }),
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
  useParams: () => ({ projectId: 'proj_canvas' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/canvas/AutoDraftBadge', () => ({
  AutoDraftBadge: () => <span data-testid="auto-draft-badge" />,
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

vi.mock('@/hooks/shared/useContextMenu', () => ({
  leafContextMenuHandlerRef: { current: null },
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

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      getCommitTone: () => 'main-latest',
      hasMainCommit: false,
      openLeafPanel: vi.fn(),
      openNodeModal: vi.fn(),
      updateNode: vi.fn(),
    }),
}));

vi.mock('@/store/pinsStore', () => ({
  usePinsStore: () => ({ isPinned: () => false }),
}));

vi.mock('@/store/projectStore', () => ({
  useProjectStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ notifyCallback: vi.fn() }),
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
      schema: 't3x/commit',
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

describe('Canvas node semantic markers', () => {
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
});
