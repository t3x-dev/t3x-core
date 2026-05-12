// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let searchParamsValue: URLSearchParams = new URLSearchParams();
let storeProjectId: string | null = null;
let compactViewport = false;
const workspaceMock = vi.hoisted(() => ({
  expanded: false,
  setActiveProject: vi.fn(),
}));

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

vi.mock('@/hooks/shared/useChatCompactViewport', () => ({
  useChatCompactViewport: () => compactViewport,
}));

vi.mock('@/store/chatStore', () => ({
  useChatStore: (selector: (state: { activeProjectId: string | null }) => unknown) =>
    selector({ activeProjectId: storeProjectId }),
}));

vi.mock('@/store/workspaceStore', () => {
  type WorkspaceMockState = {
    setActiveProject: (id: string | null) => void;
  };
  const state: WorkspaceMockState = {
    setActiveProject: workspaceMock.setActiveProject,
  };
  return {
    selectPanelExpanded: () => workspaceMock.expanded,
    useWorkspaceStore: (selector: (s: WorkspaceMockState) => unknown) => selector(state),
  };
});

import ConversationPage from '@/app/chat/[conversationId]/page';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { YOpsWorkspace } from '@/components/chat/YOpsWorkspace';

afterEach(() => {
  vi.clearAllMocks();
  searchParamsValue = new URLSearchParams();
  storeProjectId = null;
  compactViewport = false;
  workspaceMock.expanded = false;
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

  it('passes the inheritFrom query param into ChatWorkspace', () => {
    searchParamsValue = new URLSearchParams({
      projectId: 'proj_url',
      inheritFrom: 'sha256:parent_commit',
    });

    render(<ConversationPage />);

    const props = vi.mocked(ChatWorkspace).mock.calls[0][0];
    expect(props.inheritFromCommitHash).toBe('sha256:parent_commit');
  });

  it('falls back to the chat store activeProjectId when no query param is present', () => {
    searchParamsValue = new URLSearchParams();
    storeProjectId = 'proj_store';

    render(<ConversationPage />);

    const props = vi.mocked(ChatWorkspace).mock.calls[0][0];
    expect(props.projectId).toBe('proj_store');
  });

  it('clamps the expanded workspace width against the actual chat container on first layout', async () => {
    workspaceMock.expanded = true;
    searchParamsValue = new URLSearchParams({ projectId: 'proj_url' });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      right: 1072,
      top: 0,
      bottom: 720,
      width: 1072,
      height: 720,
      toJSON: () => ({}),
    });

    render(<ConversationPage />);

    await waitFor(() => {
      expect(vi.mocked(YOpsWorkspace).mock.calls.at(-1)?.[0].customWidth).toBe(708);
    });

    rectSpy.mockRestore();
  });

  it('hides the workspace rail on compact viewports so chat keeps usable width', () => {
    compactViewport = true;
    workspaceMock.expanded = true;

    render(<ConversationPage />);

    expect(vi.mocked(YOpsWorkspace)).not.toHaveBeenCalled();
  });
});
