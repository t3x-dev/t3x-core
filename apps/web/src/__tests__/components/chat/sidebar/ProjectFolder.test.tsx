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
    expect(button.className).toContain('border-[var(--accent-commit)]/25');
    expect(button.className).toContain('bg-[var(--sidebar-panel)]');
    expect(button.className).toContain('shadow-none');
    expect(button.className).toContain('text-[var(--text-primary)]');

    const iconWrapper = button.querySelector('span');
    expect(iconWrapper?.className).toContain('bg-[var(--accent-commit)]/10');
    expect(iconWrapper?.className).toContain('text-[var(--accent-commit)]');
  });

  it('omits the active highlight (and aria-current) when isActive is false', () => {
    renderFolder({ isActive: false });

    const button = screen.getByRole('button', { name: /Test Project/i });

    expect(button).not.toHaveAttribute('aria-current');
    expect(button.className).not.toContain('bg-[var(--sidebar-panel)]');

    const iconWrapper = button.querySelector('span');
    expect(iconWrapper?.className).not.toContain('bg-[var(--accent-commit)]/10');
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
});
