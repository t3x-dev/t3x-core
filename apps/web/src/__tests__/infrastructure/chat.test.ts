import { describe, expect, it } from 'vitest';
import { frameData, splitSseFrames } from '@/infrastructure/chat';

describe('SSE frame parsing', () => {
  it('keeps a partial frame until its blank-line delimiter arrives', () => {
    const first = splitSseFrames('data: {"type":"text","content":"Serv');
    expect(first).toEqual({ frames: [], remaining: 'data: {"type":"text","content":"Serv' });

    const second = splitSseFrames(`${first.remaining}ice"}\n\ndata: {"type":"done"}`);
    expect(second.frames.map(frameData)).toEqual(['{"type":"text","content":"Service"}']);
    expect(second.remaining).toBe('data: {"type":"done"}');
  });

  it('flushes the trailing frame without a blank-line delimiter on the final read', () => {
    const { frames, remaining } = splitSseFrames('data: {"type":"done"}', true);
    expect(frames.map(frameData)).toEqual(['{"type":"done"}']);
    expect(remaining).toBe('');
  });

  it('ignores frames without data lines', () => {
    expect(frameData('event: ping')).toBeNull();
  });
});
