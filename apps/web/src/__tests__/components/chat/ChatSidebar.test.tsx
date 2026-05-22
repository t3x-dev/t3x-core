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
    activeConversationId: 'conv_a432e35d' as string | null,
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
    conversationsByProject: {} as Record<string, Array<{ conversation_id: string; title: string }>>,
    loadConversations: vi.fn(),
    projects: [] as Array<{
      project_id: string;
      name: string;
      created_at: string;
      conversations_count?: number;
      commits_count?: number;
    }>,
    projectLeaves: [] as Array<{ id: string }>,
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

vi.mock('@/hooks/leaves/useProjectLeaves', () => ({
  useProjectLeaves: () => ({
    leaves: mocks.projectLeaves,
    loading: false,
    error: null,
    refresh: vi.fn(),
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
  mocks.projectLeaves = [];
  mocks.conversationsByProject = {};
  mocks.chatState.activeConversationId = 'conv_a432e35d';
  mocks.chatState.activeProjectId = null;
  mocks.chatState.expandedProjectIds = new Set<string>();
  mocks.chatState.refreshKey = 0;
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

  it('routes an empty project back to the new chat surface when clicked', () => {
    mocks.projects = [
      {
        project_id: 'proj_empty',
        name: 'Empty Project',
        created_at: '2026-05-08T00:00:00Z',
        conversations_count: 0,
        commits_count: 0,
      },
    ];
    mocks.conversationsByProject = { proj_empty: [] };

    render(<ChatSidebar />);

    fireEvent.click(screen.getByRole('button', { name: /Empty Project/i }));

    expect(mocks.routerPush).toHaveBeenCalledWith('/chat?projectId=proj_empty');
  });

  it('collapses an active empty project when clicked again', () => {
    mocks.projects = [
      {
        project_id: 'proj_empty',
        name: 'Empty Project',
        created_at: '2026-05-08T00:00:00Z',
        conversations_count: 0,
        commits_count: 0,
      },
    ];
    mocks.conversationsByProject = { proj_empty: [] };
    mocks.chatState.activeProjectId = 'proj_empty';
    mocks.chatState.activeConversationId = null;
    mocks.chatState.expandedProjectIds = new Set(['proj_empty']);

    render(<ChatSidebar />);

    fireEvent.click(screen.getByRole('button', { name: /Empty Project/i }));

    expect(mocks.chatState.toggleProjectExpanded).toHaveBeenCalledWith('proj_empty');
    expect(mocks.chatState.setActiveConversation).not.toHaveBeenCalled();
    expect(mocks.routerPush).not.toHaveBeenCalled();
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

  it('shows the active project workbench functions above the project switcher', () => {
    mocks.projects = [
      {
        project_id: 'proj_smoke',
        name: 'Smoke English Extraction',
        created_at: '2026-05-08T00:00:00Z',
        conversations_count: 3,
        commits_count: 3,
      },
      {
        project_id: 'proj_other',
        name: 'Other Project',
        created_at: '2026-05-08T00:00:00Z',
        conversations_count: 0,
        commits_count: 0,
      },
    ];
    mocks.conversationsByProject = {
      proj_smoke: [
        { conversation_id: 'conv_first', title: 'Untitled Unit' },
        { conversation_id: 'conv_a432e35d', title: 'I also want to try som...' },
        { conversation_id: 'conv_third', title: 'English extraction smoke' },
      ],
    };
    mocks.chatState.activeProjectId = 'proj_smoke';
    mocks.chatState.activeConversationId = 'conv_a432e35d';

    render(<ChatSidebar />);

    const currentProjectHeader = screen.getByText('Current Project');
    const functionsHeader = screen.getByText('Functions');
    const chatsHeader = screen.getByText('Chats in current project');
    const projectsHeader = screen.getByText('Projects');

    expect(currentProjectHeader.compareDocumentPosition(functionsHeader)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(functionsHeader.compareDocumentPosition(chatsHeader)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(chatsHeader.compareDocumentPosition(projectsHeader)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    expect(screen.getByRole('button', { name: /Source Chats\s*3/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Canvas\s*3/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Commits\s*3/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Outputs\s*0/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /I also want to try som/i })).toBeInTheDocument();
  });

  it('routes active project workbench functions to canvas, commits, and first output', () => {
    mocks.projects = [
      {
        project_id: 'proj_smoke',
        name: 'Smoke English Extraction',
        created_at: '2026-05-08T00:00:00Z',
        conversations_count: 1,
        commits_count: 3,
      },
    ];
    mocks.conversationsByProject = {
      proj_smoke: [{ conversation_id: 'conv_a432e35d', title: 'I also want to try som...' }],
    };
    mocks.projectLeaves = [{ id: 'leaf_first' }];
    mocks.chatState.activeProjectId = 'proj_smoke';
    mocks.chatState.activeConversationId = 'conv_a432e35d';

    render(<ChatSidebar />);

    fireEvent.click(screen.getByRole('button', { name: /Canvas\s*3/i }));
    expect(mocks.routerPush).toHaveBeenLastCalledWith('/project/proj_smoke');

    fireEvent.click(screen.getByRole('button', { name: /Commits\s*3/i }));
    expect(mocks.routerPush).toHaveBeenLastCalledWith('/project/proj_smoke/history');

    fireEvent.click(screen.getByRole('button', { name: /Outputs\s*1/i }));
    expect(mocks.routerPush).toHaveBeenLastCalledWith('/project/proj_smoke/leaf/leaf_first');
  });

  it('collapses an expanded project with conversations when clicked again', () => {
    mocks.projects = [
      {
        project_id: 'proj_smoke',
        name: 'Smoke English Extraction',
        created_at: '2026-05-08T00:00:00Z',
        conversations_count: 1,
        commits_count: 3,
      },
    ];
    mocks.conversationsByProject = {
      proj_smoke: [{ conversation_id: 'conv_latest', title: 'Untitled Unit' }],
    };
    mocks.chatState.activeProjectId = 'proj_smoke';
    mocks.chatState.activeConversationId = 'conv_latest';
    mocks.chatState.expandedProjectIds = new Set(['proj_smoke']);

    render(<ChatSidebar />);
    mocks.loadConversations.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /Smoke English Extraction/i }));

    expect(mocks.chatState.toggleProjectExpanded).toHaveBeenCalledWith('proj_smoke');
    expect(mocks.loadConversations).not.toHaveBeenCalled();
    expect(mocks.chatState.setActiveConversation).not.toHaveBeenCalled();
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });
});
