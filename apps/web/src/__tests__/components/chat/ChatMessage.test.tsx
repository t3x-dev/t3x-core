// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { useWorkspaceStore } from '@/store/workspaceStore';

vi.mock('sonner', () => ({
  toast: {
    message: vi.fn(),
  },
}));

vi.mock('@/hooks/shared/useSlotActions', () => ({
  useSlotActions: () => ({
    deleteSlot: vi.fn(),
  }),
}));

describe('ChatMessage source edit hint', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
  });

  it('shows the source edit hint before commit', () => {
    useWorkspaceStore.getState().setCommitted(false);

    render(<ChatMessage sender="assistant" content="Extracted answer" turnHash="sha256:t1" />);

    expect(screen.getByLabelText('Source text edit hint')).not.toBeNull();
  });

  it('hides the source edit hint after commit', () => {
    useWorkspaceStore.getState().setCommitted(true);

    render(<ChatMessage sender="assistant" content="Extracted answer" turnHash="sha256:t1" />);

    expect(screen.queryByLabelText('Source text edit hint')).toBeNull();
  });
});
