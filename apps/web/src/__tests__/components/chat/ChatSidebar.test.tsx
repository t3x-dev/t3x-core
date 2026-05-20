// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const chatState = {
    sidebarCollapsed: false,
    sidebarResizing: false,
    sidebarWidth: 276,
    toggleSidebar: vi.fn(),
    setSidebarResizing: vi.fn(),
    setSidebarWidth: vi.fn(),
    activeConversationId: 'conv_a432e35d',
    activeProjectId: null as string | null,
    expandedProjectIds: new Set<string>(),
    toggleProjectExpanded: vi.fn(),
    setActiveConversation: vi.fn(),
    setConversationTitle: vi.fn(),
    refreshKey: 0,
    refreshSidebar: vi.fn(),
  };
  chatState.toggleProjectExpanded = vi.fn((projectId: string) => {
    chatState.expandedProjectIds.add(projectId);
  });
  chatState.setActiveConversation = vi.fn(
    (conversationId: string | null, projectId: string | null) => {
      chatState.activeConversationId = conversationId;
      chatState.activeProjectId = projectId;
    }
  );

  return {
    createProject: vi.fn(),
    conversationsByProject: {} as Record<
      string,
      Array<{ conversation_id: string; title: string }>
    >,
    loadConversations: vi.fn(),
    projects: [] as Array<{
      project_id: string;
      name: string;
      created_at: string;
      conversations_count?: number;
      commits_count?: number;
    }>,
    routerPush: vi.fn(),
    chatState,
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat/conv_a432e35d',
  useRouter: () => ({
    push: mocks.routerPush,
  }),
}));

vi.mock('@/store/chatStore', () => {
  return {
    CHAT_SIDEBAR_COLLAPSED_WIDTH: 64,
    useChatStore: Object.assign(
      (selector?: (mockState: typeof mocks.chatState) => unknown) =>
        selector ? selector(mocks.chatState) : mocks.chatState,
      {
        getState: () => mocks.chatState,
      }
    ),
  };
});

vi.mock('@/hooks/projects/useProjects', () => ({
  useProjects: () => ({
    projects: mocks.projects,
    refresh: vi.fn(),
    remove: vi.fn(),
    create: mocks.createProject,
    rename: vi.fn(),
  }),
}));

vi.mock('@/hooks/conversations/useProjectConversations', () => ({
  useProjectConversations: () => ({
    conversationsByProject: mocks.conversationsByProject,
    load: mocks.loadConversations,
    remove: vi.fn(),
    rename: vi.fn(),
  }),
}));

vi.mock('@/hooks/conversations/useNewProjectChat', () => ({
  useNewProjectChat: () => ({
    start: vi.fn(),
  }),
}));

vi.mock('@/components/layout/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu">User menu</div>,
}));

vi.mock('@/components/chat/sidebar/ContextMenu', () => ({
  ContextMenuPortal: () => null,
  useContextMenu: () => ({
    menu: null,
    open: vi.fn(),
    close: vi.fn(),
  }),
}));

import { ChatSidebar } from '@/components/chat/ChatSidebar';

afterEach(() => {
  vi.clearAllMocks();
  mocks.projects = [];
  mocks.conversationsByProject = {};
  mocks.chatState.activeConversationId = 'conv_a432e35d';
  mocks.chatState.activeProjectId = null;
  mocks.chatState.expandedProjectIds = new Set<string>();
});

describe('ChatSidebar', () => {
  it('opens a project name dialog and creates a named project', async () => {
    mocks.createProject.mockResolvedValue({
      project_id: 'proj_custom',
      name: 'Custom Project',
      created_at: '2026-05-08T00:00:00Z',
    });

    render(<ChatSidebar />);

    fireEvent.click(screen.getByRole('button', { name: /new project/i }));
    const input = screen.getByLabelText('Project name');
    fireEvent.change(input, { target: { value: 'Custom Project' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mocks.createProject).toHaveBeenCalledWith('Custom Project');
    });
    expect(mocks.routerPush).toHaveBeenCalledWith('/chat?projectId=proj_custom');
  });

  it('uses Untitled workspace when the project name dialog is submitted blank', async () => {
    mocks.createProject.mockResolvedValue({
      project_id: 'proj_untitled',
      name: 'Untitled workspace',
      created_at: '2026-05-08T00:00:00Z',
    });

    render(<ChatSidebar />);

    fireEvent.click(screen.getByRole('button', { name: /new project/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mocks.createProject).toHaveBeenCalledWith('Untitled workspace');
    });
    expect(mocks.routerPush).toHaveBeenCalledWith('/chat?projectId=proj_untitled');
  });

  it('delegates Settings entry to the UserMenu dropdown instead of a top-level link', () => {
    render(<ChatSidebar />);

    // Settings is reachable through the UserMenu dropdown (Profile / Settings /
    // Sign Out) — see UserMenu.tsx. The sidebar should no longer render a
    // standalone /settings link at the bottom.
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });

  it('navigates to the latest conversation when a project row is clicked', async () => {
    mocks.projects = [
      {
        project_id: 'proj_smoke',
        name: 'Smoke English Extraction',
        created_at: '2026-05-08T00:00:00Z',
        conversations_count: 1,
        commits_count: 3,
      },
    ];
    mocks.loadConversations.mockResolvedValue([
      { conversation_id: 'conv_latest', title: 'Untitled Unit' },
    ]);

    render(<ChatSidebar />);

    fireEvent.click(screen.getByRole('button', { name: /Smoke English Extraction/i }));

    await waitFor(() => {
      expect(mocks.loadConversations).toHaveBeenCalledWith('proj_smoke');
      expect(mocks.routerPush).toHaveBeenCalledWith('/chat/conv_latest');
    });
    expect(mocks.chatState.toggleProjectExpanded).toHaveBeenCalledWith('proj_smoke');
    expect(mocks.chatState.setActiveConversation).toHaveBeenLastCalledWith(
      'conv_latest',
      'proj_smoke'
    );
  });
});
