// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  type CommitChangeInspection,
  WorkspaceCommitChangeDetails,
} from '@/components/workspaces/WorkspaceCommitChangeDetails';
import { WorkspaceCommitHistoryPanel } from '@/components/workspaces/WorkspaceCommitHistoryPanel';
import type { ApiCommit } from '@/types/api';

const mocks = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock('@/hooks/workspaces/useWorkspaceCommitChanges', () => ({
  useWorkspaceCommitChanges: mocks.history,
}));
const commit = {
  hash: 'sha256:old',
  project_id: 'p',
  message: 'Saved owner',
  committed_at: '2026-10-22T01:00:00Z',
} as ApiCommit;
beforeEach(() =>
  mocks.history.mockReset().mockReturnValue({
    loading: false,
    data: {
      source: 'authoring',
      actions: [
        {
          action: {
            actionId: 'action',
            sequence: 1,
            actor: { id: 'human:local-user', kind: 'human' },
            channel: 'manual',
            reason: 'Set owner',
            publishedAt: '',
          },
          cards: [
            { nodeId: 'owner', path: 'owner', before: 'Old owner', after: 'Historical owner' },
          ],
          before: { owner: 'Old owner' },
          after: { owner: 'Historical owner' },
        },
      ],
      schemaCards: [],
      schemaReview: null,
      current: { owner: 'Historical owner' },
      nextBeforeSequence: null,
    },
  })
);
function HistoryWorkspace({ onReturn = vi.fn() }: { onReturn?: () => void }) {
  const [inspection, setInspection] = useState<CommitChangeInspection | null>(null);
  return (
    <>
      <main>
        <WorkspaceCommitHistoryPanel
          projectId="p"
          commit={commit}
          onReturn={onReturn}
          selectedId={inspection?.id}
          onInspect={setInspection}
        />
      </main>
      <aside aria-label="Details">
        <WorkspaceCommitChangeDetails inspection={inspection} />
      </aside>
    </>
  );
}
it('selects archived values into the shared right-hand Details without expanding the center', () => {
  const back = vi.fn();
  render(<HistoryWorkspace onReturn={back} />);
  expect(screen.getByText('Read-only · old')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Inspect Owner/ }));
  const details = screen.getByRole('complementary', { name: 'Details' });
  expect(within(details).getByText('Value at this Commit')).toBeVisible();
  expect(within(details).getByText('Selected action · A1')).toBeVisible();
  expect(within(details).getByText('Set owner')).toBeVisible();
  expect(
    within(screen.getByRole('main')).queryByText('Value at this Commit')
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Before this change')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Inspect Owner/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(
    screen.queryByRole('button', { name: /Confirm|Edit|Apply|Ask AI/ })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Return to current Draft' }));
  expect(back).toHaveBeenCalledOnce();
});
it('reads the value at the selected Commit, separately from the earlier action delta', () => {
  const state = mocks.history();
  state.data.current = { owner: 'Final committed owner' };
  render(<HistoryWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: /Inspect Owner/ }));
  const details = screen.getByRole('complementary', { name: 'Details' });
  expect(within(details).getByText('Final committed owner')).toBeVisible();
  expect(within(details).getByText('Historical owner')).toBeVisible();
});
it('reuses Schema Details on the right and removes live Draft and Studio actions', () => {
  const state = mocks.history();
  state.data.schemaCards = [
    {
      settingsId: 'schema',
      revision: 1,
      status: 'applied',
      schemaHash: 'base',
      settings: {
        action: 'add_slot',
        nodePath: 'product',
        name: 'advantage',
        definition: { type: 'string' },
        intent: 'Describe the advantage',
      },
    },
  ];
  render(<HistoryWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Inspect committed Schema advantage' }));
  const details = screen.getByRole('complementary', { name: 'Details' });
  expect(
    within(details).getByRole('region', { name: 'Selected Schema change details' })
  ).toBeVisible();
  expect(within(details).getByText('Describe the advantage')).toBeVisible();
  expect(within(details).getByText('Schema change included in this Commit.')).toBeVisible();
  expect(screen.queryByText('Saved to Draft')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Studio/ })).not.toBeInTheDocument();
  expect(
    within(screen.getByRole('main')).queryByText('Definition after selected change')
  ).not.toBeInTheDocument();
});
it('inspects Schema differences and the submitted snapshot on the right, not inline', () => {
  const state = mocks.history();
  state.data.schemaReview = {
    base: { status: 'bound', definition: { name: 'before' } },
    draft: { status: 'bound', definition: { name: 'after' } },
    changes: [{ kind: 'CHANGE', path: 'name', summary: 'renamed' }],
  };
  render(<HistoryWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Inspect committed Schema differences' }));
  const details = screen.getByRole('complementary', { name: 'Details' });
  expect(within(details).getByText('Schema at this Commit')).toBeVisible();
  expect(
    within(screen.getByRole('main')).queryByText('Full object comparison')
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Submitted content snapshot' }));
  expect(within(details).getByRole('region', { name: 'Committed snapshot details' })).toBeVisible();
});
it.each([
  { loading: true },
  { loading: false, error: 'Evidence missing' },
])('keeps Return available while loading or after failure', (state) => {
  mocks.history.mockReturnValue(state);
  const back = vi.fn();
  render(<HistoryWorkspace onReturn={back} />);
  fireEvent.click(screen.getByRole('button', { name: 'Return to current Draft' }));
  expect(back).toHaveBeenCalledOnce();
});
