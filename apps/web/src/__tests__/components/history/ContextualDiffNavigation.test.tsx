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
  return within(screen.getByRole('region', { name: 'State rows' }));
}

describe('Contextual diff navigation', () => {
  it('collapses deleted and changed descendants together without hiding siblings', () => {
    const state = mount();
    expect(state.getByText('obsolete')).toBeInTheDocument();
    fireEvent.click(state.getByRole('button', { name: 'Collapse api', exact: true }));
    expect(state.queryByText('obsolete')).not.toBeInTheDocument();
    expect(state.getByText('worker')).toBeInTheDocument();
    fireEvent.click(state.getByRole('button', { name: 'Expand api', exact: true }));
    expect(state.getByText('obsolete')).toBeInTheDocument();
    expect(state.getByText('3')).toBeInTheDocument();
  });

  it('searches within collapsed ancestors and inspects the matching change', () => {
    const state = mount();
    fireEvent.click(state.getByRole('button', { name: 'Collapse services', exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search historical state' }), {
      target: { value: 'services/api/replicas' },
    });
    fireEvent.click(state.getByText('replicas'));
    const inspector = within(
      screen.getByRole('complementary', { name: 'History change walkthrough' })
    );
    expect(inspector.getByText('3')).toBeInTheDocument();
    expect(inspector.getByText('1')).toBeInTheDocument();
  });
});
