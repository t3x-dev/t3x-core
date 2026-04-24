import type { SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import {
  buildLeafSemanticPointSummary,
  buildLeafSemanticPointSummaryByNode,
  deriveLeafSemanticPointItems,
  setLeafSemanticPointIncluded,
} from '@/domain/leaf/semanticPoints';
import type { LeafConfig } from '@/types/api';

const knowledge: SemanticContent = {
  trees: [
    {
      key: 'trip',
      slots: {
        city: 'Kyoto',
        duration: '2 days',
        pace: ['quiet', 'walkable'],
      },
      children: [
        {
          key: 'hotel',
          slots: {
            name: 'Sora House',
          },
          children: [],
        },
      ],
    },
  ],
  relations: [],
};

describe('deriveLeafSemanticPointItems', () => {
  it('derives deterministic point items with included state and owner node ids', () => {
    const items = deriveLeafSemanticPointItems(knowledge, {
      semantic_point_overrides: [{ point_id: 'trip/duration', state: 'excluded' }],
    });

    expect(items.map((item) => item.id)).toEqual([
      'trip',
      'trip/city',
      'trip/duration',
      'trip/pace[0]',
      'trip/pace[1]',
      'trip/hotel',
      'trip/hotel/name',
    ]);

    expect(items.find((item) => item.id === 'trip/duration')).toMatchObject({
      included: false,
      owner_node_id: 'trip',
      root_tree_id: 'trip',
    });
    expect(items.find((item) => item.id === 'trip/hotel/name')).toMatchObject({
      included: true,
      owner_node_id: 'trip.hotel',
      root_tree_id: 'trip',
    });
  });
});

describe('buildLeafSemanticPointSummary helpers', () => {
  it('builds total/included/excluded counts overall and per node', () => {
    const items = deriveLeafSemanticPointItems(knowledge, {
      semantic_point_overrides: [{ point_id: 'trip/duration', state: 'excluded' }],
    });

    expect(buildLeafSemanticPointSummary(items)).toEqual({
      total: 7,
      included: 6,
      excluded: 1,
    });

    const byNode = buildLeafSemanticPointSummaryByNode(items);
    expect(byNode.get('trip')).toEqual({
      total: 5,
      included: 4,
      excluded: 1,
    });
    expect(byNode.get('trip.hotel')).toEqual({
      total: 2,
      included: 2,
      excluded: 0,
    });
  });
});

describe('setLeafSemanticPointIncluded', () => {
  it('adds an excluded override when toggling a default-included point off', () => {
    const next = setLeafSemanticPointIncluded({}, 'trip/duration', false);

    expect(next.semantic_point_overrides).toEqual([
      { point_id: 'trip/duration', state: 'excluded' },
    ]);
  });

  it('removes the override when toggling a point back to included', () => {
    const config: LeafConfig = {
      semantic_point_overrides: [{ point_id: 'trip/duration', state: 'excluded' }],
    };

    const next = setLeafSemanticPointIncluded(config, 'trip/duration', true);

    expect(next.semantic_point_overrides).toEqual([]);
  });
});
