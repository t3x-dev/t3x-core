// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useParams: () => ({ conversationId: 'conv_123' }),
  useSearchParams: () =>
    new URLSearchParams({
      firstMessage: 'hello',
      provider: 'openai',
      model: 'gpt-4.1',
    }),
}));

vi.mock('@/components/chat/ChatWorkspace', () => ({
  ChatWorkspace: vi.fn(() => null),
}));

vi.mock('@/components/chat/YOpsWorkspace', () => ({
  YOpsWorkspace: vi.fn(() => null),
}));

vi.mock('@/hooks/conversations/useInheritFromCommit', () => ({
  useInheritFromCommit: () => ({
    inheritFromCommitHash: null,
    clearInherit: vi.fn(),
  }),
}));

vi.mock('@/store/chatStore', () => ({
  useChatStore: (selector: (state: { activeProjectId: string | null }) => unknown) =>
    selector({ activeProjectId: 'proj_123' }),
}));

vi.mock('@/store/workspaceStore', () => ({
  useWorkspaceStore: (selector: (state: { panelExpanded: boolean }) => unknown) =>
    selector({ panelExpanded: false }),
}));

import ConversationPage from '@/app/chat/[conversationId]/page';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';

afterEach(() => {
  vi.clearAllMocks();
});

describe('ConversationPage', () => {
  it('passes initial provider and model from the query string into ChatWorkspace', () => {
    render(<ConversationPage />);

    expect(vi.mocked(ChatWorkspace)).toHaveBeenCalled();
    const props = vi.mocked(ChatWorkspace).mock.calls[0][0];
    expect(props).toEqual(
      expect.objectContaining({
        conversationId: 'conv_123',
        firstMessage: 'hello',
        initialProvider: 'openai',
        initialModel: 'gpt-4.1',
      })
    );
  });
});
