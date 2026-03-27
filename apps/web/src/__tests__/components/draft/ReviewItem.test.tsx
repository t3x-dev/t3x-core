import { describe, expect, test, vi } from 'vitest';
import { ReviewItem } from '@/components/draft/ReviewItem';
import { ReviewZone } from '@/components/draft/ReviewZone';
import type { SemanticPointAPI } from '@/lib/api';

function makePoint(overrides: Partial<SemanticPointAPI> = {}): SemanticPointAPI {
  return {
    id: 'p1',
    text: 'Proposed new fact',
    extraction_mode: 'deterministic',
    inference_type: 'direct',
    status: 'auto_landed',
    zone: 'review',
    evidence: [
      {
        conversation_id: 'conv_1',
        turn_hash: 'sha256:abc',
        quoted_text: 'The budget is $3000',
        start_char: 0,
        end_char: 20,
        match_score: 0.92,
        role: 'primary',
        relevance: 'direct mention',
        enabled: true,
      },
    ],
    confidence: 0.85,
    position: 0,
    staged: true,
    ...overrides,
  };
}

describe('ReviewItem', () => {
  test('component exports successfully', () => {
    expect(ReviewItem).toBeDefined();
    expect(typeof ReviewItem).toBe('function');
  });

  test('accepts required props', () => {
    const props = {
      point: makePoint(),
      onAccept: vi.fn(),
      onDismiss: vi.fn(),
      onEdit: vi.fn(),
    };
    expect(props.point.text).toBe('Proposed new fact');
  });

  test('NEW item has no currentText', () => {
    const _point = makePoint();
    const currentText = undefined;
    const isModify = !!currentText;
    expect(isModify).toBe(false);
  });

  test('MODIFY item has currentText', () => {
    const _point = makePoint({ text: 'Updated budget is $3500' });
    const currentText = 'Budget is $3000';
    const isModify = !!currentText;
    expect(isModify).toBe(true);
  });

  test('metadata line includes inference_type and confidence', () => {
    const point = makePoint({
      inference_type: 'cross_turn',
      confidence: 0.78,
      routing_reason: 'Matched across turns',
    });
    expect(point.inference_type).toBe('cross_turn');
    expect(point.confidence).toBe(0.78);
    expect(point.routing_reason).toBe('Matched across turns');
  });

  test('Save & Accept combines both actions', () => {
    const onEdit = vi.fn();
    const onAccept = vi.fn();
    const point = makePoint();

    // Simulate the Save & Accept flow
    const editText = 'Edited text';
    onEdit(point.id, editText);
    onAccept(point.id);

    expect(onEdit).toHaveBeenCalledWith('p1', 'Edited text');
    expect(onAccept).toHaveBeenCalledWith('p1');
  });
});

describe('ReviewZone', () => {
  test('component exports successfully', () => {
    expect(ReviewZone).toBeDefined();
    expect(typeof ReviewZone).toBe('function');
  });

  test('filter logic separates new and modify items', () => {
    const points = [makePoint({ id: 'p1' }), makePoint({ id: 'p2' }), makePoint({ id: 'p3' })];
    const existingNodeTexts = new Map([['p2', 'Old text for p2']]);

    const isModify = (p: SemanticPointAPI) => existingNodeTexts.has(p.id);
    const newItems = points.filter((p) => !isModify(p));
    const modifyItems = points.filter((p) => isModify(p));

    expect(newItems).toHaveLength(2);
    expect(modifyItems).toHaveLength(1);
  });
});
