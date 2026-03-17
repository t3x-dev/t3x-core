/**
 * Frame Test Factories
 *
 * Create test frames, relations, and SemanticContent with sensible defaults.
 */

import type { Frame, Relation, SemanticContent } from '../../semantic/types';

let counter = 0;

function nextId(): string {
  return `f_${String(++counter).padStart(3, '0')}`;
}

/** Reset the ID counter (call in beforeEach if needed) */
export function resetFrameIds(): void {
  counter = 0;
}

/** Create a single frame with defaults */
export function createFrame(overrides: Partial<Frame> & { type: string }): Frame {
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
): Frame {
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
  type: Relation['type'] = 'elaborates'
): Relation {
  return { from: fromId, to: toId, type };
}

/** Create a SemanticContent with frames and optional relations */
export function createSemanticContent(
  frames: Frame[],
  relations: Relation[] = []
): SemanticContent {
  return { frames, relations };
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
      createRelation('f_child1', 'f_parent', 'elaborates'),
      createRelation('f_child2', 'f_parent', 'elaborates'),
    ]
  );
}
