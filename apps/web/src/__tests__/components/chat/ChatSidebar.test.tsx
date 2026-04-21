// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat/conv_a432e35d',
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('@/store/chatStore', () => ({
  useChatStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      sidebarCollapsed: false,
      toggleSidebar: vi.fn(),
      activeConversationId: 'conv_a432e35d',
      expandedProjectIds: new Set<string>(),
      toggleProjectExpanded: vi.fn(),
      setActiveConversation: vi.fn(),
      refreshKey: 0,
      refreshSidebar: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/hooks/projects/useProjects', () => ({
  useProjects: () => ({
    projects: [],
    refresh: vi.fn(),
    remove: vi.fn(),
    create: vi.fn(),
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
  it('renders a dedicated settings link in the bottom section', () => {
    render(<ChatSidebar />);

    const settingsLink = screen.getByRole('link', { name: /settings/i });
    expect(settingsLink).toBeInTheDocument();
    expect(settingsLink).toHaveAttribute('href', '/settings');
  });
});
