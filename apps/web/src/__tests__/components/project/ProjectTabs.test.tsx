// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectTabs } from '@/components/project/ProjectTabs';
import { PROJECT_TABS } from '@/components/project/projectTabModel';

describe('ProjectTabs', () => {
  it('renders the project-first tab model and calls back with the next tab id', () => {
    const onTabChange = vi.fn();

    expect(typeof ProjectTabs).toBe('function');

    render(<ProjectTabs activeTab="overview" onTabChange={onTabChange} />);

    for (const tab of PROJECT_TABS) {
      expect(screen.getByRole('tab', { name: tab.label })).toBeInTheDocument();
    }

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Workspaces' }));

    expect(onTabChange).toHaveBeenCalledWith('workspaces');
  });

  it('keeps tab labels stable for shared A0/W1/S1 ownership', () => {
    expect(PROJECT_TABS.map((tab) => tab.id)).toEqual([
      'overview',
      'state',
      'schemas',
      'workspaces',
      'reviews',
      'outputs',
      'community',
      'settings',
    ]);
  });
});
