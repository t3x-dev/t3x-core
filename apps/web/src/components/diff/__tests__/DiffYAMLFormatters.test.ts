// @ts-nocheck — tree-primary migration: test needs rework
import { describe, expect, it } from 'vitest';
import { formatRelation, formatSlotValue, renderFrameSlots } from '../DiffYAMLFormatters';

describe('formatSlotValue', () => {
  it('formats string', () => expect(formatSlotValue('hello')).toBe('"hello"'));
  it('formats number', () => expect(formatSlotValue(42)).toBe('42'));
  it('formats boolean', () => expect(formatSlotValue(true)).toBe('true'));
  it('formats ref', () => expect(formatSlotValue({ ref: 'f_001' } as any)).toBe('*f_001'));
  it('formats array', () => expect(formatSlotValue(['a', 'b'])).toBe('["a", "b"]'));
  it('formats undefined', () => expect(formatSlotValue(undefined)).toBe('(none)'));
  it('formats nested object', () => {
    const val = { key: 'value' };
    expect(formatSlotValue(val as any)).toBe(JSON.stringify(val));
  });
});

describe('renderFrameSlots', () => {
  it('renders slots as indented lines', () => {
    const frame = { id: 'f_001', type: 'plan', slots: { goal: 'travel', budget: 5000 } };
    const lines = renderFrameSlots(frame);
    expect(lines).toContain('  goal: "travel"');
    expect(lines).toContain('  budget: 5000');
  });
});

describe('formatRelation', () => {
  it('formats relation without confidence', () => {
    const r = { from: 'f_001', to: 'f_002', type: 'causes' as const };
    expect(formatRelation(r)).toBe('f_001 -[causes]-> f_002');
  });
  it('formats relation with confidence', () => {
    const r = { from: 'f_001', to: 'f_002', type: 'elaborates' as const, confidence: 0.85 };
    expect(formatRelation(r)).toBe('f_001 -[elaborates]-> f_002 (85%)');
  });
});
