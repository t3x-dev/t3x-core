// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectShell } from '@/components/project/ProjectShell';

const project = {
  id: 'proj_test',
  name: 'Test Project',
  outputsCount: 1,
  status: 'active' as const,
  visibility: 'public' as const,
};

describe('ProjectShell', () => {
  it('updates the browser title for the repository and current section, then releases it', () => {
    const previousTitle = document.title;
    document.title = 'Your repositories · T3X';
    const repository = { ...project, namespace: 'team', description: 'A versioned project' };
    const view = render(
      <ProjectShell activeTab="state" project={repository}>
        State
      </ProjectShell>
    );
    try {
      expect(document.title).toBe('team/Test Project: A versioned project');
      view.rerender(
        <ProjectShell activeTab="reviews" project={repository} pullRequestNumber={42}>
          Pull request
        </ProjectShell>
      );
      expect(document.title).toBe('Pull request #42 · team/Test Project · T3X');
      view.rerender(
        <ProjectShell activeTab="workspaces" pageTitle="Review" project={repository}>
          Review
        </ProjectShell>
      );
      expect(document.title).toBe('Review · team/Test Project · T3X');
      view.unmount();
      expect(document.title).toBe('Your repositories · T3X');
    } finally {
      document.title = previousTitle;
    }
  });

  it('keeps the shared two-row shell across project tabs', () => {
    const view = render(
      <ProjectShell activeTab="state" project={project}>
        <div>State content</div>
      </ProjectShell>
    );

    for (const activeTab of ['schemas', 'discover', 'browse', 'workspaces'] as const) {
      view.rerender(
        <ProjectShell activeTab={activeTab} project={project}>
          <div>{activeTab} content</div>
        </ProjectShell>
      );

      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Test Project' })).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Project views' })).toBeInTheDocument();
      expect(screen.getByText('Public')).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Global' })).toBeInTheDocument();
      expect(screen.queryByText('active')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Outputs' })).not.toBeInTheDocument();
    }
  });

  it('uses the reference project navigation in Workspace and routes settings correctly', () => {
    render(
      <ProjectShell
        activeTab="workspaces"
        ownerSlug="t3x-dev"
        project={{ ...project, namespace: 't3x-dev', canonical_path: '/t3x-dev/Test-Project' }}
      >
        <div>Review content</div>
      </ProjectShell>
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText('t3x-dev')).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Global' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/t3x-dev/Test-Project/settings'
    );
    expect(screen.queryByText('active')).not.toBeInTheDocument();
    expect(screen.getByText('Review content')).toBeInTheDocument();
  });

  it('creates repositories under the known owner and avoids inventing one on id-only routes', () => {
    const view = render(
      <ProjectShell activeTab="state" ownerSlug="orbit-labs" project={project}>
        <div>State content</div>
      </ProjectShell>
    );
    expect(screen.getByRole('link', { name: 'New repository' })).toHaveAttribute(
      'href',
      '/orbit-labs/new'
    );
    expect(screen.getByText('orbit-labs')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'State' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Schema' })).not.toHaveAttribute('aria-current');

    view.rerender(
      <ProjectShell activeTab="state" project={project} projectIdNavigation>
        <div>State content</div>
      </ProjectShell>
    );
    expect(screen.getByRole('link', { name: 'Browse repositories' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('orbit-labs')).not.toBeInTheDocument();
  });

  it('keeps the shared project header on immersive Studio surfaces', () => {
    render(
      <ProjectShell activeTab="schemas" immersive project={project}>
        <div>Studio content</div>
      </ProjectShell>
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'T3X home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Schema' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Studio content').closest('main')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-hidden'
    );
  });
});
