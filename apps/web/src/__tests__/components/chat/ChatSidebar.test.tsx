// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    contextMenuItems: [] as Array<{ label: string; onClick: () => void }>,
    conversationsByProject: {} as Record<
      string,
      Array<{
        conversation_id: string;
        title: string;
        committed_as?: string | null;
        committed_at?: string | null;
      }>
    >,
    commits: [] as Array<{
      hash: string;
      message: string | null;
      branch: string;
      committed_at: string;
      sources?: Array<{ type: string; id: string; title?: string }> | null;
    }>,
    loadConversations: vi.fn(),
    loadCommits: vi.fn(),
    pathname: '/chat/conv_a432e35d',
    projects: [] as Array<{
      project_id: string;
      name: string;
      created_at: string;
      conversations_count?: number;
      commits_count?: number;
    }>,
    projectLeaves: [] as Array<Record<string, unknown> & { id: string }>,
    routerPush: vi.fn(),
    chatState,
    toastError: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
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

vi.mock('@/hooks/commits/useCommitsList', () => ({
  useCommitsList: () => ({
    loadCommits: mocks.loadCommits,
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

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}));

vi.mock('@/components/layout/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu">User menu</div>,
}));

vi.mock('@/components/chat/sidebar/ContextMenu', () => ({
  ContextMenuPortal: () => null,
  useContextMenu: () => ({
    menu: null,
    open: vi.fn((_event, items) => {
      mocks.contextMenuItems = items;
    }),
    close: vi.fn(),
  }),
}));

import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { useTemporaryChatsStore } from '@/store/temporaryChatsStore';

afterEach(() => {
  vi.clearAllMocks();
  useTemporaryChatsStore.setState({ chats: [] });
  mocks.projects = [];
  mocks.projectLeaves = [];
  mocks.conversationsByProject = {};
  mocks.contextMenuItems = [];
  mocks.commits = [];
  mocks.loadCommits.mockResolvedValue(mocks.commits);
  mocks.pathname = '/chat/conv_a432e35d';
  mocks.chatState.activeConversationId = 'conv_a432e35d';
  mocks.chatState.activeProjectId = null;
  mocks.chatState.expandedProjectIds = new Set<string>();
  mocks.chatState.refreshKey = 0;
});

