import { T3xApiError } from '@t3x-dev/api-client';
import { beforeEach, expect, it, vi } from 'vitest';

const { isApiBackend, publishCandidate } = vi.hoisted(() => ({
  isApiBackend: vi.fn(),
  publishCandidate: vi.fn(),
}));

vi.mock('../backend.js', () => ({
  isApiBackend,
  getApiClient: () => ({ workspaces: { authoring: { publishCandidate } } }),
}));

import { workspaceCandidateHandler } from '../tools/workspace-candidate.js';

const args = {
  project_id: 'proj_1',
  workspace_id: 'workspace_branch:feature%2Ftest',
  transition_id: 'trn_0123456789abcdef0123456789abcdef',
  request_id: 'draft-publish-1',
};

beforeEach(() => {
  vi.resetAllMocks();
  isApiBackend.mockReturnValue(true);
});

it('keeps the candidate and request identities exact and returns the API receipt', async () => {
  const receipt = {
    kind: 'reused',
    action: { actionId: args.request_id },
    workspaceRevision: 5,
    compositionRevision: 2,
  };
  publishCandidate.mockResolvedValue(receipt);
  const result = await workspaceCandidateHandler({ ...args, actor: 'untrusted', approve: true });
  expect(publishCandidate).toHaveBeenCalledExactlyOnceWith(
    args.project_id,
    args.workspace_id,
    args.transition_id,
    { request_id: args.request_id }
  );
  expect(JSON.parse(result.content[0]!.text)).toEqual(receipt);
});

it.each([
  { workspace_id: '..' },
  { transition_id: 'unchecked' },
  { request_id: '' },
])('rejects an invalid identity before reaching the API', async (invalid) => {
  const result = await workspaceCandidateHandler({ ...args, ...invalid });
  expect(JSON.parse(result.content[0]!.text)).toMatchObject({
    error: { code: 'INVALID_ARGUMENT', status: 400 },
  });
  expect(publishCandidate).not.toHaveBeenCalled();
});

it('preserves the guarded write conflict from the API', async () => {
  publishCandidate.mockRejectedValue(new T3xApiError('DRAFT_CONFLICT', 'Draft changed', 409));
  const result = await workspaceCandidateHandler(args);
  expect(JSON.parse(result.content[0]!.text)).toMatchObject({
    error: { code: 'DRAFT_CONFLICT', status: 409 },
  });
});

it('requires the API backend', async () => {
  isApiBackend.mockReturnValue(false);
  expect((await workspaceCandidateHandler(args)).isError).toBe(true);
  expect(publishCandidate).not.toHaveBeenCalled();
});
