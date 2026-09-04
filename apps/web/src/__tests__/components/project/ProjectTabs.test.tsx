// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectTabs } from '@/components/project/ProjectTabs';
import {
  getProjectTabSegment,
  isProjectTabSegment,
  PROJECT_TABS,
  parseProjectTab,
} from '@/components/project/projectTabModel';

describe('ProjectTabs', () => {
  it('renders stable route links and marks the active project view', () => {
    expect(typeof ProjectTabs).toBe('function');

    render(<ProjectTabs activeTab="state" outputCount={1} repoPath="/t3x-dev/test-project" />);

    const projectNavigation = screen.getByRole('navigation', { name: 'Project views' });
    expect(projectNavigation).toHaveClass(
      'ml-4',
      'items-center',
      'min-[900px]:absolute',
      'min-[900px]:left-1/2',
      'min-[900px]:-translate-x-1/2'
    );
    expect(screen.getByRole('link', { name: 'Outputs' })).toHaveTextContent('Outputs');
    expect(screen.getByRole('link', { name: 'Outputs' })).toHaveAttribute('data-output-count', '1');

    for (const tab of PROJECT_TABS) {
      const href =
        tab.id === 'state'
          ? '/t3x-dev/test-project'
          : `/t3x-dev/test-project/${getProjectTabSegment(tab.id)}`;
      expect(screen.getByRole('link', { name: tab.label })).toHaveAttribute('href', href);
    }

    expect(screen.getByRole('link', { name: 'State' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'State' })).toHaveClass(
      'bg-[var(--accent-commit-soft)]',
      'rounded-[var(--radius-md)]',
      '!text-[var(--accent-commit)]'
    );
    expect(screen.getByRole('link', { name: 'Workspaces' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Pull requests' })).toHaveTextContent('PRs');
    expect(screen.getByRole('link', { name: 'Community' })).toHaveTextContent('Community');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveTextContent('Settings');
    expect(screen.queryByRole('link', { name: 'YSchema' })).not.toBeInTheDocument();
  });

  it('keeps the compact navigation geometry when the active tab changes', () => {
    const view = render(
      <ProjectTabs activeTab="state" outputCount={1} repoPath="/t3x-dev/test-project" />
    );

    view.rerender(
      <ProjectTabs activeTab="schemas" outputCount={1} repoPath="/t3x-dev/test-project" />
    );

    expect(screen.getByRole('navigation', { name: 'Project views' })).toHaveClass('items-center');
    for (const tab of PROJECT_TABS) {
      expect(screen.getByRole('link', { name: tab.label })).toHaveClass(
        'h-8',
        'px-3.5',
        'text-[14px]'
      );
    }
    expect(screen.getByRole('link', { name: 'Schemas' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps tab labels stable for shared A0/W1/S1 ownership', () => {
    expect(PROJECT_TABS.map((tab) => tab.id)).toEqual([
      'state',
      'schemas',
      'workspaces',
      'reviews',
      'outputs',
      'community',
      'settings',
    ]);
    expect(PROJECT_TABS.find((tab) => tab.id === 'reviews')?.label).toBe('Pull requests');
    expect(getProjectTabSegment('reviews')).toBe('pull-requests');
    expect(isProjectTabSegment('pull-requests')).toBe(true);
    expect(isProjectTabSegment('reviews')).toBe(false);
    expect(parseProjectTab('pull-requests')).toBe('reviews');
    expect(parseProjectTab('reviews')).toBe('state');
  });
});
