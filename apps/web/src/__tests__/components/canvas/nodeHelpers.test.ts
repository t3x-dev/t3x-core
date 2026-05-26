import { GitCommit, MessageSquarePlus, PenSquare, Plus } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { getNextStep } from '@/components/canvas/node-parts/nodeHelpers';

describe('getNextStep', () => {
  it('routes staging nodes with a conversation to the chat workspace before commit', () => {
    const navigateToConversation = vi.fn();
    const openNodeModal = vi.fn();

    const nextStep = getNextStep({
      isDraft: false,
      isStaging: true,
      isCommitted: false,
      conversationId: 'conv_123',
      nodeId: 'node_1',
      t: () => 'Create Commit',
      icons: { PenSquare, MessageSquarePlus, GitCommit, Plus },
      actions: {
        navigateToDraft: vi.fn(),
        navigateToConversation,
        openNodeModal,
        openLeafPanel: vi.fn(),
      },
    });

    nextStep?.action();

    expect(navigateToConversation).toHaveBeenCalledWith('conv_123');
    expect(openNodeModal).not.toHaveBeenCalled();
  });
});
