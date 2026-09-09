// @vitest-environment jsdom
/**
 * Canary test for useCanvasDeletionWiring.
 *
 * Validates that the hook wires persisted deletion for pending
 * conversations, then refreshes the current canvas.
 */
import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

vi.mock('@/commands/conversations', () => ({
  deleteConversation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/queries/conversations', () => ({
  fetchConversations: vi.fn().mockResolvedValue({ conversations: [], total: 0 }),
}));

const nodeActionMocks = vi.hoisted(() => ({
  load: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/canvas/useCanvasNodeActions', () => ({
  useCanvasNodeActions: () => ({ load: nodeActionMocks.load }),
}));

import { deleteConversation } from '@/commands/conversations';
import { useCanvasDeletionWiring } from '@/hooks/canvas/useCanvasDeletionWiring';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData } from '@/types/nodes';

function unit(id: string, conversationId: string): Node<CanvasNodeData> {
  return {
    id,
    type: 'unit',
    position: { x: 0, y: 0 },
    data: {
      kind: 'unit',
      entryId: id,
      title: 'Unit',
      summary: '',
      status: 'staging',
      timestamp: 'now',
      tags: [],
      commitStatus: 'staging',
      conversationId,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    projectId: 'proj_test',
    deletionConfirmation: null,
    deleteConversationCallback: null,
  });
});

afterEach(() => {
  cleanupRoots();
});

describe('useCanvasDeletionWiring', () => {
  it('does not register Canvas deletion I/O on repository surfaces', async () => {
    renderHook(() => useCanvasDeletionWiring(false));
    await waitForHook();

    expect(useCanvasStore.getState().deleteConversationCallback).toBeNull();
  });

  it('deletes a conversation and reloads the current canvas', async () => {
    useCanvasStore.setState({ nodes: [unit('n1', 'conv_1')] });

    renderHook(() => useCanvasDeletionWiring());
    await waitForHook();

    const cb = useCanvasStore.getState().deleteConversationCallback;
    expect(cb).toBeTypeOf('function');

    cb?.('conv_xyz');
    await vi.waitFor(() => {
      expect(deleteConversation).toHaveBeenCalledWith('conv_xyz');
      expect(nodeActionMocks.load).toHaveBeenCalledWith('proj_test');
    });
  });
});
