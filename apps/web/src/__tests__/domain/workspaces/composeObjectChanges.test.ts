import type { TransitionProtocolValue, WorkspaceAuthoringCard } from '@t3x-dev/api-client';
import { describe, expect, it } from 'vitest';
import {
  composeObjectChangeCards,
  composeObjectFieldChanges,
  composeValuesEqual,
} from '@/domain/workspaces/composeObjectChanges';

const task = (
  slots: Record<string, TransitionProtocolValue> = { goal: '开飞机的任务', done: false },
  key = 'kaifeiji'
) => ({ key, slots, children: [] });
const document = (items: TransitionProtocolValue[]) => ({
  content: {
    trees: [
      { key: 'candidate', slots: {}, children: [{ key: 'items', slots: {}, children: items }] },
    ],
    relations: [],
  },
});
const path = 'content/trees/[key=candidate]/children/[key=items]/children/[key=kaifeiji]';

describe('object ownership projection', () => {
  it('gives field sets and whole-object replacement the same object row and complete differences', () => {
    const b = task();
    const a = task({ goal: '学习开飞机', done: true });
    const fields = [
      {
        nodeId: 'real-goal-id',
        path: `${path}/slots/goal`,
        before: b.slots.goal,
        after: a.slots.goal,
      },
      { nodeId: 'real-done-id', path: `${path}/slots/done`, before: false, after: true },
    ];
    const projected = composeObjectChangeCards(fields, document([b]), document([a]));
    const replaced = composeObjectChangeCards(
      [{ nodeId: 'real-object-id', path, before: b, after: a }],
      document([b]),
      document([a])
    );
    expect(projected).toHaveLength(1);
    expect(replaced).toHaveLength(1);
    expect(projected[0]).toMatchObject({ nodeId: 'real-goal-id', path, before: b, after: a });
    expect(projected[0].objectChange?.sources).toEqual(fields);
    expect(projected[0].objectChange?.sources[1]).toBe(fields[1]);
    expect(composeObjectFieldChanges(projected[0].before, projected[0].after)).toEqual(
      composeObjectFieldChanges(replaced[0].before, replaced[0].after)
    );
    expect(composeObjectFieldChanges(b, a).map((field) => field.key)).toEqual(['goal', 'done']);
  });

  it('descends collection wrappers and keeps additions/removals, own fields and empty containers', () => {
    const added = document([task()]);
    const rows = composeObjectChangeCards([
      { nodeId: 'bootstrap', path: 'content', after: added.content },
    ]);
    expect(rows.filter((row) => row.objectChange).map((row) => row.path)).toEqual([path]);
    expect(rows[0].before).toBeUndefined();
    expect(rows[0].after).toEqual(task());
    expect(
      composeObjectChangeCards([{ nodeId: 'deleted', path, before: task() }])[0].after
    ).toBeUndefined();
    expect(
      composeObjectChangeCards([
        { nodeId: 'empty', path: 'empty', after: { key: 'empty', slots: {}, children: [] } },
      ])
    ).toHaveLength(1);
    const titled = { ...added.content.trees[0], slots: { title: 'Weekly goals' } };
    expect(
      composeObjectChangeCards([{ nodeId: 'root', path: 'root', after: titled }]).filter(
        (row) => row.objectChange
      )
    ).toHaveLength(2);
    // A deleted child must not turn into its surviving collection container.
    const removed = composeObjectChangeCards(
      [{ nodeId: 'task', path, before: task() }],
      added,
      document([])
    );
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ path, before: task() });
    expect(removed[0].after).toBeUndefined();
  });

  it('does not merge identical keys across collections and reports all changed objects', () => {
    const b = { left: task(), right: task() };
    const a = {
      left: task({ goal: 'Left', done: true }),
      right: task({ goal: 'Right', done: false }),
    };
    expect(
      composeObjectChangeCards([{ nodeId: 'root', path: '', before: b, after: a }]).map(
        (row) => row.path
      )
    ).toEqual(['left', 'right']);
  });

  it('preserves false, zero, null, empty text/arrays and nested slots as whole fields', () => {
    const b = task({
      done: false,
      count: 0,
      note: null,
      text: '',
      tags: [],
      nested: { a: 1, b: 2 },
    });
    const a = task({ nested: { a: 3, b: 4 } });
    const differences = composeObjectFieldChanges(b, a);
    expect(differences.map((field) => [field.key, field.before, field.after])).toEqual([
      ['done', false, undefined],
      ['count', 0, undefined],
      ['note', null, undefined],
      ['text', '', undefined],
      ['tags', [], undefined],
      ['nested', { a: 1, b: 2 }, { a: 3, b: 4 }],
    ]);
    expect(
      composeObjectChangeCards([{ nodeId: 'object', path, before: b, after: a }])
    ).toHaveLength(1);
    expect(composeValuesEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('keeps mixed ancestor changes and ordering visible rather than dropping non-node content', () => {
    const b = document([task()]);
    const a = document([task({ goal: '开飞机的任务', done: true })]);
    const after: TransitionProtocolValue = {
      ...a,
      content: { ...a.content, relations: [{ key: 'r', from: 'a', to: 'b' }] },
    };
    const rows = composeObjectChangeCards([{ nodeId: 'content', path: '', before: b, after }]);
    expect(rows.some((row) => row.path === path)).toBe(true);
    expect(rows.some((row) => row.path.startsWith('content/relations'))).toBe(true);
    const parent = { key: 'parent', slots: {}, children: [task({}, 'a'), task({}, 'b')] };
    const order = composeObjectChangeCards([
      {
        nodeId: 'parent',
        path: 'parent',
        before: parent,
        after: { ...parent, children: [...parent.children].reverse() },
      },
    ]);
    expect(order).toHaveLength(1);
    expect(composeObjectFieldChanges(order[0].before, order[0].after)[0]).toMatchObject({
      key: 'children',
      before: ['a', 'b'],
      after: ['b', 'a'],
    });
  });

  it('uses explicit relocation records and retains their real identities', () => {
    const b = { old: task() };
    const a = { next: task() };
    const source = {
      nodeId: 'actual-lineage',
      path: 'next',
      beforePath: 'old',
      afterPath: 'next',
      before: b.old,
      after: a.next,
    };
    const rows = composeObjectChangeCards([source], b, a);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      nodeId: 'actual-lineage',
      beforePath: 'old',
      afterPath: 'next',
    });
    expect(rows[0].objectChange?.sources).toEqual([source]);
    const unknown = composeObjectChangeCards([
      { nodeId: 'ancestor', path: '', before: b, after: a },
    ]);
    expect(unknown).toHaveLength(2);
  });

  it('normalizes indexed and quoted locations for display without rewriting original records', () => {
    const b = document([task()]);
    const a = document([task({ goal: '开飞机的任务', done: true })]);
    const source = {
      nodeId: 'indexed',
      path: 'content/trees/[0]/children/[0]/children/[0]/slots/done',
      before: false,
      after: true,
    };
    const rows = composeObjectChangeCards([source], b, a);
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe(path);
    expect(rows[0].objectChange?.sources[0]).toBe(source);
    const quoted = { 'a/b': task({ 'x/y': false }, 'a/b') };
    const next = { 'a/b': task({ 'x/y': true }, 'a/b') };
    expect(
      composeObjectChangeCards(
        [{ nodeId: 'quoted', path: '"a/b"/slots/"x/y"', before: false, after: true }],
        quoted,
        next
      )[0].path
    ).toBe('"a/b"');
  });

  it('keeps legacy data when snapshots cannot establish an owner and never mutates inputs', () => {
    const scalar = Object.freeze({
      nodeId: 'legacy',
      path: `${path}/slots/done`,
      before: false,
      after: true,
    });
    expect(composeObjectChangeCards([scalar])).toEqual([scalar]);
    const original: WorkspaceAuthoringCard = Object.freeze({
      nodeId: 'object',
      path,
      before: task(),
      after: task({ goal: '开飞机的任务', done: true }),
    });
    const once = composeObjectChangeCards([original]);
    expect(composeObjectChangeCards(once)[0]).toBe(once[0]);
    expect(original).not.toHaveProperty('objectChange');
  });

  it('keeps ambiguous child identities visible as a structure difference', () => {
    const parent = { key: 'items', slots: {}, children: [task({}, 'same'), task({}, 'same')] };
    const after = { ...parent, children: [parent.children[0], task({ done: true }, 'same')] };
    const rows = composeObjectChangeCards([
      { nodeId: 'items', path: 'items', before: parent, after },
    ]);
    expect(rows).toHaveLength(1);
    expect(composeObjectFieldChanges(rows[0].before, rows[0].after)).toEqual([
      { scope: 'structure', key: 'children', before: parent.children, after: after.children },
    ]);
  });

  it('keeps descendants with an explicitly moved object without merging an unrelated same-key sibling', () => {
    const child = task({ done: false }, 'child');
    const original = { key: 'group', slots: { title: 'Group' }, children: [child] };
    const moved = { ...original, children: [{ ...child, slots: { done: true } }] };
    const b = { old: original, other: task({}, 'child') };
    const a = { destination: { next: moved }, other: b.other };
    const rows = composeObjectChangeCards(
      [
        {
          nodeId: 'real-group-id',
          path: 'destination/next',
          beforePath: 'old',
          afterPath: 'destination/next',
          before: original,
          after: moved,
        },
      ],
      b,
      a
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.beforePath, row.afterPath])).toEqual([
      ['old', 'destination/next'],
      ['old/children/[key=child]', 'destination/next/children/[key=child]'],
    ]);
    expect(rows.every((row) => row.nodeId === 'real-group-id')).toBe(true);
  });
});
