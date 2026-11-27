// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  beginNavigationTiming,
  markNavigationTiming,
  traceNavigationRequest,
} from '@/utils/navigationTiming';

afterEach(() => {
  beginNavigationTiming('untracked');
  vi.unstubAllGlobals();
});

it('correlates eligible reads and records cancellation without tagging other destinations', () => {
  const mark = vi.fn();
  const measure = vi.fn();
  vi.stubGlobal('performance', { now: () => 1, mark, measure });
  const headers = new Headers();

  beginNavigationTiming('schemas');
  const first = traceNavigationRequest('/api/v1/projects/p', 'GET', headers);
  const second = traceNavigationRequest(
    '/api/v1/projects/p/schema-studio/preview',
    'POST',
    headers
  );
  const id = first?.headers.get('x-t3x-interaction-id');
  expect(id).toBeTruthy();
  expect(second?.headers.get('x-t3x-interaction-id')).toBe(id);
  expect(first?.headers.get('x-request-id')).not.toBe(second?.headers.get('x-request-id'));
  expect(headers.has('x-t3x-interaction-id')).toBe(false);
  expect(
    traceNavigationRequest('https://external.example/api/v1/projects', 'GET', headers)
  ).toBeUndefined();
  expect(traceNavigationRequest('/api/v1/projects/p', 'DELETE', headers)).toBeUndefined();

  first?.finish(404);
  second?.finish('cancelled');
  expect(measure.mock.calls.map(([, options]) => options.detail.outcome)).toEqual([
    404,
    'cancelled',
  ]);
  markNavigationTiming('schemas', 'shell');
  markNavigationTiming('schemas', 'ready');
  expect(mark.mock.calls.map(([name]) => name)).toContain('t3x:navigation:schemas:ready');
  expect(traceNavigationRequest('/api/v1/projects/p', 'GET', headers)).toBeUndefined();
});
