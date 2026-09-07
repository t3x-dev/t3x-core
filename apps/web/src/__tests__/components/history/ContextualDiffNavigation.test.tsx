// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CommitHistoryDiffView } from '@/components/history/CommitHistoryDiffView';
import type { ApiCommit } from '@/types/api';

const parent: ApiCommit = {
  author: { type: 'human', name: 'Reviewer' },
  branch: 'main',
  committed_at: '2026-09-07T00:00:00Z',
  hash: 'sha256:base',
  message: 'Service configuration',
  parents: [],
  project_id: 'test',
  provenance: { method: 'workspace' },
  schema: 't3x/commit/v2',
  sources: [],
  content: {
    relations: [],
    trees: [
      {
        key: 'services',
        slots: {},
        children: [
          { key: 'api', slots: { replicas: 1, obsolete: false }, children: [] },
          { key: 'worker', slots: { replicas: 2 }, children: [] },
        ],
      },
    ],
  },
};
const head: ApiCommit = {
  ...parent,
  hash: 'sha256:head',
  parents: [parent.hash],
  content: {
    relations: [],
    trees: [
      {
        key: 'services',
        slots: {},
        children: [
          { key: 'api', slots: { replicas: 3 }, children: [] },
          { key: 'worker', slots: { replicas: 2 }, children: [] },
        ],
      },
    ],
  },
};

function mount() {
  render(<CommitHistoryDiffView commit={head} parentCommit={parent} onBack={() => undefined} />);
  return within(screen.getByRole('region', { name: 'Changed nodes' }));
}

describe('Contextual diff navigation', () => {
  it('collapses a subtree without hiding its siblings or the deleted change', () => {
    const state = mount();
    fireEvent.click(state.getByRole('button', { name: 'Collapse state services/api' }));
    expect(
      state.queryByRole('button', { name: 'Inspect services/api/replicas' })
    ).not.toBeInTheDocument();
    expect(state.getByText('worker')).toBeInTheDocument();
    expect(state.getByText('services/api/obsolete')).toBeInTheDocument();
    fireEvent.click(state.getByRole('button', { name: 'Expand state services/api' }));
    expect(
      state.getByRole('button', { name: 'Inspect services/api/replicas' })
    ).toBeInTheDocument();
  });

  it('reveals the selected changed path inside collapsed ancestors', () => {
    const state = mount();
    fireEvent.click(state.getByRole('button', { name: 'Collapse state services' }));
    const paths = within(screen.getByRole('tree', { name: 'Changed state paths' }));
    fireEvent.click(paths.getByRole('button', { name: 'replicas' }));
    expect(state.getByRole('button', { name: 'Inspect services/api/replicas' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const after = screen.getByText('After').closest('section');
    expect(within(after!).getByText('3')).toBeInTheDocument();
  });
});
