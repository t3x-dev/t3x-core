import { describe, expect, it } from 'vitest';
import {
  applyDraftOpsToCurrent,
  cardFromDraftOp,
  remainingStagedItems,
  selectedStagedItems,
  stageDraftOps,
  stagedManualReason,
  stagedObjectGroups,
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

  it('retains mixed ancestor fragments and their shared original operation', () => {
    const current = {
      tasks: [{ key: 'plane', slots: { done: false }, children: [] }],
      metadata: 'old',
    };
    const next = {
      tasks: [{ key: 'plane', slots: { done: true }, children: [] }],
      metadata: 'new',
    };
    const staged = stageDraftOps({ doc: current }, [{ set: { path: 'doc', value: next } }]);
    const groups = stagedObjectGroups(staged.items, { doc: current });
    expect(groups.map((group) => group.card.path)).toEqual([
      'doc/tasks/[key=plane]',
      'doc/metadata',
    ]);
    expect(
      groups.every((group) => group.items.length === 1 && group.items[0] === staged.items[0])
    ).toBe(true);
    expect(selectedStagedItems(staged.items)).toHaveLength(1);
  });

  it('groups an object without changing its original selection or save units, including net-zero edits', () => {
    const document = {
      tasks: [{ key: 'plane', slots: { goal: '开飞机', done: false }, children: [] }],
    };
    const operations = [
      { set: { path: 'tasks/[key=plane]/slots/done', value: true } },
      { set: { path: 'tasks/[key=plane]/slots/goal', value: '学习开飞机' } },
    ] as const;
    const staged = stageDraftOps(document, operations);
    staged.items[1].selected = false;
    const groups = stagedObjectGroups(staged.items, document);
    expect(groups).toHaveLength(1);
    expect(groups[0].card.path).toBe('tasks/[key=plane]');
    expect(groups[0].items).toEqual(staged.items);
    expect(selectedStagedItems(staged.items).map((item) => item.operation)).toEqual([
      operations[0],
    ]);
    const canceled = stageDraftOps(document, [
      operations[0],
      { set: { path: operations[0].set.path, value: false } },
    ]);
    const canceledGroups = stagedObjectGroups(canceled.items, document);
    expect(canceledGroups).toHaveLength(1);
    expect(canceledGroups[0].items).toHaveLength(2);
    expect(canceledGroups[0].card.before).toEqual(canceledGroups[0].card.after);
  });
});
