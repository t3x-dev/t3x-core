import { createHash } from 'node:crypto';
import { T3xApiError } from '@t3x-dev/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getStateOverview, exportCommitState, isApiBackend } = vi.hoisted(() => ({
  getStateOverview: vi.fn(),
  exportCommitState: vi.fn(),
  isApiBackend: vi.fn(() => true),
}));

vi.mock('../backend.js', () => ({
  getApiClient: () => ({ getStateOverview, exportCommitState }),
  isApiBackend,
}));

import { committedStateHandler } from '../tools/committed-state.js';

const commitDigest = `sha256:${'a'.repeat(64)}`;
const stateDigest = `sha256:${'b'.repeat(64)}`;
const otherDigest = `sha256:${'c'.repeat(64)}`;
const sourceCommit = { kind: 'commit', schema: 't3x/commit/v2', digest: commitDigest };
const sourceState = { kind: 'state', schema: 't3x/state/v1', digest: stateDigest };
const input = { project_id: 'project-1', commit_digest: commitDigest, state_digest: stateDigest };
const value = { title: '草稿', values: [null, '', false] };
const revision = { commitDigest, stateDigest };

function artifactFor(format: 'json' | 'yaml') {
  const content = format === 'json' ? '{"title":"草稿"}\n' : '"title": "草稿"\n';
  return {
    sourceCommit,
    sourceState,
    format,
    mimeType: format === 'json' ? 'application/json' : 'application/yaml',
    serialization: `t3x.${format}-value/v1`,
    content,
    byteLength: Buffer.byteLength(content, 'utf8'),
    byteDigest: `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`,
  };
}

function payload(result: Awaited<ReturnType<typeof committedStateHandler>>) {
  return JSON.parse(result.content[0]!.text);
}

beforeEach(() => {
  vi.resetAllMocks();
  isApiBackend.mockReturnValue(true);
});

describe('t3x_committed_state', () => {
  it('reads the full value for one exact Commit, independently of its display projection', async () => {
    getStateOverview.mockResolvedValue({
      revision,
      reading: { kind: 'semantic-content', value: { trees: [], relations: [] } },
      render: { context: { sourceCommit, sourceState, value } },
    });

    const result = await committedStateHandler({ ...input, action: 'read' });

    expect(getStateOverview).toHaveBeenCalledExactlyOnceWith('project-1', commitDigest, {
      stateDigest,
    });
    expect(payload(result)).toEqual({ project_id: 'project-1', sourceCommit, sourceState, value });
  });

  it('rejects a State read that diverges from the requested digest', async () => {
    getStateOverview.mockResolvedValue({
      revision: { commitDigest, stateDigest: otherDigest },
      render: {
        context: { sourceCommit, sourceState: { ...sourceState, digest: otherDigest }, value },
      },
    });

    const result = await committedStateHandler({ ...input, action: 'read' });

    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ error: { code: 'HASH_CONFLICT' } });
  });

  it.each([
    'json',
    'yaml',
  ] as const)('returns unchanged %s bytes for the requested State', async (format) => {
    const artifact = artifactFor(format);
    exportCommitState.mockResolvedValue(artifact);

    const result = await committedStateHandler({ ...input, action: 'export', format });

    expect(exportCommitState).toHaveBeenCalledExactlyOnceWith(
      'project-1',
      commitDigest,
      format,
      stateDigest
    );
    expect(payload(result)).toEqual(artifact);
  });

  it.each([
    { sourceCommit: { ...sourceCommit, digest: otherDigest } },
    { sourceState: { ...sourceState, digest: otherDigest } },
    { format: 'yaml' },
    { byteLength: artifactFor('json').content.length },
    { byteDigest: otherDigest },
  ])('rejects an export artifact with mismatched metadata or bytes: %o', async (mismatch) => {
    exportCommitState.mockResolvedValue({ ...artifactFor('json'), ...mismatch });

    const result = await committedStateHandler({ ...input, action: 'export', format: 'json' });

    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ error: { code: 'HASH_CONFLICT' } });
  });

  it('preserves the API rejection for a Commit outside the selected project', async () => {
    getStateOverview.mockRejectedValue(
      new T3xApiError('COMMIT_NOT_FOUND', 'Commit not found in project', 404)
    );

    const result = await committedStateHandler({
      ...input,
      action: 'read',
      project_id: 'other-project',
    });

    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ error: { code: 'COMMIT_NOT_FOUND', status: 404 } });
  });

  it('rejects an empty branch head without resolving a different Commit', async () => {
    const result = await committedStateHandler({ ...input, action: 'read', commit_digest: null });

    expect(result.isError).toBe(true);
    expect(getStateOverview).not.toHaveBeenCalled();
    expect(exportCommitState).not.toHaveBeenCalled();
  });

  it('requires the API backend', async () => {
    isApiBackend.mockReturnValue(false);

    const result = await committedStateHandler({ ...input, action: 'read' });

    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ error: { code: 'API_BACKEND_REQUIRED' } });
    expect(getStateOverview).not.toHaveBeenCalled();
  });
});
