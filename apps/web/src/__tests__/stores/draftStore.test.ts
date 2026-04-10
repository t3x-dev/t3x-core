// apps/web/src/__tests__/stores/draftStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SemanticContent, YOpsLogEntry } from '@t3x-dev/core';
import { useDraftStore } from '@/store/draftStore';
import { createYOpsEntry } from '@/lib/api/trees';

vi.mock('@/lib/api/trees', () => ({
  createYOpsEntry: vi.fn().mockResolvedValue({}),
}));

const mockedCreateYOpsEntry = vi.mocked(createYOpsEntry);

const emptyContent: SemanticContent = { trees: [], relations: [] };

describe('draftStore', () => {
  beforeEach(() => {
    useDraftStore.setState({
      draft: emptyContent,
      yopsLog: [],
      yopsHistory: [],
      removedNodes: [],
      isExtracting: false,
      conversationId: null,
      topics: [],
      activeTopicId: null,
      triggerExtract: null,
      manualEditedNodeIds: new Set(),
    });
    vi.clearAllMocks();
  });

  it('setDraft updates draft content', () => {
    const content: SemanticContent = {
      trees: [{ key: 'trip', slots: { budget: '1000' }, children: [] }],
      relations: [],
    };
    useDraftStore.getState().setDraft(content);
    expect(useDraftStore.getState().draft).toEqual(content);
  });

  it('applyYOps applies ops and updates yopsLog', () => {
    const content: SemanticContent = {
      trees: [{ key: 'trip', slots: { budget: '1000' }, children: [] }],
      relations: [],
    };
    useDraftStore.getState().setDraft(content);
    useDraftStore.getState().setConversationId('conv_test');

    useDraftStore.getState().applyYOps(
      [{ set: { path: 'trip/budget', value: '2000' } }],
      'manual',
    );

    expect(useDraftStore.getState().draft.trees[0].slots.budget).toBe('2000');
    expect(useDraftStore.getState().yopsLog).toHaveLength(1);
    expect(useDraftStore.getState().yopsLog[0].source).toBe('manual');
  });

  it('applyYOps persists ALL sources to DB (no filter)', async () => {
    mockedCreateYOpsEntry.mockClear();

    // Mock core applyYOps to guarantee ok:true (avoids CI build-order flakiness)
    const core = await import('@t3x-dev/core');
    const spy = vi.spyOn(core, 'applyYOps').mockReturnValue({
      ok: true,
      trees: [{ key: 'trip', slots: { budget: '2000' }, children: [] }],
      relations: [],
    });

    const content: SemanticContent = {
      trees: [{ key: 'trip', slots: { budget: '1000' }, children: [] }],
      relations: [],
    };
    useDraftStore.getState().setDraft(content);
    useDraftStore.getState().setConversationId('conv_test');

    useDraftStore.getState().applyYOps(
      [{ set: { path: 'trip/budget', value: '2000' } }],
      'pipeline',
    );

    // createYOpsEntry is called synchronously (fire-and-forget the returned promise)
    expect(mockedCreateYOpsEntry).toHaveBeenCalledWith(
      'conv_test',
      expect.any(Array),
      'pipeline',
    );

    spy.mockRestore();
  });

  it('applyYOps tracks manual edits in manualEditedNodeIds', () => {
    const content: SemanticContent = {
      trees: [{ key: 'trip', slots: { budget: '1000' }, children: [] }],
      relations: [],
    };
    useDraftStore.getState().setDraft(content);

    useDraftStore.getState().applyYOps(
      [{ set: { path: 'trip/budget', value: '2000' } }],
      'manual',
    );

    expect(useDraftStore.getState().manualEditedNodeIds.has('trip')).toBe(true);
  });

  it('applyYOps does not track non-manual edits', () => {
    const content: SemanticContent = {
      trees: [{ key: 'trip', slots: { budget: '1000' }, children: [] }],
      relations: [],
    };
    useDraftStore.getState().setDraft(content);

    useDraftStore.getState().applyYOps(
      [{ set: { path: 'trip/budget', value: '2000' } }],
      'pipeline',
    );

    expect(useDraftStore.getState().manualEditedNodeIds.size).toBe(0);
  });

  it('applyYOps maintains yopsHistory sliding window of 3', () => {
    const content: SemanticContent = {
      trees: [{ key: 'trip', slots: { budget: '1000' }, children: [] }],
      relations: [],
    };
    useDraftStore.getState().setDraft(content);

    for (let i = 0; i < 5; i++) {
      useDraftStore.getState().applyYOps(
        [{ set: { path: 'trip/budget', value: String(i) } }],
        'manual',
      );
    }

    expect(useDraftStore.getState().yopsHistory).toHaveLength(3);
  });

  it('resetDraft clears all draft state', () => {
    useDraftStore.getState().setDraft({
      trees: [{ key: 'trip', slots: {}, children: [] }],
      relations: [],
    });
    useDraftStore.getState().resetDraft();
    expect(useDraftStore.getState().draft).toEqual(emptyContent);
    expect(useDraftStore.getState().yopsLog).toEqual([]);
  });

  it('hydrateYOpsLog sets yopsLog from entries', () => {
    const entries: YOpsLogEntry[] = [
      { id: '1', source: 'pipeline', yops: [], created_at: '2026-01-01' },
    ];
    useDraftStore.getState().hydrateYOpsLog(entries);
    expect(useDraftStore.getState().yopsLog).toEqual(entries);
  });

  it('applyYOps silently fails on invalid ops', () => {
    const content: SemanticContent = {
      trees: [{ key: 'trip', slots: {}, children: [] }],
      relations: [],
    };
    useDraftStore.getState().setDraft(content);

    // append to a non-sequence path → fails
    useDraftStore.getState().applyYOps(
      [{ append: { path: 'trip', value: 'invalid' } }],
      'manual',
    );

    expect(useDraftStore.getState().draft.trees[0].key).toBe('trip');
    expect(useDraftStore.getState().yopsLog).toHaveLength(0);
  });
});
