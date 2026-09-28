// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StateBranchControls } from '@/components/project/StateBranchControls';

function renderControls(overrides: Partial<Parameters<typeof StateBranchControls>[0]> = {}) {
  const onCreateBranch = vi.fn().mockResolvedValue(undefined);
  render(
    <StateBranchControls
      branch="main"
      branchOptions={['main', 'develop']}
      headCommitHash={null}
      onBranchChange={vi.fn()}
      onCreateBranch={onCreateBranch}
      showCreate={false}
      {...overrides}
    />
  );
  return { onCreateBranch };
}

describe('StateBranchControls create-from-search', () => {
  it('offers creating a missing branch from the current branch', async () => {
    const { onCreateBranch } = renderControls();

    fireEvent.click(screen.getByRole('button', { name: /Switch branches\/tags/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Find or create branch' }), {
      target: { value: '12331' },
    });

    const create = await screen.findByRole('menuitem', {
      name: 'Create branch 12331 from main',
    });
    expect(screen.queryByText('No matching branches.')).not.toBeInTheDocument();
    fireEvent.click(create);

    await waitFor(() => {
      expect(onCreateBranch).toHaveBeenCalledWith('12331', 'main');
    });
  });

  it('does not offer create when the typed name already exists', async () => {
    renderControls();

    fireEvent.click(screen.getByRole('button', { name: /Switch branches\/tags/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Find or create branch' }), {
      target: { value: 'develop' },
    });

    expect(screen.getByRole('menuitemradio', { name: /develop/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Create branch develop from main/ })
    ).not.toBeInTheDocument();
  });
});
