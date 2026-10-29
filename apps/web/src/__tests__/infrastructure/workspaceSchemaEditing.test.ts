import type { StudioSchemaEditCandidate } from '@t3x-dev/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasUnappliedSchemaEdit } from '@/domain/workspaces/schemaBindings';
import { readWorkspaceSchemaEditing } from '@/infrastructure/workspaceSchemaEditing';
import type { WorkspaceCandidate } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({ get: vi.fn(), read: vi.fn(), list: vi.fn(), preview: vi.fn() }));
vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({ workspaces: { get: mocks.get } }),
}));
vi.mock('@/infrastructure/schemaStudio', () => ({
  readStudioSchemaEditCandidate: mocks.read,
  listStudioCandidates: mocks.list,
  previewStudioSelection: mocks.preview,
}));

describe('Workspace Schema editing uses the existing candidate', () => {
  const workspace = {
    id: 'w',
    revision: 4,
    schemaBindings: [{ schemaHash: 'bound' }],
  } as WorkspaceCandidate;
  const edit = {
    candidateId: 'edit',
    revision: 2,
    baseSources: [],
    authoringDraft: { base: { schemaHash: 'bound' }, resultSchemaHash: 'changed' },
  } as unknown as StudioSchemaEditCandidate;
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.get.mockResolvedValue({ workspace });
    mocks.read.mockResolvedValue(edit);
    mocks.preview.mockResolvedValue({ workspace: { revision: 4 }, schemaHash: 'changed' });
  });
  it('resumes an unapplied candidate against its exact binding without selecting default sources', async () => {
    const session = await readWorkspaceSchemaEditing('p', 'w');
    expect(session.unapplied).toBe(true);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.preview).toHaveBeenCalledWith('p', {
      workspaceId: 'w',
      candidateIds: [],
      schemaEditCandidate: { candidateId: 'edit', revision: 2 },
    });
  });
  it('reads the effective binding after application rather than replaying the saved candidate', async () => {
    mocks.read.mockResolvedValue({
      ...edit,
      authoringDraft: { ...edit.authoringDraft, resultSchemaHash: 'bound' },
    });
    expect((await readWorkspaceSchemaEditing('p', 'w')).unapplied).toBe(false);
    expect(mocks.preview).toHaveBeenCalledWith('p', { workspaceId: 'w', candidateIds: [] });
  });
  it('refuses a similarly named but different source version without overwriting Studio work', async () => {
    const source = {
      canonicalName: 'product',
      version: 1,
      artifactVersionId: 'v1',
      hash: 'h1',
      projectId: 'p',
    };
    mocks.read.mockResolvedValue({
      ...edit,
      baseSources: [source],
      authoringDraft: { base: {}, resultSchemaHash: 'changed' },
    });
    mocks.list.mockResolvedValue([
      { id: 'new', available: true, source: { ...source, hash: 'h2' } },
    ]);
    await expect(readWorkspaceSchemaEditing('p', 'w')).rejects.toThrow('Restore Schema source');
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it('rejects a preview prepared after the Workspace advanced', async () => {
    mocks.preview.mockResolvedValue({ workspace: { revision: 5 } });
    await expect(readWorkspaceSchemaEditing('p', 'w')).rejects.toThrow('Workspace changed');
  });
  it('does not treat missing candidate evidence as applied', () => {
    expect(hasUnappliedSchemaEdit({ ...edit, authoringDraft: undefined }, workspace)).toBe(true);
    expect(hasUnappliedSchemaEdit(null, workspace)).toBe(false);
  });
});
