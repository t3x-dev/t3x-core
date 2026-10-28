// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSchemaCompositionPreview } from '@/hooks/schemas/useSchemaCompositionPreview';
import { previewYSchemaComposition } from '@/infrastructure/schemaComposition';
import type { SchemaCompositionDraft, SchemaCompositionPreviewResult } from '@/types/schemaModules';
import { deferred } from '../deferred';

vi.mock('@/infrastructure/schemaComposition', () => ({ previewYSchemaComposition: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
const draft: SchemaCompositionDraft = {
  apiVersion: 't3x.dev/yschema-composition/v2',
  id: 'draft',
  revision: 1,
  status: 'draft',
  modules: [],
};
const preview: SchemaCompositionPreviewResult = {
  compositionHash: 'first',
  compiledSchemaHash: 'schema',
  report: { valid: true, issues: [] },
  renderPlan: [],
};

it('reset invalidates the preview in flight and its caller result', async () => {
  const request = deferred<SchemaCompositionPreviewResult>();
  vi.mocked(previewYSchemaComposition).mockReturnValue(request.promise);
  const { result } = renderHook(() => useSchemaCompositionPreview());
  let pending!: ReturnType<typeof result.current.compile>;
  act(() => {
    pending = result.current.compile(draft);
  });
  act(() => result.current.reset());
  expect(result.current.pending).toBe(false);
  await act(async () => {
    request.resolve(preview);
    expect(await pending).toBeUndefined();
  });
  expect(result.current.result).toBeUndefined();
});

it('accepting a saved preview supersedes an older compilation', async () => {
  const request = deferred<SchemaCompositionPreviewResult>();
  vi.mocked(previewYSchemaComposition).mockReturnValue(request.promise);
  const { result } = renderHook(() => useSchemaCompositionPreview());
  act(() => {
    void result.current.compile(draft);
  });
  const saved = { ...preview, compositionHash: 'saved' };
  act(() => result.current.accept(saved));
  await act(async () => request.resolve(preview));
  expect(result.current.result).toEqual(saved);
  expect(result.current.pending).toBe(false);
});

it('a new compilation clears the previous valid result and ignores late errors', async () => {
  const old = deferred<SchemaCompositionPreviewResult>();
  const latest = deferred<SchemaCompositionPreviewResult>();
  vi.mocked(previewYSchemaComposition)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(latest.promise);
  const { result } = renderHook(() => useSchemaCompositionPreview());
  act(() => result.current.accept(preview));
  act(() => {
    void result.current.compile(draft);
  });
  expect(result.current.result).toBeUndefined();
  act(() => {
    void result.current.compile({ ...draft, revision: 2 });
  });
  await act(async () => old.reject(new Error('obsolete')));
  expect(result.current.error).toBeUndefined();
  expect(result.current.pending).toBe(true);
  await act(async () => latest.resolve({ ...preview, compositionHash: 'latest' }));
  expect(result.current.result?.compositionHash).toBe('latest');
});
