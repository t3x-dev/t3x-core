// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { type SchemaSourcePin, schemaSourceKey } from '@/domain/schemas/schemaProvenance';
import { useSchemaSourceIdentities } from '@/hooks/schemas/useSchemaSourceIdentities';

const api = vi.hoisted(() => ({ release: vi.fn(), introduction: vi.fn() }));
vi.mock('@/infrastructure/explore', () => ({ fetchExploreRelease: api.release }));
vi.mock('@/infrastructure/schemaCatalog', () => ({ fetchSchemaIntroduction: api.introduction }));
const pin: SchemaSourcePin = {
  projectId: 'source-project',
  canonicalName: '@team/tasks',
  version: '1.0.0',
  artifactVersionId: 'tasks-v1',
  hash: `sha256:${'a'.repeat(64)}`,
};
const release = {
  item: {
    identity: { displayName: 'Tasks', ownerProjectId: pin.projectId },
    release: { artifactVersionId: pin.artifactVersionId },
    presentationRef: {
      projectId: pin.projectId,
      commitDigest: 'intro-commit',
      presentationDigest: 'intro',
    },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  api.release.mockResolvedValue(release);
  api.introduction.mockResolvedValue({
    document: {
      avatarPath: 'logo.png',
      resources: [{ path: 'logo.png', mediaType: 'image/png', base64: 'logo' }],
    },
  });
});
it('loads one identity per exact source and uses the introduction only for its logo', async () => {
  const { result, rerender } = renderHook(({ sources }) => useSchemaSourceIdentities(sources), {
    initialProps: { sources: [pin, pin] },
  });
  await waitFor(() =>
    expect(result.current[schemaSourceKey(pin)]?.logo).toBe('data:image/png;base64,logo')
  );
  expect(api.release).toHaveBeenCalledTimes(1);
  expect(result.current[schemaSourceKey(pin)]).not.toHaveProperty('commitDigest');
  rerender({ sources: [pin, pin] });
  expect(api.release).toHaveBeenCalledTimes(1);
});
it('does not show a different artifact or turn an inaccessible logo into an inaccessible release', async () => {
  api.introduction.mockRejectedValue(new Error('Not found'));
  const { result, rerender } = renderHook(({ sources }) => useSchemaSourceIdentities(sources), {
    initialProps: { sources: [pin] },
  });
  await waitFor(() => expect(result.current[schemaSourceKey(pin)]?.name).toBe('Tasks'));
  expect(result.current[schemaSourceKey(pin)].unavailable).toBeUndefined();
  api.release.mockResolvedValue({
    item: { ...release.item, release: { artifactVersionId: 'wrong' } },
  });
  const next = { ...pin, version: '2.0.0' };
  rerender({ sources: [next] });
  await waitFor(() => expect(result.current[schemaSourceKey(next)]?.unavailable).toBe(true));
  expect(result.current[schemaSourceKey(pin)]).toBeUndefined();
});
it('ignores an old selection response after the sources change', async () => {
  let finish!: (value: unknown) => void;
  api.release.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { result, rerender } = renderHook(({ sources }) => useSchemaSourceIdentities(sources), {
    initialProps: { sources: [pin] },
  });
  rerender({ sources: [] });
  finish(release);
  await waitFor(() => expect(api.introduction).toHaveBeenCalled());
  expect(result.current).toEqual({});
});
