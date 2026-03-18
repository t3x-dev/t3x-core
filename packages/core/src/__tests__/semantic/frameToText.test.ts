import { describe, expect, it } from 'vitest';
import {
  framesToNumberedText,
  framesToTextSegments,
  frameToText,
} from '../../semantic/frameToText';
import type { Frame, SemanticContent } from '../../semantic/types';

describe('frameToText', () => {
  it('converts a simple frame to text', () => {
    const frame: Frame = {
      id: 'f_001',
      type: 'travel_plan',
      slots: { destination: 'Tokyo', duration: '2 weeks' },
    };
    const result = frameToText(frame);
    expect(result.id).toBe('f_001');
    expect(result.text).toBe('[travel_plan] destination: Tokyo; duration: 2 weeks');
  });

  it('converts numeric slot values', () => {
    const frame: Frame = { id: 'f_001', type: 'budget', slots: { amount: 5000, currency: 'USD' } };
    expect(frameToText(frame).text).toBe('[budget] amount: 5000; currency: USD');
  });

  it('converts array slot values', () => {
    const frame: Frame = {
      id: 'f_001',
      type: 'prefs',
      slots: { foods: ['sushi', 'ramen'] as any },
    };
    expect(frameToText(frame).text).toBe('[prefs] foods: sushi, ramen');
  });

  it('converts InlineFrame slot values', () => {
    const frame: Frame = {
      id: 'f_001',
      type: 'plan',
      slots: {
        activity: { type: 'activity', slots: { name: 'temple visit' } } as any,
      },
    };
    expect(frameToText(frame).text).toBe('[plan] activity: [activity] name: temple visit');
  });

  it('converts SlotRef values', () => {
    const frame: Frame = { id: 'f_001', type: 'plan', slots: { related: { ref: 'f_002' } as any } };
    expect(frameToText(frame).text).toBe('[plan] related: →f_002');
  });

  it('handles empty slots', () => {
    const frame: Frame = { id: 'f_001', type: 'empty', slots: {} };
    expect(frameToText(frame).text).toBe('[empty] ');
  });
});

describe('framesToTextSegments', () => {
  it('converts multiple frames', () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'a', slots: { x: 1 } },
        { id: 'f_002', type: 'b', slots: { y: 'hello' } },
      ],
      relations: [],
    };
    const segments = framesToTextSegments(content);
    expect(segments).toHaveLength(2);
    expect(segments[0].id).toBe('f_001');
    expect(segments[1].id).toBe('f_002');
  });

  it('returns empty array for empty content', () => {
    expect(framesToTextSegments({ frames: [], relations: [] })).toEqual([]);
  });
});

describe('framesToNumberedText', () => {
  it('produces numbered list like sentence format', () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'travel', slots: { dest: 'Tokyo' } },
        { id: 'f_002', type: 'budget', slots: { amount: 5000 } },
      ],
      relations: [],
    };
    const text = framesToNumberedText(content);
    expect(text).toBe('1. [travel] dest: Tokyo\n2. [budget] amount: 5000');
  });
});
