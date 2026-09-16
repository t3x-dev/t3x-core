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

    for (const activeTab of ['schemas', 'workspaces'] as const) {
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

  it('uses the same project header in Workspace', () => {
    render(
      <ProjectShell activeTab="workspaces" project={project}>
        <div>Review content</div>
      </ProjectShell>
    );

    expect(screen.getByRole('banner')).toHaveClass('h-24');
    expect(document.querySelector('svg[aria-label="T3X Logo"]')).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Global' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '/templates');
    expect(screen.getByRole('link', { name: 'Your projects' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Create new' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Create new' })).toHaveClass(
      'h-[34px]',
      'rounded-[5px]',
      'text-[var(--text-primary)]'
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings?project=proj_test'
    );
    expect(screen.queryByText('active')).not.toBeInTheDocument();
    expect(screen.getByText('Review content')).toBeInTheDocument();
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
