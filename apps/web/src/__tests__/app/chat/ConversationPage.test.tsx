// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let searchParamsValue: URLSearchParams = new URLSearchParams();
let storeProjectId: string | null = null;

vi.mock('next/navigation', () => ({
  useParams: () => ({ conversationId: 'conv_123' }),
  useSearchParams: () => searchParamsValue,
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
    selector({ activeProjectId: storeProjectId }),
}));

vi.mock('@/store/workspaceStore', () => ({
  useWorkspaceStore: (selector: (state: { panelExpanded: boolean }) => unknown) =>
    selector({ panelExpanded: false }),
}));

import ConversationPage from '@/app/chat/[conversationId]/page';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';

afterEach(() => {
  vi.clearAllMocks();
  searchParamsValue = new URLSearchParams();
  storeProjectId = null;
});

describe('ConversationPage', () => {
  it('passes initial provider and model from the query string into ChatWorkspace', () => {
    searchParamsValue = new URLSearchParams({
      firstMessage: 'hello',
      provider: 'openai',
      model: 'gpt-4.1',
    });
    storeProjectId = 'proj_123';

    render(<ConversationPage />);

    expect(vi.mocked(ChatWorkspace)).toHaveBeenCalled();
    const props = vi.mocked(ChatWorkspace).mock.calls[0][0];
    expect(props).toEqual(
      expect.objectContaining({
        conversationId: 'conv_123',
        firstMessage: 'hello',
        initialProvider: 'openai',
        initialModel: 'gpt-4.1',
        projectId: 'proj_123',
      })
    );
  });

  it('prefers the projectId query param over the in-memory chat store', () => {
    // Direct load of /chat/new?projectId=proj_url with a stale store value:
    // the URL is the source of truth for project context here, because the
    // empty-project redirect from /project/[id] writes only the URL on
    // cold-start cases.
    searchParamsValue = new URLSearchParams({ projectId: 'proj_url' });
    storeProjectId = 'proj_stale';

    render(<ConversationPage />);

    const props = vi.mocked(ChatWorkspace).mock.calls[0][0];
    expect(props.projectId).toBe('proj_url');
  });

  it('falls back to the chat store activeProjectId when no query param is present', () => {
    searchParamsValue = new URLSearchParams();
    storeProjectId = 'proj_store';

    render(<ConversationPage />);

    const props = vi.mocked(ChatWorkspace).mock.calls[0][0];
    expect(props.projectId).toBe('proj_store');
  });
});
