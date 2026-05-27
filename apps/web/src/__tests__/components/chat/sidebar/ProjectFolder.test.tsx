// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/store/chatStore', () => ({
  useChatStore: { setState: vi.fn() },
}));

import { ProjectFolder } from '@/components/chat/sidebar/ProjectFolder';
import type { Project } from '@/types/api';

const baseProject: Project = {
  project_id: 'proj_test',
  name: 'Test Project',
  created_at: '2026-04-26T00:00:00Z',
  conversations_count: 0,
  commits_count: 0,
} as Project;

function renderFolder(overrides: { isActive?: boolean; isExpanded?: boolean } = {}) {
  return render(
    <ProjectFolder
      project={baseProject}
      conversations={[]}
      isExpanded={overrides.isExpanded ?? false}
      isActive={overrides.isActive ?? false}
      activeConversationId={null}
      collapsed={false}
      onToggleExpand={vi.fn()}
      onConversationClick={vi.fn()}
      onNewChat={vi.fn()}
      onProjectContextMenu={vi.fn()}
      onConversationContextMenu={vi.fn()}
    />
  );
}

describe('ProjectFolder active state', () => {
  it('marks the folder button with aria-current and the accent highlight when isActive', () => {
    renderFolder({ isActive: true });

    const button = screen.getByRole('button', { name: /Test Project/i });
    expect(button.parentElement?.className).toContain('px-2.5');
    expect(button).toHaveAttribute('aria-current', 'true');
    // The active style is the source of the visible "selected project"
    // signal — pin the actual classes the production code emits so a
    // refactor that drops them fails loudly here, not silently in the UI.
    expect(button.className).toContain('border-[var(--accent-conversation)]/20');
    expect(button.className).toContain('bg-[var(--accent-conversation-soft)]');
    expect(button.className).toContain('shadow-none');
    expect(button.className).toContain('text-[var(--text-primary)]');

    const iconWrapper = button.querySelector('span');
    expect(iconWrapper?.className).toContain('bg-transparent');
    expect(iconWrapper?.className).toContain('text-[var(--accent-conversation)]');
  });

  it('omits the active highlight (and aria-current) when isActive is false', () => {
    renderFolder({ isActive: false });

    const button = screen.getByRole('button', { name: /Test Project/i });

    expect(button).not.toHaveAttribute('aria-current');
    expect(button.className).not.toContain('bg-[var(--accent-conversation-soft)]');

    const iconWrapper = button.querySelector('span');
    expect(iconWrapper?.className).not.toContain('text-[var(--accent-conversation)]');
  });

  it('marks demo workspaces with a Demo badge from project metadata', () => {
    render(
      <ProjectFolder
        project={{ ...baseProject, metadata: { is_demo: true } }}
        conversations={[]}
        isExpanded={false}
        isActive={false}
        activeConversationId={null}
        collapsed={false}
        onToggleExpand={vi.fn()}
        onConversationClick={vi.fn()}
        onNewChat={vi.fn()}
        onProjectContextMenu={vi.fn()}
        onConversationContextMenu={vi.fn()}
      />
    );

    expect(screen.getByText('Demo')).toBeInTheDocument();
  });

  it('keeps project row metadata compact while preserving full details on hover', () => {
    render(
      <ProjectFolder
        project={{ ...baseProject, conversations_count: 3, commits_count: 2 }}
        conversations={[]}
        isExpanded={false}
        isActive={false}
        activeConversationId={null}
        collapsed={false}
        onToggleExpand={vi.fn()}
        onConversationClick={vi.fn()}
        onNewChat={vi.fn()}
        onProjectContextMenu={vi.fn()}
        onConversationContextMenu={vi.fn()}
      />
    );

    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('2 commits')).toBeInTheDocument();
    expect(screen.queryByText('3 sources')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Test Project/i })).toHaveAttribute(
      'title',
      'Test Project\nmain · 2 commits · 3 sources'
    );
  });

  it('shows a load error instead of the empty state when conversations cannot be fetched', () => {
    render(
      <ProjectFolder
        project={{ ...baseProject, conversations_count: 1 }}
        conversations={[]}
        isExpanded
        isActive={false}
        activeConversationId={null}
        collapsed={false}
        loadError="Failed to fetch"
        onToggleExpand={vi.fn()}
        onConversationClick={vi.fn()}
        onNewChat={vi.fn()}
        onProjectContextMenu={vi.fn()}
        onConversationContextMenu={vi.fn()}
      />
    );

    expect(screen.getByText('Failed to load conversations')).toBeInTheDocument();
    expect(screen.queryByText('No conversations')).not.toBeInTheDocument();
  });

  it('appends the latest main commit hash to the visible project name', () => {
    render(
      <ProjectFolder
        project={{ ...baseProject, conversations_count: 3, commits_count: 2 }}
        conversations={[]}
        isExpanded={false}
        isActive={false}
        activeConversationId={null}
        collapsed={false}
        latestMainCommitHash="sha256:abcdef1234567890"
        onToggleExpand={vi.fn()}
        onConversationClick={vi.fn()}
        onNewChat={vi.fn()}
        onProjectContextMenu={vi.fn()}
        onConversationContextMenu={vi.fn()}
      />
    );

    expect(screen.getByText('· abcdef12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Test Project/i })).toHaveAttribute(
      'title',
      'Test Project · abcdef12\nmain · 2 commits · latest sha256:abcdef1234567890 · 3 sources'
    );
  });

  it('appends committed conversation hashes without changing the base title', () => {
    render(
      <ProjectFolder
        project={{ ...baseProject, conversations_count: 1, commits_count: 1 }}
        conversations={[
          {
            conversation_id: 'conv_committed',
            project_id: 'proj_test',
            title: 'Chestnut meal plan',
            committed_as: 'sha256:fedcba9876543210',
            committed_at: '2026-05-25T00:00:00Z',
            created_at: '2026-05-25T00:00:00Z',
          },
        ]}
        isExpanded
        isActive={false}
        activeConversationId={null}
        collapsed={false}
        onToggleExpand={vi.fn()}
        onConversationClick={vi.fn()}
        onNewChat={vi.fn()}
        onProjectContextMenu={vi.fn()}
        onConversationContextMenu={vi.fn()}
      />
    );

    const title = screen.getByText('Chestnut meal plan');
    expect(title).toBeInTheDocument();
    expect(title.nextElementSibling).toHaveTextContent('· fedcba98');
    expect(screen.getByText('· fedcba98')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chestnut meal plan/i })).toHaveAttribute(
      'title',
      'Chestnut meal plan · fedcba98\ncommit sha256:fedcba9876543210'
    );
  });

  it('appends branch commit hashes for conversations that are not marked committed', () => {
    render(
      <ProjectFolder
        project={{ ...baseProject, conversations_count: 1, commits_count: 1 }}
        conversations={[
          {
            conversation_id: 'conv_branch',
            project_id: 'proj_test',
            title: 'Branch exploration',
            committed_as: null,
            committed_at: null,
            created_at: '2026-05-25T00:00:00Z',
          },
        ]}
        isExpanded
        isActive={false}
        activeConversationId={null}
        collapsed={false}
        conversationCommitHashes={{ conv_branch: 'sha256:1234567890abcdef' }}
        onToggleExpand={vi.fn()}
        onConversationClick={vi.fn()}
        onNewChat={vi.fn()}
        onProjectContextMenu={vi.fn()}
        onConversationContextMenu={vi.fn()}
      />
    );

    const title = screen.getByText('Branch exploration');
    expect(title).toBeInTheDocument();
    expect(title.nextElementSibling).toHaveTextContent('· 12345678');
    expect(screen.getByText('· 12345678')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Branch exploration/i })).toHaveAttribute(
      'title',
      'Branch exploration · 12345678\ncommit sha256:1234567890abcdef'
    );
  });
});
