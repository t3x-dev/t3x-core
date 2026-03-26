/**
 * Frame Test Factories (creates FlatNode instances for testing)
 *
 * Create test frames, trees, relations, and SemanticContent with sensible defaults.
 */

import type { FlatNode, Relation, SemanticContent, TreeNode } from '../../semantic/types';
import { flattenTree, flattenTrees, unflattenToTrees } from '../../semantic/tree';

let counter = 0;

function nextId(): string {
  return `f_${String(++counter).padStart(3, '0')}`;
}

/** Reset the ID counter (call in beforeEach if needed) */
export function resetFrameIds(): void {
  counter = 0;
}

/** Create a single frame with defaults */
export function createFrame(overrides: Partial<FlatNode> & { type: string }): FlatNode {
  return {
    id: overrides.id ?? nextId(),
    type: overrides.type,
    slots: overrides.slots ?? {},
    confidence: overrides.confidence ?? 0.9,
  };
}

/** Create a frame with string slots */
export function createFrameWithSlots(
  type: string,
  slots: Record<string, string | number | boolean>,
  id?: string
): FlatNode {
  return {
    id: id ?? nextId(),
    type,
    slots,
    confidence: 0.9,
  };
}

/** Create a relation between two frames */
export function createRelation(
  fromId: string,
  toId: string,
  type: Relation['type'] = 'depends'
): Relation {
  return { from: fromId, to: toId, type };
}

/**
 * Create a SemanticContent from frames.
 * Converts frames to trees via unflattenToTrees for tree-primary format.
 */
export function createSemanticContent(
  frames: FlatNode[],
  relations: Relation[] = []
): SemanticContent {
  const trees = unflattenToTrees(frames);
  return { trees, relations };
}

/** Create a typical test content with a few frames */
export function createTypicalContent(): SemanticContent {
  resetFrameIds();
  return createSemanticContent([
    createFrameWithSlots('travel_planning', {
      destination: 'Tokyo',
      duration: '2 weeks',
      budget: 5000,
    }),
    createFrameWithSlots('preference', {
      item: 'Japanese food',
      sentiment: 'likes',
    }),
    createFrameWithSlots('constraint', {
      type: 'budget',
      value: 'under $5000',
    }),
  ]);
}

/** Create content with duplicate frame types (for testing outputRegulator) */
export function createContentWithDuplicates(): SemanticContent {
  resetFrameIds();
  return createSemanticContent([
    createFrameWithSlots('city_recommendation', { city: 'Tokyo', reason: 'culture' }),
    createFrameWithSlots('city_recommendation', { city: 'Kyoto', reason: 'temples' }),
    createFrameWithSlots('city_recommendation', { city: 'Osaka', reason: 'food' }),
    createFrameWithSlots('budget', { amount: 5000, currency: 'USD' }),
  ]);
}

/** Create content with relations (for testing nester) */
export function createContentWithRelations(): SemanticContent {
  resetFrameIds();
  const parent = createFrameWithSlots('travel_plan', { destination: 'Japan' }, 'f_parent');
  const child1 = createFrameWithSlots('activity', { name: 'temple visit' }, 'f_child1');
  const child2 = createFrameWithSlots('activity', { name: 'food tour' }, 'f_child2');

  return createSemanticContent(
    [parent, child1, child2],
    [
      createRelation('f_child1', 'f_parent', 'depends'),
      createRelation('f_child2', 'f_parent', 'depends'),
    ]
  );
}

/** Create a simple depth-1 tree (concise mode) */
export function createConciseTree(): TreeNode {
  return {
    key: 'travel_planning',
    slots: { destination: 'Tokyo', duration: '2 weeks', budget: 5000 },
    children: [],
    confidence: 0.9,
    source: 'T1',
  };
}

/** Create a depth-2 tree (balanced mode) */
export function createBalancedTree(): TreeNode {
  return {
    key: 'hangzhou_trip',
    slots: { destination: 'Hangzhou', dates: 'May 1-3' },
    children: [
      { key: 'activity_plan', slots: { activities: ['West Lake', 'hiking'], duration: '2 days' }, children: [], source: 'T2', confidence: 0.85 },
      { key: 'dining', slots: { cuisine: 'local Hangzhou cuisine', budget: 500 }, children: [], source: 'T3', confidence: 0.9 },
    ],
    source: 'T1',
    confidence: 0.95,
  };
}

/** Create a depth-3 tree (detailed mode) */
export function createDetailedTree(): TreeNode {
  return {
    key: 'hangzhou_trip',
    slots: { destination: 'Hangzhou' },
    children: [
      {
        key: 'activity_plan',
        slots: { count: 3 },
        children: [
          { key: 'gear', slots: { rain_jacket: true, hiking_boots: true }, children: [] },
        ],
      },
      { key: 'dining', slots: { cuisine: 'local' }, children: [] },
    ],
  };
}

/** Create tree-native SemanticContent */
export function createTreeNativeContent(tree?: TreeNode): SemanticContent {
  const t = tree ?? createBalancedTree();
  return { trees: [t], relations: [] };
}
