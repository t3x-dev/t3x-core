import type { WorkspaceAuthoringAction } from '@t3x-dev/api-client';
import { applyYOps, type YOp } from '@t3x-dev/yops';
import { describe, expect, it } from 'vitest';
import {
  composeActionOperationItems,
  composeOperationStacks,
} from '@/domain/workspaces/composeOperationStacks';

function action(id: string, sequence: number, operations: YOp[]): WorkspaceAuthoringAction {
  return {
    actionId: id,
    sequence,
    channel: 'assistant',
    actor: { kind: 'service', id: 'generator' },
    publishedAt: `2026-11-12T0${sequence}:00:00Z`,
    beforeRevision: sequence - 1,
    afterRevision: sequence,
    operations,
  };
}

describe('recorded operation field stacks', () => {
  it('keeps two appends as two layers and projects each new slot as a set card', () => {
    const path = 'content/trees/[key=candidate]/children/[key=requirements]/children';
    const base = {
      content: {
        trees: [
          {
            key: 'candidate',
            slots: {},
            children: [{ key: 'requirements', slots: {}, children: [] }],
          },
        ],
        relations: [],
      },
    };
    const first: YOp = {
      append: {
        path,
        value: {
          key: 'learning_reminder',
          slots: { acceptance: '提醒学习', priority: 'should', title: '学习提醒' },
          children: [],
        },
      },
    };
    const second: YOp = {
      append: {
        path,
        value: { key: 'daily_review', slots: { title: '每日复习' }, children: [] },
      },
    };
    const afterFirst = applyYOps(base, [first]);
    expect(afterFirst.ok).toBe(true);
    const stacks = composeOperationStacks([
      ...composeActionOperationItems(action('a1', 1, [first]), base),
      ...composeActionOperationItems(action('a2', 2, [second]), afterFirst.doc),
    ]);
    expect(stacks).toHaveLength(1);
    expect(stacks[0]).toMatchObject({ name: 'append', path });
    expect(stacks[0]!.items).toHaveLength(2);
    expect(stacks[0]!.items[1]!.fields.map((field) => [field.op, field.path])).toEqual([
      ['set', `${path}/[key=learning_reminder]/slots/acceptance`],
      ['set', `${path}/[key=learning_reminder]/slots/priority`],
      ['set', `${path}/[key=learning_reminder]/slots/title`],
    ]);
    expect(stacks[0]!.items[0]!.fields).toEqual([
      expect.objectContaining({ op: 'set', after: '每日复习' }),
    ]);
  });

  it('shows drop and rename as field-level unset/set changes without assert cards', () => {
    const base = { settings: { legacy: { title: '旧设置', enabled: true } } };
    const drop: YOp = { drop: { path: 'settings/legacy' } };
    const rename: YOp = { rename: { path: 'settings/legacy', to: 'current' } };
    const stacks = composeOperationStacks([
      ...composeActionOperationItems(action('drop', 1, [drop]), base),
      ...composeActionOperationItems(action('rename', 2, [rename]), base),
    ]);
    expect(stacks.find((stack) => stack.name === 'drop')?.items[0]?.fields).toEqual([
      expect.objectContaining({ op: 'unset', path: 'settings/legacy/title' }),
      expect.objectContaining({ op: 'unset', path: 'settings/legacy/enabled' }),
    ]);
    expect(stacks.find((stack) => stack.name === 'rename')?.items[0]?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: 'unset', path: 'settings/legacy/title' }),
        expect.objectContaining({ op: 'set', path: 'settings/current/title' }),
      ])
    );
  });

  it('keeps nested slot values as one field card and hides recorded asserts', () => {
    const base = { candidate: { key: 'candidate', slots: {}, children: [] } };
    const operations: YOp[] = [
      { assert: { path: 'candidate', exists: true } },
      { set: { path: 'candidate/slots/config', value: { mode: 'guided', retries: 2 } } },
      { unset: { path: 'candidate/slots/config' } },
    ];
    const items = composeActionOperationItems(action('a1', 1, operations), base);
    expect(items.map((item) => item.name)).toEqual(['set', 'unset']);
    expect(items[0]!.fields).toEqual([
      expect.objectContaining({
        op: 'set',
        path: 'candidate/slots/config',
        after: { mode: 'guided', retries: 2 },
      }),
    ]);
    expect(items[1]!.fields).toEqual([
      expect.objectContaining({ op: 'unset', path: 'candidate/slots/config' }),
    ]);
  });
});
