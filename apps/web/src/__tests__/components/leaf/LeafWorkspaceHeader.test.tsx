// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeafWorkspaceHeader } from '@/components/leaf/LeafWorkspaceHeader';
import type { Leaf } from '@/types/api';

vi.mock('@/components/shared/ShareLinkButton', () => ({
  ShareLinkButton: () => <button type="button">Share</button>,
}));

vi.mock('@/hooks/shared/useTerminology', () => ({
  useTerminology: () => ({ t: (term: string) => term }),
}));

function makeLeaf(output: string | null): Leaf {
  return {
    assertions: null,
    commit_hash: 'sha256:latest123456789',
    config: {},
    constraints: [],
    created_at: '2026-07-29T08:00:00.000Z',
    generated_at: output ? '2026-07-29T09:00:00.000Z' : null,
    id: 'leaf_42b6ec',
    output,
    project_id: 'proj_1',
    title: 'Blog post',
    type: 'article',
  } as Leaf;
}

const embeddedNavigation = {
  count: 1,
  onCreateLeaf: vi.fn(),
  onManageLeaves: vi.fn(),
  status: { label: 'Unlinked', variant: 'outline' as const },
};

describe('LeafWorkspaceHeader', () => {
  it('keeps sharing unavailable until an output exists', () => {
    render(
      <LeafWorkspaceHeader
        embeddedNavigation={embeddedNavigation}
        leaf={makeLeaf(null)}
        mode="generate"
        onExport={vi.fn()}
        onModeChange={vi.fn()}
        projectId="proj_1"
        projectName="Test project"
      />
    );

    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Leaf' })).toHaveClass(
      'bg-[var(--accent-branch)]'
    );
  });

  it('shows sharing and export actions after generation', () => {
    render(
      <LeafWorkspaceHeader
        embeddedNavigation={embeddedNavigation}
        leaf={makeLeaf('Generated output')}
        mode="display"
        onExport={vi.fn()}
        onModeChange={vi.fn()}
        projectId="proj_1"
        projectName="Test project"
      />
    );

    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export/ })).toBeInTheDocument();
  });
});
