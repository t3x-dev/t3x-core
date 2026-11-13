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

it('prefers an existing match on Enter and navigates results by keyboard', () => {
  const change = vi.fn();
  const { onCreateBranch } = renderControls({ onBranchChange: change });
  fireEvent.click(screen.getByRole('button', { name: /Switch branches/ }));
  const search = screen.getByRole('textbox', { name: 'Find or create branch' });
  fireEvent.change(search, { target: { value: 'dev' } });
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  expect(screen.getByRole('menuitemradio', { name: /dev/i })).toHaveFocus();
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(change).toHaveBeenCalledWith('develop');
  expect(onCreateBranch).not.toHaveBeenCalled();
});

it('waits for the draft navigation guard before creating and keeps failures visible', async () => {
  let proceed: (() => void) | undefined;
  const create = vi.fn().mockRejectedValue(new Error('Branch source changed. Try again.'));
  renderControls({
    onCreateBranch: create,
    requestCreateNavigation: (next) => {
      proceed = next;
    },
  });
  fireEvent.click(screen.getByRole('button', { name: /Switch branches/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Find or create branch' }), {
    target: { value: 'feature/new' },
  });
  expect(screen.getByText(/Your draft stays on main/)).toBeVisible();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Create branch feature/new from main' }));
  expect(create).not.toHaveBeenCalled();
  proceed?.();
  await waitFor(() => expect(create).toHaveBeenCalledWith('feature/new', 'main'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Branch source changed. Try again.');
});

it('identifies a pinned commit in both search creation and the create dialog', () => {
  renderControls({ sourceCommitHash: 'sha256:abcdef0123456789', showCreate: true });
  fireEvent.click(screen.getByRole('button', { name: /Switch branches/ }));
  expect(screen.getByText(/Create from commit hash:abcdef0/)).toBeVisible();
  expect(screen.queryByText(/latest commit/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close branch switcher' }));
  fireEvent.click(screen.getByRole('button', { name: 'New branch' }));
  expect(screen.getByRole('dialog')).toHaveTextContent(/Start from commit hash:abcdef0/);
  expect(screen.getByRole('dialog')).not.toHaveTextContent('latest commit');
});