describe('ChatSidebar', () => {
  it('creates a temporary chat from the Temporary chats action', () => {
    render(<ChatSidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'New temporary chat' }));

    const [chat] = useTemporaryChatsStore.getState().chats;
    expect(chat).toMatchObject({ title: 'Temporary chat', messages: [] });
    expect(mocks.chatState.setActiveConversation).toHaveBeenCalledWith(chat.id, null);
    expect(mocks.chatState.setConversationTitle).toHaveBeenCalledWith('Temporary chat');
    expect(mocks.routerPush).toHaveBeenCalledWith(`/chat/${encodeURIComponent(chat.id)}`);
  });

  it('uses the shared purple tint selected shell for active temporary chats', () => {
    useTemporaryChatsStore.setState({
      chats: [
        {
          id: 'temp_selected',
          title: 'Temporary chat',
          messages: [],
          createdAt: '2026-05-25T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
        },
      ],
    });
    mocks.chatState.activeConversationId = 'temp_selected';
    mocks.chatState.activeProjectId = null;

    render(<ChatSidebar />);

    const chatButton = screen.getByRole('button', {
      name: /Temporary chat\s*0 messages/,
    });
    const row = chatButton.parentElement;

    expect(row).toHaveClass('bg-[var(--accent-conversation-soft)]');
    expect(row).toHaveClass('border-[var(--accent-conversation)]/20');
    expect(row).not.toHaveClass('bg-[var(--sidebar-panel)]');
  });

  it('confirms before deleting a temporary chat', () => {
    useTemporaryChatsStore.setState({
      chats: [
        {
          id: 'temp_delete',
          title: 'Temporary chat',
          messages: [],
          createdAt: '2026-05-25T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
        },
      ],
    });
    mocks.chatState.activeConversationId = 'temp_delete';
    mocks.chatState.activeProjectId = null;

    render(<ChatSidebar />);

    fireEvent.contextMenu(
      screen.getByRole('button', {
        name: /Temporary chat\s*0 messages/,
      }).parentElement as HTMLElement
    );
    const deleteAction = mocks.contextMenuItems.find(
      (item) => item.label === 'Delete Temporary Chat'
    );
    expect(deleteAction).toBeDefined();
    act(() => {
      deleteAction?.onClick();
    });

    expect(useTemporaryChatsStore.getState().chats).toHaveLength(1);
    expect(screen.getByText('Delete Temporary Chat')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useTemporaryChatsStore.getState().chats).toHaveLength(1);

    fireEvent.contextMenu(
      screen.getByRole('button', {
        name: /Temporary chat\s*0 messages/,
      }).parentElement as HTMLElement
    );
    const confirmDeleteAction = mocks.contextMenuItems.find(
      (item) => item.label === 'Delete Temporary Chat'
    );
    expect(confirmDeleteAction).toBeDefined();
    act(() => {
      confirmDeleteAction?.onClick();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(useTemporaryChatsStore.getState().chats).toHaveLength(0);
    expect(mocks.chatState.setActiveConversation).toHaveBeenCalledWith(null, null);
    expect(mocks.routerPush).toHaveBeenCalledWith('/chat');
  });

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

    fireEvent.click(screen.getAllByRole('button', { name: /Smoke English Extraction/i })[0]);

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

  it('shows the latest main commit hash next to committed project names', async () => {
    mocks.projects = [
      {
        project_id: 'proj_committed',
        name: 'Committed Project',
        created_at: '2026-05-08T00:00:00Z',
        conversations_count: 1,
        commits_count: 2,
      },
    ];
    mocks.loadCommits.mockResolvedValue([
      {
        hash: 'sha256:abcdef1234567890',
        message: 'Latest main commit',
        branch: 'main',
        committed_at: '2026-05-08T00:00:00Z',
      },
    ]);

    render(<ChatSidebar />);

    await waitFor(() => {
      expect(mocks.loadCommits).toHaveBeenCalledWith('proj_committed', 'main', 1);
      expect(screen.getByText('· abcdef12')).toBeInTheDocument();
    });
  });

  it('shows branch commit hashes next to source conversation names', async () => {
    mocks.projects = [
      {
        project_id: 'proj_branch',
        name: 'Branch Project',
        created_at: '2026-05-08T00:00:00Z',
        conversations_count: 1,
        commits_count: 1,
      },
    ];
    mocks.conversationsByProject = {
      proj_branch: [
        {
          conversation_id: 'conv_branch_source',
          title: 'Branch source chat',
          committed_as: null,
        },
      ],
    };
    mocks.chatState.expandedProjectIds = new Set(['proj_branch']);
    mocks.loadCommits.mockImplementation(async (_projectId, branch, limit) => {
      if (branch === 'main' && limit === 1) return [];
      return [
        {
          hash: 'sha256:1234567890abcdef',
          message: 'Branch exploration',
          branch: 'feature-branch',
          committed_at: '2026-05-08T00:00:00Z',
          sources: [{ type: 'conversation', id: 'conv_branch_source' }],
        },
      ];
    });

    render(<ChatSidebar />);

    await waitFor(() => {
      expect(mocks.loadCommits).toHaveBeenCalledWith('proj_branch', undefined, 100);
      expect(screen.getByText('· 12345678')).toBeInTheDocument();
    });
  });

  it('shows a new conversation commit hash immediately from commit-created events', async () => {
    mocks.projects = [
      {
        project_id: 'proj_live',
        name: 'Live Project',
        created_at: '2026-05-08T00:00:00Z',
        conversations_count: 1,
        commits_count: 0,
      },
    ];
    mocks.conversationsByProject = {
      proj_live: [
        {
          conversation_id: 'conv_live_source',
          title: 'Live source chat',
          committed_as: null,
        },
      ],
    };
    mocks.chatState.expandedProjectIds = new Set(['proj_live']);

    render(<ChatSidebar />);

    expect(screen.queryByText('· 87654321')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('t3x:commit-created', {
          detail: {
            type: 'commit.created',
            projectId: 'proj_live',
            conversationId: 'conv_live_source',
            conversationIds: ['conv_live_source'],
            branch: 'main',
            payload: { hash: 'sha256:876543210fedcba', branch: 'main' },
          },
        })
      );
    });

    expect(screen.getAllByText('· 87654321').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Claude-style mode tabs above chat navigation lists', () => {
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

    const chatTab = screen.getByRole('tab', { name: 'Chat' });
    const canvasTab = screen.getByRole('tab', { name: 'Canvas' });
    const leafTab = screen.getByRole('tab', { name: 'Leaf' });
    const newProject = screen.getByRole('button', { name: 'New project' });
    const newTemporaryChat = screen.getByRole('button', { name: 'New temporary chat' });
    const temporaryHeader = screen.getByText('Temporary chats');
    const projectsHeader = screen.getByText('Projects');

    expect(chatTab).toHaveAttribute('aria-selected', 'true');
    expect(canvasTab).toBeEnabled();
    expect(leafTab).toBeEnabled();
    expect(chatTab.compareDocumentPosition(newProject)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(newProject.compareDocumentPosition(projectsHeader)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(projectsHeader.compareDocumentPosition(temporaryHeader)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(temporaryHeader.compareDocumentPosition(newTemporaryChat)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    expect(screen.getByRole('button', { name: /Smoke English Extraction/i })).toBeInTheDocument();
  });

  it('routes top-level Canvas and Leaf tabs from the active project context', () => {
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

    fireEvent.click(screen.getByRole('tab', { name: 'Canvas' }));
    expect(mocks.routerPush).toHaveBeenLastCalledWith('/chat/project/proj_smoke/canvas');

    fireEvent.click(screen.getByRole('tab', { name: 'Leaf' }));
    expect(mocks.routerPush).toHaveBeenLastCalledWith('/chat/project/proj_smoke/leaf');
  });

  it('shows canvas-scoped navigation below the Canvas tab', async () => {
    mocks.pathname = '/chat/project/proj_smoke/canvas';
    mocks.projects = [
      {
        project_id: 'proj_smoke',
        name: 'Smoke English Extraction',
        created_at: '2026-05-08T00:00:00Z',
        conversations_count: 1,
        commits_count: 3,
      },
    ];
    mocks.commits = [
      {
        hash: 'sha256:abcdef123456',
        message: 'Extract release decisions',
        branch: 'main',
        committed_at: '2026-05-08T00:00:00Z',
      },
    ];
    mocks.loadCommits.mockResolvedValue(mocks.commits);
    mocks.projectLeaves = [{ id: 'leaf_first', commit_hash: 'sha256:abcdef123456' }];

    render(<ChatSidebar />);

    expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open canvas' })).toBeInTheDocument();
    expect(screen.getByText('Canvas view · version graph')).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.loadCommits).toHaveBeenCalledWith('proj_smoke', undefined, 40);
      expect(screen.getByText('Extract release decisions')).toBeInTheDocument();
    });
  });

  it('opens commit details from the canvas-scoped commit list', async () => {
    mocks.pathname = '/chat/project/proj_smoke/canvas';
    mocks.projects = [
      {
        project_id: 'proj_smoke',
        name: 'Smoke English Extraction',
        created_at: '2026-05-08T00:00:00Z',
        conversations_count: 1,
        commits_count: 1,
      },
    ];
    mocks.commits = [
      {
        hash: 'sha256:abcdef123456',
        message: 'Extract release decisions',
        branch: 'main',
        committed_at: '2026-05-08T00:00:00Z',
      },
    ];
    mocks.loadCommits.mockResolvedValue(mocks.commits);

    render(<ChatSidebar />);

    const commitButton = await screen.findByRole('button', {
      name: /Extract release decisions/i,
    });
    fireEvent.click(commitButton);

    expect(mocks.routerPush).toHaveBeenCalledWith(
      '/project/proj_smoke/commit/sha256%3Aabcdef123456?returnTo=%2Fchat%2Fproject%2Fproj_smoke%2Fcanvas'
    );
  });

  it('shows leaf-scoped navigation below the Leaf tab', () => {
    mocks.pathname = '/chat/project/proj_smoke/leaf/leaf_first';
    mocks.projects = [
      {
        project_id: 'proj_smoke',
        name: 'Smoke English Extraction',
        created_at: '2026-05-08T00:00:00Z',
        conversations_count: 1,
        commits_count: 3,
      },
    ];
    mocks.projectLeaves = [
      {
        id: 'leaf_first',
        commit_hash: 'sha256:abcdef123456',
        title: 'Release note brief',
        type: 'report',
        output: 'Generated',
        generated_at: '2026-05-08T00:00:00Z',
        runner_assertions: [{ passed: true }, { passed: false }],
      },
    ];

    render(<ChatSidebar />);

    expect(screen.getByRole('tab', { name: 'Leaf' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leaf index' })).toBeInTheDocument();
    expect(screen.getByText('Output artifacts')).toBeInTheDocument();
    expect(screen.getByText('Release note brief')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
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

    fireEvent.click(screen.getAllByRole('button', { name: /Smoke English Extraction/i })[0]);

    expect(mocks.chatState.toggleProjectExpanded).toHaveBeenCalledWith('proj_smoke');
    expect(mocks.loadConversations).not.toHaveBeenCalled();
    expect(mocks.chatState.setActiveConversation).not.toHaveBeenCalled();
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });

  it('handles project conversation load failures without opening the runtime overlay', async () => {
    mocks.projects = [
      {
        project_id: 'proj_network',
        name: 'Network Project',
        created_at: '2026-05-27T00:00:00Z',
        conversations_count: 1,
        commits_count: 0,
      },
    ];
    mocks.loadConversations.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(<ChatSidebar />);

    fireEvent.click(screen.getAllByRole('button', { name: /Network Project/i })[0]);

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Failed to load conversations: Failed to fetch',
        { id: 'project-conversations-load-error' }
      );
    });
    expect(mocks.routerPush).not.toHaveBeenCalledWith('/chat/conv_network');
  });
});
