import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SemanticContent } from '@t3x-dev/core';
import { useCommandStore } from '@/store/commandStore';
import { useDraftStore } from '@/store/draftStore';

vi.mock('@/lib/api/trees', () => ({
  createYOpsEntry: vi.fn().mockResolvedValue({}),
}));

const emptyContent: SemanticContent = { trees: [], relations: [] };

describe('commandStore', () => {
  beforeEach(() => {
    useDraftStore.setState({
      draft: {
        trees: [{ key: 'trip', slots: { budget: '1000', duration: '5d' }, children: [] }],
        relations: [],
      },
      yopsLog: [],
      yopsHistory: [],
      removedNodes: [],
      feedYops: [],
      pipelineSteps: [],
      isExtracting: false,
      conversationId: 'conv_test',
      topics: [],
      activeTopicId: null,
      triggerExtract: null,
      manualEditedNodeIds: new Set(),
    });
    useCommandStore.setState({
      undoStack: [],
      redoStack: [],
      pendingOps: [],
    });
    vi.clearAllMocks();
  });

  it('execute applies ops, pushes to undoStack, clears redoStack', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000', source: '', from: '' } },
    ]);

    expect(useDraftStore.getState().draft.trees[0].slots.budget).toBe('2000');
    expect(useCommandStore.getState().undoStack).toHaveLength(1);
    expect(useCommandStore.getState().redoStack).toHaveLength(0);
  });

  it('execute tracks pendingOps', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000', source: '', from: '' } },
    ]);

    expect(useCommandStore.getState().pendingOps).toHaveLength(1);
    expect(useCommandStore.getState().hasPending).toBe(true);
  });

  it('undo restores previous state', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000', source: '', from: '' } },
    ]);
    expect(useDraftStore.getState().draft.trees[0].slots.budget).toBe('2000');

    useCommandStore.getState().undo();
    expect(useDraftStore.getState().draft.trees[0].slots.budget).toBe('1000');
    expect(useCommandStore.getState().undoStack).toHaveLength(0);
    expect(useCommandStore.getState().redoStack).toHaveLength(1);
  });

  it('redo re-applies undone operation', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000', source: '', from: '' } },
    ]);
    useCommandStore.getState().undo();
    useCommandStore.getState().redo();

    expect(useDraftStore.getState().draft.trees[0].slots.budget).toBe('2000');
    expect(useCommandStore.getState().undoStack).toHaveLength(1);
    expect(useCommandStore.getState().redoStack).toHaveLength(0);
  });

  it('new execute after undo clears redoStack', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000', source: '', from: '' } },
    ]);
    useCommandStore.getState().undo();

    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '3000', source: '', from: '' } },
    ]);

    expect(useCommandStore.getState().redoStack).toHaveLength(0);
    expect(useDraftStore.getState().draft.trees[0].slots.budget).toBe('3000');
  });

  it('pendingSummary counts edits/deletes/adds', () => {
    // Edit existing slot
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000', source: '', from: '' } },
    ]);
    // Delete slot
    useCommandStore.getState().execute([
      { unset: { path: 'trip/duration' } },
    ]);
    // Add new node
    useCommandStore.getState().execute([
      { add: { parent: '', node: { hotel: { stars: '5' } }, source: {}, from: '' } },
    ]);

    const summary = useCommandStore.getState().pendingSummary;
    expect(summary.edits).toBe(1);
    expect(summary.deletes).toBe(1);
    expect(summary.adds).toBe(1);
    expect(summary.total).toBe(3);
  });

  it('clearPending resets all stacks', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000', source: '', from: '' } },
    ]);
    useCommandStore.getState().clearPending();

    expect(useCommandStore.getState().undoStack).toHaveLength(0);
    expect(useCommandStore.getState().redoStack).toHaveLength(0);
    expect(useCommandStore.getState().pendingOps).toHaveLength(0);
    expect(useCommandStore.getState().hasPending).toBe(false);
  });

  it('undo removes ops from pendingOps', () => {
    useCommandStore.getState().execute([
      { set: { path: 'trip/budget', value: '2000', source: '', from: '' } },
    ]);
    expect(useCommandStore.getState().pendingOps).toHaveLength(1);

    useCommandStore.getState().undo();
    expect(useCommandStore.getState().pendingOps).toHaveLength(0);
  });
});
