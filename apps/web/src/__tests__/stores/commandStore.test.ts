import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCommandStore } from '@/store/commandStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

vi.mock('@/lib/api/trees', () => ({
  createYOpsEntry: vi.fn().mockResolvedValue({}),
}));

describe('commandStore', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      tree: {
        trees: [{ key: 'trip', slots: { budget: '1000', duration: '5d' }, children: [] }],
        relations: [],
      },
    });
    useCommandStore.setState({
      undoStack: [],
      redoStack: [],
      pendingOps: [],
    });
    vi.clearAllMocks();
  });

  // Note: execute/undo/redo no longer mutate tree directly (applyYOps stubbed for Commit 5).
  // Tests below verify commandStore's own state tracking (undo/redo stacks, pendingOps).

  it('execute pushes to undoStack and clears redoStack', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000' } },
    ]);

    expect(useCommandStore.getState().undoStack).toHaveLength(1);
    expect(useCommandStore.getState().redoStack).toHaveLength(0);
  });

  it('execute tracks pendingOps', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000' } },
    ]);

    expect(useCommandStore.getState().pendingOps).toHaveLength(1);
    expect(useCommandStore.getState().hasPending).toBe(true);
  });

  it('undo moves entry from undoStack to redoStack', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000' } },
    ]);
    useCommandStore.getState().undo();

    expect(useCommandStore.getState().undoStack).toHaveLength(0);
    expect(useCommandStore.getState().redoStack).toHaveLength(1);
  });

  it('redo moves entry from redoStack back to undoStack', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000' } },
    ]);
    useCommandStore.getState().undo();
    useCommandStore.getState().redo();

    expect(useCommandStore.getState().undoStack).toHaveLength(1);
    expect(useCommandStore.getState().redoStack).toHaveLength(0);
  });

  it('new execute after undo clears redoStack', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000' } },
    ]);
    useCommandStore.getState().undo();

    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '3000' } },
    ]);

    expect(useCommandStore.getState().redoStack).toHaveLength(0);
  });

  it('pendingSummary counts edits/deletes/adds', () => {
    // Edit existing slot
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000' } },
    ]);
    // Delete slot
    useCommandStore.getState().execute([
      { unset: { path: 'trip/duration' } },
    ]);
    // Add new node
    useCommandStore.getState().execute([
      { define: { path: 'hotel' } },
    ]);

    const summary = useCommandStore.getState().pendingSummary;
    expect(summary.edits).toBe(1);
    expect(summary.deletes).toBe(1);
    expect(summary.adds).toBe(1);
    expect(summary.total).toBe(3);
  });

  it('clearPending resets all stacks', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000' } },
    ]);
    useCommandStore.getState().clearPending();

    expect(useCommandStore.getState().undoStack).toHaveLength(0);
    expect(useCommandStore.getState().redoStack).toHaveLength(0);
    expect(useCommandStore.getState().pendingOps).toHaveLength(0);
    expect(useCommandStore.getState().hasPending).toBe(false);
  });

  it('undo removes ops from pendingOps', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000' } },
    ]);
    expect(useCommandStore.getState().pendingOps).toHaveLength(1);

    useCommandStore.getState().undo();
    expect(useCommandStore.getState().pendingOps).toHaveLength(0);
  });
});
