import { applyNativeYOps } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { compileSchemaContentMigration } from '../schema-authoring/content-migration';

describe('guarded Schema content migration', () => {
  it('removes complete semantic array nodes and blocks dangling relation endpoints without mutating input', () => {
    const base = {
      domain: 't3x.dev/semantic-content',
      content: {
        trees: [
          {
            key: 'candidate',
            slots: {},
            children: [
              {
                key: 'remove_me',
                slots: { title: 'Delete' },
                children: [{ key: 'child', slots: {}, children: [] }],
              },
              { key: 'keep', slots: { title: 'Keep' }, children: [] },
            ],
          },
        ],
        relations: [],
      },
    };
    const command = { kind: 'remove' as const, path: 'content/trees/[0]/children/[0]' };
    const result = compileSchemaContentMigration(base, 'candidate', [command]);
    expect(result.document).toEqual({
      ...base,
      content: {
        ...base.content,
        trees: [{ ...base.content.trees[0], children: [base.content.trees[0].children[1]] }],
      },
    });
    expect(result.operations).toContainEqual({ drop: { path: command.path } });
    expect(base.content.trees[0].children).toHaveLength(2);
    const related = {
      ...base,
      content: {
        ...base.content,
        relations: [{ from: 'candidate/remove_me/child', to: 'candidate/keep', type: 'links' }],
      },
    };
    expect(() => compileSchemaContentMigration(related, 'candidate', [command])).toThrow(
      'relation endpoint'
    );
    expect(related.content.trees[0].children).toHaveLength(2);
    expect(
      applyNativeYOps(
        { ...base, content: { ...base.content, concurrent: true } },
        result.operations
      ).ok
    ).toBe(false);
  });
  it('moves content, fills inputs and guards the complete existing root deterministically', () => {
    const base = {
      candidate: { requirements: { title: 'Preserved edit' }, tags: ['old'] },
      other: 1,
    };
    const commands = [
      { kind: 'move' as const, from: 'candidate/requirements', to: 'candidate/features' },
      { kind: 'set' as const, path: 'candidate/advantage', value: { title: 'Faster' } },
      { kind: 'append' as const, path: 'candidate/tags', value: 'new' },
    ];
    const a = compileSchemaContentMigration(base, 'candidate', commands);
    expect(compileSchemaContentMigration(base, 'candidate', commands)).toEqual(a);
    expect(a.operations[0]).toEqual({ assert: { path: '"candidate"', equals: base.candidate } });
    expect(a.document).toEqual({
      candidate: {
        features: base.candidate.requirements,
        advantage: { title: 'Faster' },
        tags: ['old', 'new'],
      },
      other: 1,
    });
    expect(base.candidate).not.toHaveProperty('features');
    expect(
      applyNativeYOps({ ...base, candidate: { ...base.candidate, concurrent: true } }, a.operations)
        .ok
    ).toBe(false);
  });
  it('renames a concrete semantic node without discarding its id, slots or children', () => {
    const node = { id: 'node-1', key: 'requirements', slots: { title: 'Edited' }, children: [] };
    const base = {
      domain: 't3x.dev/semantic-content',
      content: { trees: [{ key: 'candidate', slots: {}, children: [node] }], relations: [] },
    };
    const result = compileSchemaContentMigration(base, 'candidate', [
      {
        kind: 'rename_node',
        path: 'content/trees/[key=candidate]/children/[key=requirements]',
        toKey: 'features',
      },
    ]);
    expect(result.document).toMatchObject({
      content: { trees: [{ children: [{ ...node, key: 'features' }] }] },
    });
  });
  it('rejects out-of-bounds paths, overwriting destinations and partial failures without changing input', () => {
    const base = { candidate: { a: 1, b: 2 }, meta: 'preserve' };
    expect(() =>
      compileSchemaContentMigration(base, 'candidate', [
        { kind: 'set', path: 'meta', value: 'bad' },
      ])
    ).toThrow();
    expect(() =>
      compileSchemaContentMigration(base, 'candidate', [
        { kind: 'set', path: 'candidate/__proto__/polluted', value: true },
      ])
    ).toThrow();
    expect(() =>
      compileSchemaContentMigration(base, 'candidate', [
        { kind: 'move', from: 'candidate/a', to: 'candidate/b' },
      ])
    ).toThrow();
    expect(() =>
      compileSchemaContentMigration(base, 'candidate', [
        { kind: 'set', path: 'candidate/c', value: 3 },
        { kind: 'move', from: 'candidate/missing', to: 'candidate/d' },
      ])
    ).toThrow();
    expect(base).toEqual({ candidate: { a: 1, b: 2 }, meta: 'preserve' });
  });
  it('rejects duplicate semantic keys and requires explicit migration of affected relation endpoints', () => {
    const base = {
      domain: 't3x.dev/semantic-content',
      content: {
        trees: [
          {
            key: 'candidate',
            slots: {},
            children: [
              { key: 'requirements', slots: {}, children: [] },
              { key: 'other', slots: {}, children: [] },
            ],
          },
        ],
        relations: [{ from: 'candidate/requirements', to: 'candidate/other', type: 'depends_on' }],
      },
    };
    const rename = {
      kind: 'rename_node' as const,
      path: 'content/trees/[key=candidate]/children/[key=requirements]',
      toKey: 'features',
    };
    expect(() => compileSchemaContentMigration(base, 'candidate', [rename])).toThrow(
      'relation endpoint'
    );
    expect(() =>
      compileSchemaContentMigration(base, 'candidate', [{ ...rename, toKey: 'other' }])
    ).toThrow('duplicate');
    const mapped = compileSchemaContentMigration(base, 'candidate', [
      rename,
      { kind: 'set', path: 'content/relations/[0]/from', value: 'candidate/features' },
    ]);
    expect(mapped.document).toMatchObject({
      content: { relations: [{ from: 'candidate/features' }] },
    });
  });
});
