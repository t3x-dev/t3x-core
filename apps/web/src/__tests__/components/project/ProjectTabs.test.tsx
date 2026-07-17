// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectTabs } from '@/components/project/ProjectTabs';
import { PROJECT_TABS } from '@/components/project/projectTabModel';

describe('ProjectTabs', () => {
  it('renders stable route links and marks the active project view', () => {
    expect(typeof ProjectTabs).toBe('function');

    render(<ProjectTabs activeTab="state" repoPath="/t3x-dev/test-project" />);

    for (const tab of PROJECT_TABS) {
      const href = tab.id === 'state' ? '/t3x-dev/test-project' : `/t3x-dev/test-project/${tab.id}`;
      expect(screen.getByRole('link', { name: tab.label })).toHaveAttribute('href', href);
    }

    expect(screen.getByRole('link', { name: 'State' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Workspaces' })).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('link', { name: 'YSchema' })).not.toBeInTheDocument();
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
  });
});
