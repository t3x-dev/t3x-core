import type { SemanticContent, TreeDiff } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { buildAlignedNodes, buildDiffStatusMap } from '@/components/diff/DiffYAMLUtils';

const targetContent: SemanticContent = {
  trees: [
    {
      key: 'names',
      slots: {},
      children: [
        {
          key: 'eric',
          slots: {},
          children: [
            {
              key: 'notable_people',
              slots: {},
              children: [
                {
                  key: 'jay_chou',
                  slots: {
                    name: '周杰伦',
                    profession: '歌手、音乐人、导演',
                  },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  relations: [],
};

const slashPathDiff: TreeDiff = {
  identical: ['names', 'names/eric', 'names/eric/notable_people'],
  modified: [],
  onlyInSource: [],
  onlyInTarget: ['names/eric/notable_people/jay_chou'],
  relationsAdded: [],
  relationsRemoved: [],
};

describe('DiffYAMLUtils', () => {
  it('resolves slash diff paths to dot-path tree nodes for YAML rendering', () => {
    const aligned = buildAlignedNodes(slashPathDiff, undefined, targetContent);

    const added = aligned.find((node) => node.treeId === 'names/eric/notable_people/jay_chou');

    expect(added?.type).toBe('added');
    expect(added?.rightNode?.key).toBe('jay_chou');
    expect(added?.rightNode?.slots).toEqual({
      name: '周杰伦',
      profession: '歌手、音乐人、导演',
    });
  });

  it('indexes both slash and dot paths in diff status maps', () => {
    const statusMap = buildDiffStatusMap(slashPathDiff);

    expect(statusMap.get('names/eric/notable_people/jay_chou')).toBe('added');
    expect(statusMap.get('names.eric.notable_people.jay_chou')).toBe('added');
  });
});
