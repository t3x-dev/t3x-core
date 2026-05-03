// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScrollToTurn } from '@/hooks/shared/useScrollToTurn';

describe('useScrollToTurn', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // jsdom doesn't implement scrollIntoView; stub it so the hook's
    // call doesn't blow up the test (we only assert it was called).
    Element.prototype.scrollIntoView = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('finds the chat element by data-turn-hash and scrolls it into view', () => {
    const turn = document.createElement('div');
    turn.setAttribute('data-turn-hash', 'sha256:t1');
    document.body.appendChild(turn);

    const { result } = renderHook(() => useScrollToTurn());
    const ok = result.current('sha256:t1');

    expect(ok).toBe(true);
    expect(turn.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('returns false when no element matches the turn hash', () => {
    const { result } = renderHook(() => useScrollToTurn());
    const ok = result.current('sha256:missing');
    expect(ok).toBe(false);
  });

  it('applies a temporary highlight attribute that clears after the timeout', () => {
    const turn = document.createElement('div');
    turn.setAttribute('data-turn-hash', 'sha256:t1');
    document.body.appendChild(turn);

    const { result } = renderHook(() => useScrollToTurn());
    result.current('sha256:t1');

    expect(turn.getAttribute('data-scroll-highlight')).toBe('true');

    vi.advanceTimersByTime(1500);
    expect(turn.getAttribute('data-scroll-highlight')).toBeNull();
  });

  it('skips highlight when opts.highlight === false', () => {
    const turn = document.createElement('div');
    turn.setAttribute('data-turn-hash', 'sha256:t1');
    document.body.appendChild(turn);

    const { result } = renderHook(() => useScrollToTurn());
    result.current('sha256:t1', { highlight: false });

    expect(turn.getAttribute('data-scroll-highlight')).toBeNull();
    expect(turn.scrollIntoView).toHaveBeenCalled();
  });

  it('a later click on a different turn moves the highlight without clearing the new one prematurely', () => {
    const t1 = document.createElement('div');
    t1.setAttribute('data-turn-hash', 'sha256:t1');
    const t2 = document.createElement('div');
    t2.setAttribute('data-turn-hash', 'sha256:t2');
    document.body.append(t1, t2);

    const { result } = renderHook(() => useScrollToTurn());
    result.current('sha256:t1');
    expect(t1.getAttribute('data-scroll-highlight')).toBe('true');

    // 500ms later, click t2.
    vi.advanceTimersByTime(500);
    result.current('sha256:t2');
    expect(t2.getAttribute('data-scroll-highlight')).toBe('true');

    // t1's original timer fires at 1500ms total — should clear t1's
    // attribute (which is still 'true').
    vi.advanceTimersByTime(1000);
    expect(t1.getAttribute('data-scroll-highlight')).toBeNull();
    // t2's attribute is still set; its own timer hasn't fired yet.
    expect(t2.getAttribute('data-scroll-highlight')).toBe('true');

    // t2's timer fires at 500 + 1500 = 2000ms total.
    vi.advanceTimersByTime(500);
    expect(t2.getAttribute('data-scroll-highlight')).toBeNull();
  });

  it('escapes embedded double-quotes in the turn hash for the selector', () => {
    // Defensive: jsdom's querySelector throws on unescaped quotes inside
    // attribute values. Real turn hashes are sha256 hex prefixed with
    // sha256: — no quotes possible — but the helper should not break
    // if someone passes a synthetic id with a quote.
    const turn = document.createElement('div');
    turn.setAttribute('data-turn-hash', 'weird"id');
    document.body.appendChild(turn);

    const { result } = renderHook(() => useScrollToTurn());
    expect(() => result.current('weird"id')).not.toThrow();
  });
});
