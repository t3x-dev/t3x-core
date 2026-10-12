import { describe, expect, it } from 'vitest';
import {
  applyDraftOpsToCurrent,
  cardFromDraftOp,
  remainingStagedItems,
  selectedStagedItems,
  stageDraftOps,
  stagedManualReason,
} from '@/domain/workspaces/manualStaging';

const current = { rollout: { allocation: 25, channel: 'stable' } };

describe('manualStaging', () => {
  it('applies each staged op locally and keeps a card per op', () => {
    const staged = stageDraftOps(current, [
      { set: { path: 'rollout/allocation', value: 30 } },
      { set: { path: 'rollout/regions', value: 'us' } },
    ]);
    expect(staged.current).toEqual({
      rollout: { allocation: 30, channel: 'stable', regions: 'us' },
    });
    expect(staged.items).toHaveLength(2);
    expect(staged.items.map((item) => item.card.path)).toEqual([
      'rollout/allocation',
      'rollout/regions',
    ]);
    expect(staged.items[0]?.card).toMatchObject({ before: 25, after: 30 });
    expect(staged.items[1]?.card).toMatchObject({ after: 'us' });
    expect(staged.items.every((item) => item.selected)).toBe(true);
  });

  it('splits selected cards from leftover ungrouped cards', () => {
    const staged = stageDraftOps(current, [
      { set: { path: 'rollout/allocation', value: 30 } },
      { unset: { path: 'rollout/channel' } },
    ]);
    staged.items[1]!.selected = false;
    expect(selectedStagedItems(staged.items).map((item) => item.card.path)).toEqual([
      'rollout/allocation',
    ]);
    expect(remainingStagedItems(staged.items).map((item) => item.card.path)).toEqual([
      'rollout/channel',
    ]);
    expect(stagedManualReason(selectedStagedItems(staged.items))).toBe('set rollout/allocation');
  });

  it('records rename before and after paths', () => {
    const next = applyDraftOpsToCurrent(current, [
      { rename: { path: 'rollout/channel', to: 'lane' } },
    ]);
    expect(
      cardFromDraftOp(current, next, { rename: { path: 'rollout/channel', to: 'lane' } })
    ).toEqual({
      nodeId: 'rollout/lane',
      path: 'rollout/lane',
      beforePath: 'rollout/channel',
      before: 'stable',
      after: 'stable',
    });
  });

  it('reads before and after values through index and match paths', () => {
    const document = {
      content: {
        trees: [{ key: 'candidate', slots: { priority: 'mu' }, children: [] }],
      },
    };
    const [byIndex] = stageDraftOps(document, [
      { set: { path: 'content/trees/[0]/slots/priority', value: 'must' } },
    ]).items;
    expect(byIndex?.card).toMatchObject({ before: 'mu', after: 'must' });
    const [byKey] = stageDraftOps(document, [
      { set: { path: 'content/trees/[key=candidate]/slots/priority', value: 'should' } },
    ]).items;
    expect(byKey?.card).toMatchObject({ before: 'mu', after: 'should' });
  });
});
