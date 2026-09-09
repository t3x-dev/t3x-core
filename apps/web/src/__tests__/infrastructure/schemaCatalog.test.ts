import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSchemaIntroduction, fetchSchemaReleaseReading } from '@/infrastructure/schemaCatalog';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/infrastructure/core', () => ({
  API_V1: '/api/v1',
  fetchWithTimeout: mocks.fetch,
  handleResponse: async (response: unknown) => response,
}));
const commit = `sha256:${'a'.repeat(64)}`;
const digest = `sha256:${'b'.repeat(64)}`;
const result = {
  commitDigest: commit,
  stateDigest: `sha256:${'c'.repeat(64)}`,
  createdBy: null,
  createdAt: null,
  presentation: {
    digest,
    document: {
      schema: 't3x.dev/state-presentation/v1',
      description: 'Author text',
      readme: '',
      tags: [],
      avatarPath: null,
      resources: [],
    },
  },
};
beforeEach(() => mocks.fetch.mockReset());
describe('exact release introduction', () => {
  it('requests the authorized project and exact commit and presentation digest', async () => {
    mocks.fetch.mockResolvedValue(result);
    expect(
      await fetchSchemaIntroduction({
        projectId: 'project/a',
        commitDigest: commit,
        presentationDigest: digest,
      })
    ).toEqual(result.presentation);
    expect(mocks.fetch).toHaveBeenCalledWith(
      `/api/v1/projects/project%2Fa/commits/${encodeURIComponent(commit)}/presentation?presentation_digest=${encodeURIComponent(digest)}`
    );
  });
  it('rejects mismatched or absent introductions instead of rendering another revision', async () => {
    for (const response of [
      { ...result, commitDigest: digest },
      { ...result, presentation: { ...result.presentation, digest: commit } },
      { ...result, presentation: null },
    ]) {
      mocks.fetch.mockResolvedValue(response);
      await expect(
        fetchSchemaIntroduction({
          projectId: 'p',
          commitDigest: commit,
          presentationDigest: digest,
        })
      ).rejects.toThrow('Introduction does not match');
    }
  });
});

it('reads an exact source without creating a Studio candidate and rejects a changed hash', async () => {
  const release = { artifactHash: digest, readme: '# Author' };
  mocks.fetch.mockResolvedValue(release);
  expect(await fetchSchemaReleaseReading('p', 'team/template', '1', digest, 'source')).toEqual(
    release
  );
  expect(mocks.fetch.mock.calls[0]![0]).toContain('sourceProjectId=source');
  await expect(fetchSchemaReleaseReading('p', 'team/template', '1', commit)).rejects.toThrow(
    'selected hash'
  );
});
