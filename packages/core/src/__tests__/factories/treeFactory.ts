/**
 * Tree Test Factories (creates FlatNode instances for testing)
 *
 * Create test nodes, trees, relations, and SemanticContent with sensible defaults.
 */

import { flattenTree, flattenTrees, unflattenToTrees } from '../../semantic/tree';
import type { FlatNode, Relation, SemanticContent, TreeNode } from '../../semantic/types';

let counter = 0;

function nextId(): string {
  return `f_${String(++counter).padStart(3, '0')}`;
}

/** Reset the ID counter (call in beforeEach if needed) */
export function resetNodeIds(): void {
  counter = 0;
}
/** @deprecated Use resetNodeIds */
export const resetFrameIds = resetNodeIds;

/** Create a single node with defaults */
export function createNode(overrides: Partial<FlatNode> & { type: string }): FlatNode {
  return {
    id: overrides.id ?? nextId(),
    type: overrides.type,
    slots: overrides.slots ?? {},
  };
}
/** @deprecated Use createNode */
export const createFrame = createNode;

/** Create a node with string slots */
export function createNodeWithSlots(
  type: string,
  slots: Record<string, string | number | boolean>,
  id?: string
): FlatNode {
  return {
    id: id ?? nextId(),
    type,
    slots,
  };
}
/** @deprecated Use createNodeWithSlots */
export const createFrameWithSlots = createNodeWithSlots;

/** Create a relation between two nodes */
export function createRelation(
  fromId: string,
  toId: string,
  type: Relation['type'] = 'depends'
): Relation {
  return { from: fromId, to: toId, type };
}

/**
 * Create a SemanticContent from nodes.
 * Converts nodes to trees via unflattenToTrees for tree-primary format.
 */
export function createSemanticContent(
  nodes: FlatNode[],
  relations: Relation[] = []
): SemanticContent {
  const trees = unflattenToTrees(nodes);
  return { trees, relations };
}

/** Create a typical test content with a few nodes */
export function createTypicalContent(): SemanticContent {
  resetNodeIds();
  return createSemanticContent([
    createNodeWithSlots('travel_planning', {
      destination: 'Tokyo',
      duration: '2 weeks',
      budget: 5000,
    }),
    createNodeWithSlots('preference', {
      item: 'Japanese food',
      sentiment: 'likes',
    }),
    createNodeWithSlots('constraint', {
      type: 'budget',
      value: 'under $5000',
    }),
  ]);
}

/** Create content with duplicate node types (for testing outputRegulator) */
export function createContentWithDuplicates(): SemanticContent {
  resetNodeIds();
  return createSemanticContent([
    createNodeWithSlots('city_recommendation', { city: 'Tokyo', reason: 'culture' }),
    createNodeWithSlots('city_recommendation', { city: 'Kyoto', reason: 'temples' }),
    createNodeWithSlots('city_recommendation', { city: 'Osaka', reason: 'food' }),
    createNodeWithSlots('budget', { amount: 5000, currency: 'USD' }),
  ]);
}

/** Create content with relations (for testing nester) */
export function createContentWithRelations(): SemanticContent {
  resetNodeIds();
  const parent = createNodeWithSlots('travel_plan', { destination: 'Japan' }, 'f_parent');
  const child1 = createNodeWithSlots('activity', { name: 'temple visit' }, 'f_child1');
  const child2 = createNodeWithSlots('activity', { name: 'food tour' }, 'f_child2');

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
    source: 'T1',
  };
}

/** Create a depth-2 tree (balanced mode) */
export function createBalancedTree(): TreeNode {
  return {
    key: 'hangzhou_trip',
    slots: { destination: 'Hangzhou', dates: 'May 1-3' },
    children: [
      {
        key: 'activity_plan',
        slots: { activities: ['West Lake', 'hiking'], duration: '2 days' },
        children: [],
        source: 'T2',
      },
      {
        key: 'dining',
        slots: { cuisine: 'local Hangzhou cuisine', budget: 500 },
        children: [],
        source: 'T3',
      },
    ],
    source: 'T1',
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
        children: [{ key: 'gear', slots: { rain_jacket: true, hiking_boots: true }, children: [] }],
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
