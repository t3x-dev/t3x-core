// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { buildWorkspaceHandoffPath, NodeModal } from '@/components/canvas/NodeModal';
import type { CanvasNodeData } from '@/types/nodes';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (selector: (state: { projectId: string }) => unknown) =>
    selector({ projectId: 'proj_test' }),
}));

vi.mock('@/components/canvas/NodeModal/ConversationView', async () => {
  const React = await import('react');
  return {
    ConversationView: () => React.createElement('div', { 'data-testid': 'conversation-view' }),
  };
});

function committedNode(): Node<CanvasNodeData> {
  return {
    id: 'sha256:committed',
    position: { x: 0, y: 0 },
    type: 'unit',
    data: {
      commitStatus: 'committed',
      entryId: 'sha256:committed',
      kind: 'unit',
      status: 'committed',
      summary: 'Committed version',
      tags: [],
      timestamp: '2026-08-03T00:00:00Z',
      title: 'Committed version',
    },
  };
}

describe('NodeModal', () => {
  it('hands a staging conversation to the branch Workspace', () => {
    expect(
      buildWorkspaceHandoffPath('proj/one', {
        commitStatus: 'staging',
        entryId: 'unit_1',
        kind: 'unit',
        pendingBranch: 'branch',
        pendingBranchName: 'feature/next',
        sourceConversationId: 'conv/one',
        status: 'staging',
        summary: '',
        tags: [],
        timestamp: '2026-08-03T00:00:00Z',
        title: 'Next unit',
      })
    ).toBe(
      '/project/proj%2Fone?branch=feature%2Fnext&tab=workspaces&sourceConversation=conv%2Fone'
    );
  });

  it('renders nothing for a committed node in commit mode', () => {
    const { container } = render(
      <NodeModal node={committedNode()} onClose={vi.fn()} onUpdate={vi.fn()} viewMode="commit" />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('keeps a committed node source conversation available', () => {
    render(
      <NodeModal
        node={committedNode()}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
        viewMode="conversation"
      />
    );

    expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
  });
});
