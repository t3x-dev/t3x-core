// @vitest-environment jsdom

import { createHash } from 'node:crypto';
import type { WorkspaceAuthoringView } from '@t3x-dev/api-client';
import { canonicalJson, type YValue } from '@t3x-dev/yops';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import { useWorkspaceDraftSchema } from '@/hooks/schemas/useWorkspaceDraftSchema';

const mocks = vi.hoisted(() => ({
  registry: vi.fn(),
  versions: vi.fn(),
  edit: vi.fn(),
  candidates: vi.fn(),
  preview: vi.fn(),
}));
vi.mock('@/infrastructure/schemaComposition', () => ({
  loadYSchemaArtifactRegistry: mocks.registry,
  loadProjectYSchemaVersions: mocks.versions,
}));
vi.mock('@/infrastructure/schemaStudio', () => ({
  readStudioSchemaEditCandidate: mocks.edit,
  listStudioCandidates: mocks.candidates,
  previewStudioSelection: mocks.preview,
}));
const definition = {
  yschema: '0.1',
  name: 'test/schema',
  nodes: { product: { slots: { title: { type: 'string' } } } },
};

describe('read-only bound Workspace Schema', () => {
  beforeEach(() => {
    mocks.registry.mockReset().mockResolvedValue({ items: [] });
    mocks.versions.mockReset().mockResolvedValue({ items: [] });
    mocks.edit.mockReset().mockResolvedValue(null);
    mocks.candidates.mockReset().mockResolvedValue([]);
    mocks.preview.mockReset();
  });
  async function candidate() {
    return {
      ...getProjectWorkspaceStarterCandidate('proj_1'),
      schemaBindings: [
        {
          canonicalName: 'test/schema',
          schemaName: 'Example',
          version: '1.0',
          mode: 'pinned' as const,
          schemaHash: `sha256:${createHash('sha256')
            .update(canonicalJson(definition as YValue))
            .digest('hex')}`,
        },
      ],
    };
  }
  it('selects the exact bound version and hash, not another published definition', async () => {
    const workspace = await candidate();
    mocks.versions.mockResolvedValue({
      items: [
        { canonicalName: 'test/schema', version: '2.0', schema: { ...definition, nodes: {} } },
        { canonicalName: 'test/schema', version: '1.0', schema: definition },
      ],
    });
    const { result } = renderHook(() => useWorkspaceDraftSchema(workspace));
    await waitFor(() => expect(result.current.definition).toEqual(definition));
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it('does not display a mismatched saved candidate as the bound definition', async () => {
    const workspace = await candidate();
    mocks.registry.mockResolvedValue({
      items: [
        { canonicalName: 'test/schema', version: '1.0', schema: { ...definition, nodes: {} } },
      ],
    });
    mocks.edit.mockResolvedValue({ authoringDraft: { resultSchemaHash: 'sha256:other' } });
    const { result } = renderHook(() => useWorkspaceDraftSchema(workspace));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.definition).toBeUndefined();
    expect(result.current.hasCandidate).toBe(true);
    expect(result.current.error).toMatch(/exact bound Schema/);
  });
  it('reuses read-only Studio preview only with exact frozen sources and matching result hash', async () => {
    const workspace = await candidate();
    const source = {
      projectId: null,
      canonicalName: 'test/schema',
      version: '1.0',
      hash: 'sha256:source',
      artifactVersionId: 'version1',
    };
    workspace.schemaBindings[0] = {
      ...workspace.schemaBindings[0],
      studioSources: [source],
    } as (typeof workspace.schemaBindings)[0];
    mocks.candidates.mockResolvedValue([{ id: 'source1', available: true, source }]);
    mocks.preview.mockResolvedValue({
      schema: definition,
      schemaHash: workspace.schemaBindings[0].schemaHash,
    });
    const { result } = renderHook(() => useWorkspaceDraftSchema(workspace));
    await waitFor(() => expect(result.current.definition).toEqual(definition));
    expect(mocks.preview).toHaveBeenCalledWith('proj_1', {
      candidateIds: ['source1'],
      workspaceId: workspace.id,
    });
  });
  it('clears the old Schema immediately on workspace change and ignores late reads', async () => {
    const first = await candidate();
    let finish!: (value: { items: unknown[] }) => void;
    mocks.registry.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const { result, rerender } = renderHook(({ workspace }) => useWorkspaceDraftSchema(workspace), {
      initialProps: { workspace: first },
    });
    rerender({ workspace: { ...first, id: 'other', schemaBindings: [] } });
    await act(async () => {
      finish({ items: [{ canonicalName: 'test/schema', version: '1.0', schema: definition }] });
    });
    expect(result.current.definition).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  it('rejects a Studio preview for a different Schema hash', async () => {
    const workspace = await candidate();
    const source = {
      projectId: null,
      canonicalName: 'test/schema',
      version: '1.0',
      hash: 'sha256:source',
      artifactVersionId: 'version1',
    };
    const withSource = {
      ...workspace,
      schemaBindings: [{ ...workspace.schemaBindings[0], studioSources: [source] }],
    };
    mocks.candidates.mockResolvedValue([{ id: 'source1', available: true, source }]);
    mocks.preview.mockResolvedValue({ schema: definition, schemaHash: 'sha256:another-candidate' });
    const { result } = renderHook(() => useWorkspaceDraftSchema(withSource));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.definition).toBeUndefined();
    expect(result.current.error).toMatch(/exact bound Schema/);
  });

  it('does not initialize or bind a Workspace that has no binding', async () => {
    const workspace = { ...getProjectWorkspaceStarterCandidate('proj_1'), schemaBindings: [] };
    const { result } = renderHook(() => useWorkspaceDraftSchema(workspace));
    expect(result.current.definition).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(mocks.registry).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  async function prepared() {
    const workspace = await candidate();
    workspace.revision = 13;
    Object.assign(workspace.schemaBindings[0], {
      canonicalName: 'prepared:immutable',
      compositionId: 'prepared:immutable',
      compositionRevision: 1,
      compositionHash: 'sha256:composition',
      mode: 'draft_override',
    });
    const view: Pick<WorkspaceAuthoringView, 'workspaceRevision' | 'currentSchema'> = {
      workspaceRevision: 13,
      currentSchema: {
        status: 'bound',
        schemaHash: workspace.schemaBindings[0].schemaHash,
        definition,
        bindings: structuredClone(workspace.schemaBindings),
      },
    };
    return { workspace, view };
  }

  it('reads the exact prepared snapshot without sources or reconstructing a newer candidate', async () => {
    const { workspace, view } = await prepared();
    mocks.edit.mockResolvedValue({ authoringDraft: { resultSchemaHash: 'sha256:new-candidate' } });
    const { result } = renderHook(() => useWorkspaceDraftSchema(workspace, view));
    await waitFor(() => expect(result.current.definition).toEqual(definition));
    expect(result.current.hasCandidate).toBe(true);
    expect(mocks.registry).not.toHaveBeenCalled();
    expect(mocks.versions).not.toHaveBeenCalled();
    expect(mocks.candidates).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it.each([
    'revision',
    'binding',
    'hash',
    'bytes',
    'missing',
  ] as const)('does not display or silently fall back from an authoritative snapshot with mismatched %s', async (mismatch) => {
    const { workspace, view } = await prepared();
    if (mismatch === 'revision') view.workspaceRevision--;
    if (mismatch === 'binding') view.currentSchema!.bindings[0]!.compositionRevision = 2;
    if (mismatch === 'hash') view.currentSchema!.schemaHash = `sha256:${'a'.repeat(64)}`;
    if (mismatch === 'bytes') view.currentSchema!.definition = { ...definition, nodes: {} };
    if (mismatch === 'missing')
      view.currentSchema = { status: 'unknown', schemaHash: null, definition: null, bindings: [] };
    const { result } = renderHook(() => useWorkspaceDraftSchema(workspace, view));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.definition).toBeUndefined();
    expect(result.current.error).toMatch(/exact bound Schema/);
    expect(mocks.registry).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('loads a newly received authoritative snapshot and discards an old snapshot on rebinding', async () => {
    const { workspace, view } = await prepared();
    const { result, rerender } = renderHook(
      ({ workspace, view }) => useWorkspaceDraftSchema(workspace, view),
      { initialProps: { workspace, view: null as typeof view | null } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.definition).toBeUndefined();
    rerender({ workspace, view });
    await waitFor(() => expect(result.current.definition).toEqual(definition));
    rerender({ workspace: { ...workspace, revision: 14 }, view });
    expect(result.current.definition).toBeUndefined();
    await waitFor(() => expect(result.current.error).toMatch(/exact bound Schema/));
  });
});
