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

      expect(screen.getByRole('banner')).toHaveClass('h-14', 'px-5');
      expect(screen.getByRole('banner')).toHaveClass('pt-2', 'bg-[var(--surface-elevated)]');
      expect(screen.getByRole('heading', { name: 'Test Project' })).toHaveClass('text-xs');
      expect(screen.getByRole('navigation', { name: 'Project views' })).toHaveClass('items-center');
      expect(screen.getByText('active')).toHaveClass('text-xs');
      expect(screen.getByRole('link', { name: 'Outputs' })).toHaveTextContent('Outputs');
      expect(screen.getByRole('link', { name: 'Back to t3x-dev' })).toHaveTextContent('T3X');
      expect(screen.queryByRole('button', { name: 'main' })).not.toBeInTheDocument();
    }
  });
});
