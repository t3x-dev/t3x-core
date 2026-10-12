// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBranchRulesSettings } from '@/components/project/settings/ProjectBranchRulesSettings';

const mocks = vi.hoisted(() => ({
  listBranches: vi.fn(),
  getBranchRule: vi.fn(),
  setBranchRule: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/infrastructure/branches', () => ({ listBranches: mocks.listBranches }));
vi.mock('@/infrastructure/branchRules', () => ({
  getBranchRule: mocks.getBranchRule,
  setBranchRule: mocks.setBranchRule,
}));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess } }));

describe('ProjectBranchRulesSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listBranches.mockResolvedValue({
      branches: [
        { branch_id: 'b2', name: 'release', is_current: false, created_at: '' },
        { branch_id: 'b1', name: 'main', is_current: true, created_at: '' },
      ],
      limit: 50,
      offset: 0,
    });
    mocks.getBranchRule.mockImplementation(async (_projectId: string, refName: string) => ({
      ref_name: refName,
      require_independent_review: refName === 'release',
      source: refName === 'release' ? 'custom' : 'default',
    }));
  });

  it('defaults to main and lists every branch in the picker', async () => {
    render(<ProjectBranchRulesSettings projectId="project-1" />);

    const branch = await screen.findByRole('combobox', { name: 'Branch' });
    expect(branch).toHaveValue('main');
    expect(
      Array.from(branch.querySelectorAll('option')).map((option) => option.textContent)
    ).toEqual(['release', 'main']);
    expect(screen.getByRole('combobox', { name: 'Commit rule' })).toHaveValue('direct');
  });

  it('shows the rule of the branch picked in the dropdown', async () => {
    render(<ProjectBranchRulesSettings projectId="project-1" />);

    fireEvent.change(await screen.findByRole('combobox', { name: 'Branch' }), {
      target: { value: 'release' },
    });

    expect(screen.getByRole('combobox', { name: 'Commit rule' })).toHaveValue('review');
    expect(screen.getByText(/Custom policy/)).toBeVisible();
  });

  it('saves the rule for the selected branch', async () => {
    mocks.setBranchRule.mockResolvedValue({
      ref_name: 'main',
      require_independent_review: true,
      source: 'preset',
    });
    render(<ProjectBranchRulesSettings projectId="project-1" />);

    const rule = await screen.findByRole('combobox', { name: 'Commit rule' });
    fireEvent.change(rule, { target: { value: 'review' } });

    await waitFor(() => expect(rule).toHaveValue('review'));
    expect(mocks.setBranchRule).toHaveBeenCalledWith('project-1', 'main', true);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Branch rule for main updated');
  });

  it('keeps the saved rule and shows the error when saving fails', async () => {
    mocks.setBranchRule.mockRejectedValue(new Error('Policy administration requires a human'));
    render(<ProjectBranchRulesSettings projectId="project-1" />);

    const rule = await screen.findByRole('combobox', { name: 'Commit rule' });
    fireEvent.change(rule, { target: { value: 'review' } });

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(rule).toHaveValue('direct');
  });
});
