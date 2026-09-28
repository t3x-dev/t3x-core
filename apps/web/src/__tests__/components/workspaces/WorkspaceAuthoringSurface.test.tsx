// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceAuthoringSurface } from '@/components/workspaces/WorkspaceAuthoringSurface';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';

const state = vi.hoisted(() => ({ value: null as any }));
vi.mock('@/hooks/workspaces/useWorkspaceAuthoring', () => ({
  useWorkspaceAuthoring: () => state.value,
}));
vi.mock('@/components/workspaces/WorkspaceAssistantPanel', () => ({
  WorkspaceAssistantPanel: () => <input aria-label="Preserved chat input" />,
}));
const card = (path: string, before: unknown, after: unknown) => ({
  nodeId: `node:${path}`,
  path,
  before,
  after,
});
const action = (n: number, channel: string, count: number) => ({
  actionId: `A${n}`,
  sequence: n,
  channel,
  actor: { kind: 'human', id: 'user:test' },
  publishedAt: `2026-09-01T00:00:0${n}.000Z`,
  beforeRevision: n - 1,
  afterRevision: n,
  operations: [],
  affectedNodeCount: count,
});
const a2 = [
  card('allocation', 20, 30),
  card('channel', '#ops', '#pilot'),
  card('replicas', 2, 4),
  card('timeout', 30, 45),
];
const a3 = [card('allocation', 30, 25), card('approval', false, true)];
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  const view = {
    workspaceRevision: 4,
    compositionRevision: 3,
    basis: { refName: 'main', refHead: null, baseDigest: 'sha256:a' },
    actions: [action(3, 'manual', 2), action(2, 'mcp', 4), action(1, 'assistant', 2)],
    selected: { action: action(3, 'manual', 2), cards: a3 },
    netDiff: [card('allocation', 10, 25)],
    nextBeforeSequence: null,
  };
  state.value = {
    view,
    newActivity: null,
    error: null,
    commands: {},
    load: vi.fn(async () => view),
    publish: vi.fn(async () => ({ kind: 'published' })),
    read: vi.fn(async (query: any) => ({
      ...view,
      selected: { action: action(2, 'mcp', 4), cards: a2 },
      node: query.node_id
        ? {
            nodeId: query.node_id,
            path: 'allocation',
            state: 'present',
            current: 25,
            entries: [{ ...action(2, 'mcp', 4), before: 20, after: 30, isSelected: true }],
          }
        : null,
    })),
  };
});
describe('V6-B immutable action surface', () => {
  it('renders only latest affected cards, then opens an old action without changing its delta', async () => {
    render(<WorkspaceAuthoringSurface candidate={getProjectWorkspaceStarterCandidate('p')} />);
    expect(screen.getByRole('region', { name: 'Action 3: Manual edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /channel.*ops/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /MCP update/ }));
    const old = screen.getByRole('region', { name: 'Action 2: MCP update' });
    await waitFor(() => expect(within(old).getAllByRole('button')).toHaveLength(5));
    fireEvent.click(within(old).getByRole('button', { name: /allocation/ }));
    await screen.findByRole('button', { name: 'Edit current value' });
    expect(within(old).getByRole('button', { name: /allocation/ })).toHaveTextContent('20');
    expect(within(old).getByRole('button', { name: /allocation/ })).toHaveTextContent('30');
  });
  it('preserves an edit and chat input when new activity arrives and side-panel modes change', async () => {
    const candidate = getProjectWorkspaceStarterCandidate('p');
    const rendered = render(<WorkspaceAuthoringSurface candidate={candidate} />);
    fireEvent.click(screen.getByRole('button', { name: /allocation/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit current value' }));
    fireEvent.change(screen.getByLabelText('Current value as JSON'), { target: { value: '28' } });
    fireEvent.click(screen.getByLabelText('Toggle Chat'));
    fireEvent.change(screen.getByLabelText('Preserved chat input'), {
      target: { value: 'Keep this question' },
    });
    fireEvent.click(screen.getByLabelText('Close side panel'));
    state.value = { ...state.value, newActivity: { workspaceRevision: 5, compositionRevision: 4 } };
    rendered.rerender(<WorkspaceAuthoringSurface candidate={candidate} />);
    expect(screen.getByLabelText('Current value as JSON')).toHaveValue('28');
    expect(screen.getByText(/New activity/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Toggle Chat'));
    expect(screen.getByLabelText('Preserved chat input')).toHaveValue('Keep this question');
  });
  it('saves a new guarded action rather than sending any historical action to overwrite', async () => {
    render(<WorkspaceAuthoringSurface candidate={getProjectWorkspaceStarterCandidate('p')} />);
    fireEvent.click(screen.getByRole('button', { name: /allocation/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit current value' }));
    fireEvent.change(screen.getByLabelText('Current value as JSON'), { target: { value: '27' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new action' }));
    await waitFor(() =>
      expect(state.value.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          expected_revision: 3,
          expected_workspace_revision: 4,
          expected_ref_head: null,
          operations: [{ set: { path: 'allocation', value: 27 } }],
        })
      )
    );
    expect(state.value.publish.mock.calls[0][0]).not.toHaveProperty('action_id');
  });
});
