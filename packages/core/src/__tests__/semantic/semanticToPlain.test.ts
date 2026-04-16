import { describe, expect, it } from 'vitest';
import { semanticToPlain } from '../../semantic/serialize';

describe('semanticToPlain', () => {
  it('converts a flat tree with slots', () => {
    const content = {
      trees: [{ key: 'app', slots: { name: 'web', port: 80 }, children: [] }],
      relations: [],
    };
    expect(semanticToPlain(content)).toEqual({
      app: { name: 'web', port: 80 },
    });
  });

  it('merges children as sub-keys alongside slots', () => {
    const content = {
      trees: [
        {
          key: 'services',
          slots: {},
          children: [
            { key: 'app', slots: { image: 'nginx:1.25' }, children: [] },
            { key: 'db', slots: { image: 'postgres:16' }, children: [] },
          ],
        },
      ],
      relations: [],
    };
    expect(semanticToPlain(content)).toEqual({
      services: {
        app: { image: 'nginx:1.25' },
        db: { image: 'postgres:16' },
      },
    });
  });

  it('produces an empty object for no trees', () => {
    expect(semanticToPlain({ trees: [], relations: [] })).toEqual({});
  });

  it('handles nested children recursively', () => {
    const content = {
      trees: [
        {
          key: 'a',
          slots: {},
          children: [
            {
              key: 'b',
              slots: { x: 1 },
              children: [{ key: 'c', slots: { y: 2 }, children: [] }],
            },
          ],
        },
      ],
      relations: [],
    };
    expect(semanticToPlain(content)).toEqual({
      a: { b: { x: 1, c: { y: 2 } } },
    });
  });
});
