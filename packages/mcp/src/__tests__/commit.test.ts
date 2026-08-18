import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDB = {
  transaction: <T>(fn: (tx: typeof mockDB) => Promise<T>) => fn(mockDB),
};
const mockApiClient = {
  commitFromDraft: vi.fn(),
};

vi.mock('../db.js', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

vi.mock('@t3x-dev/api-client', () => ({
  createClient: vi.fn(() => mockApiClient),
}));

const transitionMock = vi.hoisted(() => ({
  commitRepositoryYOpsState: vi.fn(),
}));

vi.mock('@t3x-dev/api/repository-state-transition', () => transitionMock);

import { getDB } from '../db.js';
import { commitHandler } from '../tools/core/commit.js';

const originalBackend = process.env.T3X_MCP_BACKEND;

describe('t3x_commit handler', () => {
  beforeEach(() => {
    mockApiClient.commitFromDraft.mockReset();
    transitionMock.commitRepositoryYOpsState.mockReset();
    vi.mocked(getDB).mockClear();
  });

  afterEach(() => {
    if (originalBackend === undefined) {
      delete process.env.T3X_MCP_BACKEND;
    } else {
      process.env.T3X_MCP_BACKEND = originalBackend;
    }
  });

  it('returns error when project_id is missing', async () => {
    const result = await commitHandler({ draft_id: 'draft_abc', message: 'msg' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"project_id" is required');
  });

  it('returns error when draft_id is missing', async () => {
    const result = await commitHandler({ project_id: 'proj_test1', message: 'msg' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"draft_id" is required');
  });

  it('returns error when message is missing', async () => {
    const result = await commitHandler({ project_id: 'proj_test1', draft_id: 'draft_abc' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"message" is required');
  });

  it('uses api client commitFromDraft when api backend is enabled', async () => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.commitFromDraft.mockResolvedValueOnce({
      commit_hash: 'sha256:api-commit',
      tree_count: 1,
      branch: 'feature-x',
    });

    const result = await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'API commit',
      branch: 'feature-x',
    });

    expect(result.isError).toBeUndefined();
    expect(mockApiClient.commitFromDraft).toHaveBeenCalledWith({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'API commit',
      branch: 'feature-x',
    });
    expect(getDB).not.toHaveBeenCalled();
    expect(transitionMock.commitRepositoryYOpsState).not.toHaveBeenCalled();
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      commit_hash: 'sha256:api-commit',
      tree_count: 1,
      branch: 'feature-x',
      next_steps: expect.any(Array),
    });
  });

  it('keeps the default target branch on the API backend', async () => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.commitFromDraft.mockResolvedValueOnce({
      commit_hash: 'sha256:api-main',
      tree_count: 1,
      branch: 'main',
    });

    const result = await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'API commit',
    });

    expect(result.isError).toBeUndefined();
    expect(mockApiClient.commitFromDraft).toHaveBeenCalledWith({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'API commit',
      branch: 'main',
    });
    expect(getDB).not.toHaveBeenCalled();
    expect(transitionMock.commitRepositoryYOpsState).not.toHaveBeenCalled();
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      commit_hash: 'sha256:api-main',
      branch: 'main',
    });
  });

  it('fails closed on the storage backend instead of minting local actors or advancing refs', async () => {
    process.env.T3X_MCP_BACKEND = 'storage';

    const result = await commitHandler({
      project_id: 'proj_test1',
      draft_id: 'draft_abc',
      message: 'Storage commit',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('t3x_commit requires T3X_MCP_BACKEND=api');
    expect(result.content[0].text).toContain('shared API/application command');
    expect(getDB).not.toHaveBeenCalled();
    expect(transitionMock.commitRepositoryYOpsState).not.toHaveBeenCalled();
  });
});
