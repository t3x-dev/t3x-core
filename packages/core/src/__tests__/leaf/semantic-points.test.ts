import { describe, expect, it } from 'vitest';
import {
  deriveLeafSemanticPoints,
  formatSelectedSemanticPoints,
  getIncludedLeafSemanticPoints,
} from '../../leaf/semantic-points';
import type { SemanticContent } from '../../semantic/types';
import type { Leaf } from '../../types';

const knowledge: SemanticContent = {
  trees: [
    {
      key: 'trip',
      slots: {
        city: 'Kyoto',
        duration: '2 days',
        pace: ['quiet', 'walkable'],
      },
      children: [],
    },
  ],
  relations: [],
};

const leaf: Leaf = {
  id: 'leaf_test',
  commit_hash: 'sha256:test',
  type: 'tweet',
  title: 'Kyoto trip',
  constraints: [],
  config: {},
  project_id: 'proj_test',
  created_at: '2026-04-24T00:00:00.000Z',
};

describe('deriveLeafSemanticPoints', () => {
  it('derives root, scalar, and array semantic points with stable ids', () => {
    const points = deriveLeafSemanticPoints(knowledge);

    expect(points.map((point) => point.id)).toEqual([
      'trip',
      'trip/city',
      'trip/duration',
      'trip/pace[0]',
      'trip/pace[1]',
    ]);

    expect(points.map((point) => point.label)).toEqual([
      'trip',
      'trip.city = Kyoto',
      'trip.duration = 2 days',
      'trip.pace = quiet',
      'trip.pace = walkable',
    ]);
  });
});

describe('getIncludedLeafSemanticPoints', () => {
  it('filters out excluded semantic points using leaf config overrides', () => {
    const selected = getIncludedLeafSemanticPoints(knowledge, {
      ...leaf.config,
      semantic_point_overrides: [{ point_id: 'trip/duration', state: 'excluded' }],
    });

    expect(selected.map((point) => point.id)).toEqual([
      'trip',
      'trip/city',
      'trip/pace[0]',
      'trip/pace[1]',
    ]);
    expect(selected.map((point) => point.label)).not.toContain('trip.duration = 2 days');
  });
});

describe('formatSelectedSemanticPoints', () => {
  it('adds a deselected-points instruction when some source points were excluded', () => {
    const selected = getIncludedLeafSemanticPoints(knowledge, {
      ...leaf.config,
      semantic_point_overrides: [{ point_id: 'trip/duration', state: 'excluded' }],
    });

    const formatted = formatSelectedSemanticPoints(selected, '## Selected Semantic Points', true);

    expect(formatted).toContain('Treat unlisted source facts as deselected background context');
  });
});
