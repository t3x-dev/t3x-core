// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBranchRulesSettings } from '@/components/project/settings/ProjectBranchRulesSettings';
import type { Branch } from '@/infrastructure/types';

const mocks = vi.hoisted(() => ({
  listBranches: vi.fn(),
  updateBranchRules: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/infrastructure/branches', () => ({
  listBranches: mocks.listBranches,
  updateBranchRules: mocks.updateBranchRules,
}));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess } }));

function branch(name: string, rules?: Branch['rules']): Branch {
  return {
    branch_id: `b-${name}`,
    name,
    is_current: name === 'main',
    ...(rules ? { rules } : {}),
    created_at: '',
    updated_at: '',
  };
}

describe('ProjectBranchRulesSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listBranches.mockResolvedValue({
      branches: [
        branch('release', {
          commit: { require_independent_review: true, source: 'custom' },
        }),
        branch('main'),
      ],
      limit: 50,
      offset: 0,
    });
  });

  it('defaults to main and lists every branch in the picker', async () => {
    render(<ProjectBranchRulesSettings projectId="project-1" />);

    const picker = await screen.findByRole('combobox', { name: 'Branch' });
    expect(picker).toHaveValue('main');
    expect(
      Array.from(picker.querySelectorAll('option')).map((option) => option.textContent)
    ).toEqual(['release', 'main']);
    expect(screen.getByRole('combobox', { name: 'Commit rule' })).toHaveValue('direct');
  });

  it('shows the rules carried by the branch picked in the dropdown', async () => {
    render(<ProjectBranchRulesSettings projectId="project-1" />);

    fireEvent.change(await screen.findByRole('combobox', { name: 'Branch' }), {
      target: { value: 'release' },
    });

    expect(screen.getByRole('combobox', { name: 'Commit rule' })).toHaveValue('review');
    expect(screen.getByText(/Custom policy/)).toBeVisible();
  });

  it('saves the commit rule onto the selected branch', async () => {
    mocks.updateBranchRules.mockResolvedValue(
      branch('main', { commit: { require_independent_review: true, source: 'preset' } })
    );
    render(<ProjectBranchRulesSettings projectId="project-1" />);

    const rule = await screen.findByRole('combobox', { name: 'Commit rule' });
    fireEvent.change(rule, { target: { value: 'review' } });

    await waitFor(() => expect(rule).toHaveValue('review'));
    expect(mocks.updateBranchRules).toHaveBeenCalledWith('project-1', 'main', {
      commit: { require_independent_review: true },
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Branch rules for main updated');
  });

  it('keeps the saved rule and shows the error when saving fails', async () => {
    mocks.updateBranchRules.mockRejectedValue(new Error('Branch rules require a human principal'));
    render(<ProjectBranchRulesSettings projectId="project-1" />);

    const rule = await screen.findByRole('combobox', { name: 'Commit rule' });
    fireEvent.change(rule, { target: { value: 'review' } });

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(rule).toHaveValue('direct');
  });
});
