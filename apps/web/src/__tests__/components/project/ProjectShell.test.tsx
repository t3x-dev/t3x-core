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
};

describe('ProjectShell', () => {
  it('keeps the compact shell geometry across project tabs', () => {
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

      expect(screen.getByRole('banner')).toHaveClass('h-9', 'px-2.5');
      expect(screen.getByRole('heading', { name: 'Test Project' })).toHaveClass('text-base');
      expect(screen.getByRole('navigation', { name: 'Project views' })).toHaveClass('min-h-8');
      expect(screen.getByText('active')).toHaveClass('text-xs');
      expect(screen.getByRole('link', { name: 'Outputs' })).toHaveTextContent('Outputs1');
    }
  });
});
