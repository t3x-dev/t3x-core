// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useRepositorySetup } from '@/hooks/projects/useRepositorySetup';
import { useProjectStore } from '@/store/projectStore';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
  schemaRequest: vi.fn(),
  save: vi.fn(),
  conversation: vi.fn(),
  visibility: vi.fn(),
}));
vi.mock('@/commands/projects', () => ({ createProject: mocks.create }));
vi.mock('@/infrastructure/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/infrastructure/core')>()),
  fetchWithTimeout: mocks.schemaRequest,
}));
vi.mock('@/commands/conversations', () => ({ createConversation: mocks.conversation }));
vi.mock('@/infrastructure/projects', () => ({
  updateProject: mocks.update,
  changeProjectVisibility: mocks.visibility,
}));
vi.mock('@/infrastructure/materials', () => ({ uploadDocumentMaterial: mocks.upload }));
vi.mock('@/queries/workspaces', () => ({ saveWorkspaceDraft: mocks.save }));
beforeEach(() => {
  vi.clearAllMocks();
  useProjectStore.getState().setProjects([]);
  mocks.create.mockResolvedValue({ project_id: 'p', name: 'Test' });
  mocks.update.mockResolvedValue({});
  mocks.upload.mockResolvedValue({
    id: 'm',
    title: 'Notes',
    source_type: 'document',
    metadata: {},
    filename: 'notes.md',
  });
  mocks.save.mockImplementation(async (_p, _w, workspace) => ({
    workspace: { ...workspace, revision: 1 },
  }));
  mocks.conversation.mockResolvedValue({ conversation_id: 'c' });
  mocks.visibility.mockResolvedValue({});
});
const input = {
  name: 'Test',
  description: 'Description',
  owner: 'team',
  visibility: 'private' as const,
};
it('creates an empty Workspace and conversation without AI defaults, material or Schema upload', async () => {
  const { result } = renderHook(() => useRepositorySetup());
  await act(async () => {
    await result.current.create(input);
  });
  expect(mocks.create).toHaveBeenCalledWith(
    'Test',
    { description: 'Description' },
    'team',
    undefined,
    { initialize_readme: false, tags: [] }
  );
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.schemaRequest).not.toHaveBeenCalled();
  expect(mocks.save.mock.calls[0]![2].sourceBundle).toEqual([]);
  expect(mocks.conversation).toHaveBeenCalledWith('p', 'Test source chat', undefined, undefined, {
    target_branch: 'main',
    workspace_id: 'workspace_branch:main',
  });
});
it('resumes after a conversation failure without creating another repository or uploading again', async () => {
  mocks.conversation.mockRejectedValueOnce(new Error('Unavailable'));
  const { result } = renderHook(() => useRepositorySetup());
  await act(async () => {
    await result.current.create(input);
  });
  expect(result.current.error).toContain('Repository created; retry');
  await act(async () => {
    await result.current.create(input);
  });
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(result.current.error).toBeNull();
  expect(useProjectStore.getState().projects.filter((project) => project.id === 'p')).toHaveLength(
    1
  );
});
it('adds the new repository to an already loaded owner project list', async () => {
  useProjectStore
    .getState()
    .setProjectScope('team', undefined, { initialize_readme: false, tags: [] });
  useProjectStore.getState().setProjects([]);
  const { result } = renderHook(() => useRepositorySetup());
  await act(async () => {
    await result.current.create(input);
  });
  expect(useProjectStore.getState().projects.map((project) => project.id)).toEqual(['p']);
});

it('resumes after visibility failure without duplicating the Workspace or conversation', async () => {
  mocks.visibility.mockRejectedValueOnce(new Error('Permission denied'));
  const { result } = renderHook(() => useRepositorySetup());
  await act(async () => {
    await result.current.create({ ...input, visibility: 'public' });
  });
  expect(result.current.error).toContain('Repository created; retry');
  expect(result.current.error).toContain('Permission denied');
  await act(async () => {
    await result.current.create({ ...input, visibility: 'public' });
  });
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.conversation).toHaveBeenCalledTimes(1);
  expect(result.current.error).toBeNull();
});
it('reports repository creation errors and permits a corrected retry', async () => {
  mocks.create.mockRejectedValueOnce(new Error('Namespace permission denied'));
  const { result } = renderHook(() => useRepositorySetup());
  await act(async () => {
    await result.current.create(input);
  });
  expect(result.current.started).toBe(false);
  expect(result.current.error).toBe('Namespace permission denied');
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.create({ ...input, owner: 'allowed' });
  });
  expect(mocks.create).toHaveBeenLastCalledWith(
    'Test',
    { description: 'Description' },
    'allowed',
    undefined,
    { initialize_readme: false, tags: [] }
  );
});

it('sends README and normalized tags in the creation request, retaining them across setup retries', async () => {
  mocks.conversation.mockRejectedValueOnce(new Error('Unavailable'));
  const { result } = renderHook(() => useRepositorySetup());
  await act(async () => {
    await result.current.create({ ...input, initializeReadme: true, tags: ['中文', 'Dev'] });
  });
  await act(async () => {
    await result.current.create(input);
  });
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
    'Test',
    { description: 'Description' },
    'team',
    undefined,
    { initialize_readme: true, tags: ['中文', 'Dev'] }
  );
  expect(mocks.update).not.toHaveBeenCalled();
});
