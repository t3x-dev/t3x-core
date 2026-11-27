import { T3xApiError } from '@t3x-dev/api-client';
import { beforeEach, expect, it, vi } from 'vitest';
import { repositoryLocationHandler } from '../tools/repository-location.js';

const { apiClient, isApiBackend } = vi.hoisted(() => ({
  apiClient: { resolveRepository: vi.fn(), listBranches: vi.fn() },
  isApiBackend: vi.fn(),
}));

vi.mock('../backend.js', () => ({ getApiClient: () => apiClient, isApiBackend }));

const args = { repository: 'old-owner/previous-name', ref: 'feature/docs' };
const located = {
  project_id: 'project-1',
  canonical_path: '/new-owner/current-name',
  ref: args.ref,
};

beforeEach(() => {
  vi.resetAllMocks();
  isApiBackend.mockReturnValue(true);
  apiClient.resolveRepository.mockResolvedValue({
    project_id: located.project_id,
    canonical_path: located.canonical_path,
  });
});

it('resolves an alias and observes the exact named branch head beyond the first page', async () => {
  const fullPage = Array.from({ length: 100 }, (_, i) => ({ name: `branch-${i}` }));
  const firstHead = `sha256:${'1'.repeat(64)}`;
  const nextHead = `sha256:${'2'.repeat(64)}`;
  apiClient.listBranches
    .mockResolvedValueOnce({ branches: fullPage })
    .mockResolvedValueOnce({ branches: [{ name: args.ref, head_commit_hash: firstHead }] })
    .mockResolvedValueOnce({ branches: [{ name: args.ref, head_commit_hash: nextHead }] });
  const first = await repositoryLocationHandler(args);
  const next = await repositoryLocationHandler(args);

  expect(apiClient.resolveRepository).toHaveBeenCalledWith('old-owner', 'previous-name');
  expect(apiClient.listBranches).toHaveBeenNthCalledWith(2, located.project_id, {
    limit: 100,
    offset: 100,
  });
  expect(JSON.parse(first.content[0].text)).toEqual({ ...located, head_commit_hash: firstHead });
  expect(JSON.parse(next.content[0].text)).toEqual({ ...located, head_commit_hash: nextHead });
});

it('distinguishes an existing empty branch from a missing branch', async () => {
  apiClient.listBranches.mockResolvedValue({
    branches: [{ name: args.ref, head_commit_hash: null }],
  });
  const empty = await repositoryLocationHandler(args);
  expect(empty.isError).toBeUndefined();
  expect(JSON.parse(empty.content[0].text)).toEqual({ ...located, head_commit_hash: null });

  const absent = await repositoryLocationHandler({ ...args, ref: 'missing' });
  expect(absent.isError).toBe(true);
  expect(JSON.parse(absent.content[0].text)).toMatchObject({ error: { code: 'BRANCH_NOT_FOUND' } });
});

it('retains the API denial for a private repository without listing its branches', async () => {
  apiClient.resolveRepository.mockRejectedValue(new T3xApiError('FORBIDDEN', 'Access denied', 403));
  const denied = await repositoryLocationHandler(args);
  expect(denied.isError).toBe(true);
  expect(JSON.parse(denied.content[0].text)).toEqual({
    error: { code: 'FORBIDDEN', message: 'Access denied', status: 403 },
  });
  expect(apiClient.listBranches).not.toHaveBeenCalled();
});

it('requires the API backend, a repository address, and an explicit ref', async () => {
  expect((await repositoryLocationHandler({ repository: args.repository })).isError).toBe(true);
  expect((await repositoryLocationHandler({ ...args, repository: '../repo' })).isError).toBe(true);
  isApiBackend.mockReturnValue(false);
  expect((await repositoryLocationHandler(args)).isError).toBe(true);
  expect(apiClient.resolveRepository).not.toHaveBeenCalled();
});
