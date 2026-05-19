// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat/conv_a432e35d',
  useRouter: () => ({
    push: mocks.routerPush,
  }),
}));

vi.mock('@/store/chatStore', () => {
  const state = {
    sidebarCollapsed: false,
    sidebarResizing: false,
    sidebarWidth: 276,
    toggleSidebar: vi.fn(),
    setSidebarResizing: vi.fn(),
    setSidebarWidth: vi.fn(),
    activeConversationId: 'conv_a432e35d',
    activeProjectId: null,
    expandedProjectIds: new Set<string>(),
    toggleProjectExpanded: vi.fn(),
    setActiveConversation: vi.fn(),
    refreshKey: 0,
    refreshSidebar: vi.fn(),
  };

  return {
    CHAT_SIDEBAR_COLLAPSED_WIDTH: 64,
    useChatStore: Object.assign(
      (selector?: (mockState: typeof state) => unknown) => (selector ? selector(state) : state),
      {
        getState: () => state,
      }
    ),
  };
});

vi.mock('@/hooks/projects/useProjects', () => ({
  useProjects: () => ({
    projects: [],
    refresh: vi.fn(),
    remove: vi.fn(),
    create: mocks.createProject,
  }),
}));

vi.mock('@/hooks/conversations/useProjectConversations', () => ({
  useProjectConversations: () => ({
    conversationsByProject: {},
    load: vi.fn(),
    remove: vi.fn(),
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
});
