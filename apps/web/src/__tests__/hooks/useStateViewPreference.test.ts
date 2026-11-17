// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useStateViewPreference } from '@/hooks/shared/useStateViewPreference';

afterEach(() => vi.unstubAllGlobals());
it('defaults to Overview, remembers per project and rejects invalid stored views', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key),
    setItem: (key: string, value: string) => values.set(key, value),
  });
  const { result, rerender } = renderHook(({ id }) => useStateViewPreference(id), {
    initialProps: { id: 'a' },
  });
  expect(result.current.preferredView).toBe('overview');
  act(() => result.current.remember('code'));
  expect(values.get('t3x.state-view:a')).toBe('code');
  values.set('t3x.state-view:b', 'canvas');
  rerender({ id: 'b' });
  expect(result.current.preferredView).toBe('overview');
  rerender({ id: 'a' });
  expect(result.current.preferredView).toBe('code');
});
it('keeps working when browser storage is unavailable', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  });
  const { result } = renderHook(() => useStateViewPreference('a'));
  expect(result.current.preferredView).toBe('overview');
  act(() => result.current.remember('structure'));
  expect(result.current.preferredView).toBe('structure');
});
