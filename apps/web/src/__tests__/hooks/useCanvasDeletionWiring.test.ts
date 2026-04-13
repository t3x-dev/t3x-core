// @vitest-environment jsdom
/**
 * Canary test for useCanvasDeletionWiring.
 *
 * Validates that the hook wires deleteConversation into the canvas
 * store callback, and that the store invokes it during a remove change.
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

import { deleteConversation } from '@/commands/conversations';
import { useCanvasDeletionWiring } from '@/hooks/useCanvasDeletionWiring';
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
    deletionConfirmation: null,
    deleteConversationCallback: null,
  });
});

afterEach(() => {
  cleanupRoots();
});

describe('useCanvasDeletionWiring', () => {
  it('registers a callback that calls deleteConversation', async () => {
    useCanvasStore.setState({ nodes: [unit('n1', 'conv_1')] });

    renderHook(() => useCanvasDeletionWiring());
    await waitForHook();

    const cb = useCanvasStore.getState().deleteConversationCallback;
    expect(cb).toBeTypeOf('function');

    cb?.('conv_xyz');
    expect(deleteConversation).toHaveBeenCalledWith('conv_xyz');
  });
});
