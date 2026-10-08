// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useRepositorySetup } from '@/hooks/projects/useRepositorySetup';
import { useProjectStore } from '@/store/projectStore';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
  save: vi.fn(),
  conversation: vi.fn(),
  visibility: vi.fn(),
}));
vi.mock('@/commands/projects', () => ({ createProject: mocks.create }));
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
  provider: 'openai',
  model: 'model-a',
  files: [new File(['notes'], 'notes.md')],
  schema: null,
};
it('persists the configuration, attaches uploaded material to the Workspace, and creates its conversation', async () => {
  const { result } = renderHook(() => useRepositorySetup());
  await act(async () => {
    await result.current.create(input);
  });
  expect(mocks.create).toHaveBeenCalledWith('Test', { description: 'Description' }, 'team');
  expect(mocks.update).toHaveBeenCalledWith('p', {
    default_provider: 'openai',
    default_model: 'model-a',
  });
  expect(mocks.save.mock.calls[0]![2].sourceBundle[0].materialId).toBe('m');
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
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(result.current.error).toBeNull();
  expect(useProjectStore.getState().projects.filter((project) => project.id === 'p')).toHaveLength(
    1
  );
});
it('adds the new repository to an already loaded owner project list', async () => {
  useProjectStore.getState().setProjectScope('team');
  useProjectStore.getState().setProjects([]);
  const { result } = renderHook(() => useRepositorySetup());
  await act(async () => {
    await result.current.create(input);
  });
  expect(useProjectStore.getState().projects.map((project) => project.id)).toEqual(['p']);
});
