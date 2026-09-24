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
  it('keeps the shared two-row shell across project tabs', () => {
    const view = render(
      <ProjectShell activeTab="state" project={project}>
        <div>State content</div>
      </ProjectShell>
    );

    for (const activeTab of ['schemas', 'workspaces', 'reviews'] as const) {
      view.rerender(
        <ProjectShell activeTab={activeTab} project={project}>
          <div>{activeTab} content</div>
        </ProjectShell>
      );

      expect(screen.getByRole('banner')).toHaveClass('h-24', 'px-3');
      expect(screen.getByRole('heading', { name: 'Test Project' })).toHaveAttribute(
        'title',
        'Test Project'
      );
      expect(screen.getByRole('navigation', { name: 'Project views' })).toHaveClass('min-h-10');
      expect(screen.getByText('Public')).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Global' })).toBeInTheDocument();
      expect(screen.queryByText('active')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Outputs' })).not.toBeInTheDocument();
    }
  });

  it('uses the shared blue project navigation in Workspace and routes settings correctly', () => {
    render(
      <ProjectShell activeTab="workspaces" ownerSlug="t3x-dev" project={project}>
        <div>Review content</div>
      </ProjectShell>
    );

    expect(screen.getByRole('banner')).toHaveClass('h-24', 'px-3');
    expect(document.querySelector('svg[aria-label="T3X Logo"]')).toBeInTheDocument();
    expect(screen.getByText('t3x-dev')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Owner t3x-dev' })).toHaveTextContent('T');
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Global' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Workspaces' })).toHaveClass(
      'bg-[var(--accent-commit-soft)]',
      '!text-[var(--accent-commit)]'
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/project/proj_test/settings?returnTo=%2Ft3x-dev%2Ftest-project%3Ftab%3Dworkspaces'
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
    expect(screen.getByRole('link', { name: 'Create new' })).toHaveAttribute(
      'href',
      '/orbit-labs/new'
    );
    expect(screen.getByText('orbit-labs')).toBeInTheDocument();

    view.rerender(
      <ProjectShell activeTab="state" project={project} projectIdNavigation>
        <div>State content</div>
      </ProjectShell>
    );
    expect(screen.getByRole('link', { name: 'Browse projects' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('orbit-labs')).not.toBeInTheDocument();
  });

  it('returns from Settings to the same PR and branch', () => {
    render(
      <ProjectShell
        activeTab="reviews"
        branch="feature/release"
        project={project}
        projectIdNavigation
        pullRequestNumber={7}
      >
        <div>Review content</div>
      </ProjectShell>
    );

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/project/proj_test/settings?returnTo=%2Fproject%2Fproj_test%3Ftab%3Dpull-requests%26branch%3Dfeature%252Frelease%26pr%3D7'
    );
  });

  it('keeps the shared project header on immersive Studio surfaces', () => {
    render(
      <ProjectShell activeTab="schemas" immersive project={project}>
        <div>Studio content</div>
      </ProjectShell>
    );

    expect(screen.getByRole('banner')).toHaveClass('h-24');
    expect(screen.getByRole('heading', { name: 'Test Project' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Schemas' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Studio content').closest('main')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-hidden'
    );
  });
});
