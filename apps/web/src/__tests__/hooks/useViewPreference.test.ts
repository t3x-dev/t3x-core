// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useViewPreference } from '@/hooks/shared/useViewPreference';

const views = ['compose', 'review'] as const;
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it('restores a view after remount and isolates repository and Workspace keys', () => {
  const first = renderHook(() => useViewPreference('project:a/workspace:1', views, 'compose'));
  act(() => first.result.current[1]('review'));
  first.unmount();
  const restored = renderHook(({ id }) => useViewPreference(id, views, 'compose'), {
    initialProps: { id: 'project:a/workspace:1' },
  });
  expect(restored.result.current[0]).toBe('review');
  restored.rerender({ id: 'project:b/workspace:1' });
  expect(restored.result.current[0]).toBe('compose');
  restored.rerender({ id: 'project:a/workspace:2' });
  expect(restored.result.current[0]).toBe('compose');
  restored.rerender({ id: 'project:a/workspace:1' });
  expect(restored.result.current[0]).toBe('review');
});

it('ignores invalid stored choices and still works when storage is blocked', () => {
  localStorage.setItem('view', 'deleted-tab');
  const { result } = renderHook(() => useViewPreference('view', views, 'compose'));
  expect(result.current[0]).toBe('compose');
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  act(() => result.current[1]('review'));
  expect(result.current[0]).toBe('review');
  vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const blocked = renderHook(() => useViewPreference('other', views, 'compose'));
  expect(blocked.result.current[0]).toBe('compose');
});
