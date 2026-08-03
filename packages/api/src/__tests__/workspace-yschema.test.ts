import {
  builtInPrdCoreArtifact,
  builtInPrdModules,
  compileYSchemaComposition,
  type YSchemaCompositionDraft,
} from '@t3x-dev/yschema';
import { describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  findYSchemaCompositionSnapshot: vi.fn(),
}));

vi.mock('@t3x-dev/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@t3x-dev/storage')>()),
  findYSchemaCompositionSnapshot: storageMock.findYSchemaCompositionSnapshot,
}));

import { resolveWorkspaceYSchema } from '../lib/workspace-yschema';

const composition: YSchemaCompositionDraft = {
  apiVersion: 't3x.dev/yschema-composition/v1',
  id: 'composition:runtime',
  revision: 2,
  family: 'prd',
  status: 'draft',
  core: { canonicalName: 't3x/prd-core', version: '1.1.0' },
  modules: [
    { canonicalName: 't3x/prd-system-architecture', version: '1.0.0', order: 10 },
    { canonicalName: 't3x/prd-technology-stack', version: '1.0.0', order: 20 },
  ],
};

describe('Workspace YSchema resolution', () => {
  it('recompiles and resolves an exact applied Composition', async () => {
    const compiled = await compileYSchemaComposition({
      composition,
      core: builtInPrdCoreArtifact,
      modules: builtInPrdModules,
    });
    const resolved = await resolveWorkspaceYSchema({
      schemaComposition: composition,
      schemaBindings: [
        {
          canonicalName: 't3x/prd',
          schemaName: 'PRD Composition',
          version: '1.1.0',
          mode: 'draft_override',
          schemaHash: compiled.compiledSchemaHash,
          compositionId: composition.id,
          compositionRevision: composition.revision,
          compositionHash: compiled.compositionHash,
        },
      ],
    });

    expect(resolved.canonicalName).toBe(composition.id);
    expect(resolved.version).toBe('r2');
    expect(resolved.schema?.nodes).toHaveProperty('system_architecture');
    expect(resolved.schema?.nodes).toHaveProperty('technology_stack');
  });

  it('does not silently fall back to Core when an applied hash is stale', async () => {
    const resolved = await resolveWorkspaceYSchema({
      schemaComposition: composition,
      schemaBindings: [
        {
          canonicalName: 't3x/prd',
          schemaName: 'PRD Composition',
          version: '1.1.0',
          schemaHash: `sha256:${'0'.repeat(64)}`,
          compositionId: composition.id,
          compositionRevision: composition.revision,
          compositionHash: `sha256:${'1'.repeat(64)}`,
        },
      ],
    });

    expect(resolved).toEqual({ canonicalName: composition.id, schema: null, version: 'r2' });
  });

  it('restores an applied contract from its immutable database snapshot', async () => {
    const compiled = await compileYSchemaComposition({
      composition,
      core: builtInPrdCoreArtifact,
      modules: builtInPrdModules,
    });
    storageMock.findYSchemaCompositionSnapshot.mockResolvedValueOnce({
      compositionHash: compiled.compositionHash,
      schemaJson: compiled.schema,
    });
    const workspace = {
      schemaBindings: [
        {
          schemaHash: compiled.compiledSchemaHash,
          compositionId: composition.id,
          compositionRevision: composition.revision,
          compositionHash: compiled.compositionHash,
        },
      ],
    };

    const resolved = await resolveWorkspaceYSchema(workspace, {} as never, 'proj_snapshot');

    expect(storageMock.findYSchemaCompositionSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        project_id: 'proj_snapshot',
        composition_id: composition.id,
        composition_revision: 2,
        compiled_schema_hash: compiled.compiledSchemaHash,
      })
    );
    expect(resolved.schema).toEqual(compiled.schema);
  });
});
