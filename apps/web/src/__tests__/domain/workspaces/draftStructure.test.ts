import { describe, expect, it } from 'vitest';
import {
  availableDraftOps,
  buildDraftOp,
  createDraftChildOp,
  deleteDraftOp,
  editDraftOp,
  parseDraftValue,
  walkDraftStructure,
} from '@/domain/workspaces/draftStructure';

const envelope = {
  domain: 't3x.dev/semantic-content',
  version: 1,
  content: {
    trees: [
      {
        key: 'prd',
        slots: {},
        children: [
          {
            key: 'rollout',
            slots: { allocation: 25, canary: true },
            children: [],
          },
        ],
      },
    ],
    relations: [],
  },
};

describe('draftStructure', () => {
  it('walks a semantic envelope with authoring paths', () => {
    const nodes = walkDraftStructure(envelope);
    expect(nodes.map((node) => node.path)).toEqual([
      'content/trees',
      'content/trees/[key=prd]',
      'content/trees/[key=prd]/children/[key=rollout]',
      'content/trees/[key=prd]/children/[key=rollout]/slots/allocation',
      'content/trees/[key=prd]/children/[key=rollout]/slots/canary',
    ]);
    expect(nodes.find((node) => node.key === 'allocation')?.kind).toBe('scalar');
    expect(nodes.find((node) => node.key === 'rollout')?.kind).toBe('tree');
  });

  it('builds create, edit, and delete ops from structure context', () => {
    const rollout = walkDraftStructure(envelope).find((node) => node.key === 'rollout')!;
    expect(createDraftChildOp(rollout, 'channel', 'field', 'stable')).toEqual({
      set: {
        path: 'content/trees/[key=prd]/children/[key=rollout]/slots/channel',
        value: 'stable',
      },
    });
    expect(createDraftChildOp(rollout, 'regions', 'node', '')).toEqual({
      append: {
        path: 'content/trees/[key=prd]/children/[key=rollout]/children',
        value: { key: 'regions', slots: {}, children: [] },
      },
    });
    expect(
      editDraftOp('content/trees/[key=prd]/children/[key=rollout]/slots/allocation', 30)
    ).toEqual({
      set: {
        path: 'content/trees/[key=prd]/children/[key=rollout]/slots/allocation',
        value: 30,
      },
    });
    expect(deleteDraftOp('content/trees/[key=prd]/children/[key=rollout]/slots/canary')).toEqual({
      unset: { path: 'content/trees/[key=prd]/children/[key=rollout]/slots/canary' },
    });
    expect(deleteDraftOp('content/trees/[key=prd]/children/[key=rollout]')).toEqual({
      drop: { path: 'content/trees/[key=prd]/children/[key=rollout]' },
    });
    expect(
      editDraftOp('content/trees/[key=prd]/children/[key=item2]', 'second item', envelope)
    ).toEqual({
      append: {
        path: 'content/trees/[key=prd]/children',
        value: { key: 'item2', slots: { value: 'second item' }, children: [] },
      },
    });
    expect(
      editDraftOp('content/trees/[key=prd]/children/[key=rollout]', 'Canary rollout', envelope)
    ).toEqual({
      set: {
        path: 'content/trees/[key=prd]/children/[key=rollout]/slots/title',
        value: 'Canary rollout',
      },
    });
  });

  it('covers all 18 YOps', () => {
    expect(buildDraftOp('define', { path: 'rollout/next' })).toEqual({
      define: { path: 'rollout/next' },
    });
    expect(buildDraftOp('drop', { path: 'rollout/next' })).toEqual({
      drop: { path: 'rollout/next' },
    });
    expect(buildDraftOp('rename', { path: 'rollout/next', to: 'later' })).toEqual({
      rename: { path: 'rollout/next', to: 'later' },
    });
    expect(buildDraftOp('set', { path: 'rollout/allocation', value: 30 })).toEqual({
      set: { path: 'rollout/allocation', value: 30 },
    });
    expect(buildDraftOp('unset', { path: 'rollout/allocation' })).toEqual({
      unset: { path: 'rollout/allocation' },
    });
    expect(buildDraftOp('populate', { path: 'rollout', values: { channel: 'stable' } })).toEqual({
      populate: { path: 'rollout', values: { channel: 'stable' } },
    });
    expect(buildDraftOp('append', { path: 'regions', value: 'us' })).toEqual({
      append: { path: 'regions', value: 'us' },
    });
    expect(buildDraftOp('move', { from: 'rollout/a', to: 'rollout/b' })).toEqual({
      move: { from: 'rollout/a', to: 'rollout/b' },
    });
    expect(buildDraftOp('clone', { path: 'rollout/a', to: 'rollout/b' })).toEqual({
      clone: { from: 'rollout/a', to: 'rollout/b' },
    });
    expect(buildDraftOp('nest', { path: 'rollout', keys: ['a'], under: 'group' })).toEqual({
      nest: { path: 'rollout', keys: ['a'], under: 'group' },
    });
    expect(buildDraftOp('split', { path: 'rollout', into: { left: ['a'] } })).toEqual({
      split: { path: 'rollout', into: { left: ['a'] } },
    });
    expect(buildDraftOp('fold', { path: 'rollout/group' })).toEqual({
      fold: { path: 'rollout/group' },
    });
    expect(buildDraftOp('merge', { path: 'rollout', keys: ['a'], into: 'group' })).toEqual({
      merge: { path: 'rollout', keys: ['a'], into: 'group' },
    });
    expect(buildDraftOp('sort', { path: 'regions', by: 'key', order: 'desc' })).toEqual({
      sort: { path: 'regions', by: 'key', order: 'desc' },
    });
    expect(buildDraftOp('unique', { path: 'regions' })).toEqual({ unique: { path: 'regions' } });
    expect(buildDraftOp('pick', { path: 'rollout', keys: ['a'] })).toEqual({
      pick: { path: 'rollout', keys: ['a'] },
    });
    expect(buildDraftOp('omit', { path: 'rollout', keys: ['a'] })).toEqual({
      omit: { path: 'rollout', keys: ['a'] },
    });
    expect(buildDraftOp('assert', { path: 'rollout', exists: true, type: 'mapping' })).toEqual({
      assert: { path: 'rollout', exists: true, type: 'mapping' },
    });
  });

  it('lists mapping and sequence ops without a form catalog', () => {
    const rollout = walkDraftStructure(envelope).find((node) => node.key === 'rollout')!;
    const trees = walkDraftStructure(envelope)[0]!;
    expect(availableDraftOps(rollout)).toEqual([]);
    expect(availableDraftOps(trees)).toEqual(['rename', 'sort', 'unique']);
    expect(parseDraftValue('30')).toBe(30);
    expect(parseDraftValue('true')).toBe(true);
  });
});
