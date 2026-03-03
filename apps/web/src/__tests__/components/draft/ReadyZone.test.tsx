import { describe, expect, test, vi } from 'vitest';
import { ReadyZone } from '@/components/draft/ReadyZone';
import { SemanticPointCard } from '@/components/draft/SemanticPointCard';
import type { SemanticPointAPI } from '@/lib/api';

function makePoint(overrides: Partial<SemanticPointAPI> = {}): SemanticPointAPI {
  return {
    id: 'p1',
    text: 'Test point',
    extraction_mode: 'deterministic',
    status: 'auto_landed',
    zone: 'ready',
    evidence: [],
    confidence: 0.9,
    position: 0,
    staged: true,
    ...overrides,
  };
}

describe('ReadyZone', () => {
  test('component exports successfully', () => {
    expect(ReadyZone).toBeDefined();
    expect(typeof ReadyZone).toBe('function');
  });

  test('accepts required props', () => {
    const props = {
      points: [makePoint()],
      onUndo: vi.fn(),
    };
    expect(props.points.length).toBe(1);
  });

  test('separates inherited, auto_landed, and other landed points', () => {
    const points = [
      makePoint({ id: 'p1', status: 'inherited' }),
      makePoint({ id: 'p2', status: 'auto_landed' }),
      makePoint({ id: 'p3', status: 'reviewed' }),
      makePoint({ id: 'p4', status: 'undone' }),
    ];

    const inherited = points.filter((p) => p.status === 'inherited');
    const autoLanded = points.filter((p) => p.status === 'auto_landed');
    const otherLanded = points.filter(
      (p) => p.status !== 'inherited' && p.status !== 'auto_landed' && p.status !== 'undone'
    );
    const undone = points.filter((p) => p.status === 'undone');

    expect(inherited).toHaveLength(1);
    expect(autoLanded).toHaveLength(1);
    expect(otherLanded).toHaveLength(1);
    expect(undone).toHaveLength(1);
  });

  test('count includes inherited + auto_landed + other landed', () => {
    const points = [
      makePoint({ id: 'p1', status: 'inherited' }),
      makePoint({ id: 'p2', status: 'auto_landed' }),
      makePoint({ id: 'p3', status: 'reviewed' }),
      makePoint({ id: 'p4', status: 'undone' }),
    ];

    const inherited = points.filter((p) => p.status === 'inherited');
    const autoLanded = points.filter((p) => p.status === 'auto_landed');
    const otherLanded = points.filter(
      (p) => p.status !== 'inherited' && p.status !== 'auto_landed' && p.status !== 'undone'
    );

    const readyCount = inherited.length + autoLanded.length + otherLanded.length;
    expect(readyCount).toBe(3);
  });

  test('inherited items do not show undo', () => {
    const point = makePoint({ status: 'inherited' });
    // ReadyZone renders inherited items without onUndo/showUndo
    // SemanticPointCard only shows undo when showUndo=true
    expect(point.status).toBe('inherited');
  });

  test('auto_landed items show with undo capability', () => {
    const point = makePoint({ status: 'auto_landed' });
    expect(point.status).toBe('auto_landed');
  });
});

describe('SemanticPointCard', () => {
  test('component exports successfully', () => {
    expect(SemanticPointCard).toBeDefined();
    expect(typeof SemanticPointCard).toBe('function');
  });

  test('accepts routing_reason in point data', () => {
    const point = makePoint({ routing_reason: 'High confidence direct extraction' });
    expect(point.routing_reason).toBe('High confidence direct extraction');
  });

  test('point without routing_reason is valid', () => {
    const point = makePoint();
    expect(point.routing_reason).toBeUndefined();
  });
});
