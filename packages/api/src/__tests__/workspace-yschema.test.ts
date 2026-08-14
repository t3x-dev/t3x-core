import {
  builtInPrdCoreArtifact,
  builtInPrdModules,
  compileYSchemaComposition,
  normalizeYSchemaObject,
  sha256CompositionValue,
  type YSchemaCompositionDraft,
} from '@t3x-dev/yschema';
import { describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  findYSchemaArtifactVersion: vi.fn(),
  findYSchemaCompositionSnapshot: vi.fn(),
}));

vi.mock('@t3x-dev/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@t3x-dev/storage')>()),
  findYSchemaArtifactVersion: storageMock.findYSchemaArtifactVersion,
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

  it('resolves a deprecated project version by its exact identity and Schema hash', async () => {
    const schema = {
      yschema: '0.1' as const,
      name: 'projects/proj_history/prd',
      version: '1.0.0',
      strict: true,
      nodes: { summary: { required: true, repeated: false } },
    };
    const normalizedSchema = normalizeYSchemaObject(schema);
    const schemaHash = await sha256CompositionValue(normalizedSchema);
    storageMock.findYSchemaArtifactVersion.mockResolvedValueOnce({
      status: 'deprecated',
      manifest: {
        apiVersion: 't3x.dev/yschema-core/v1',
        schema,
      },
    });

    const resolved = await resolveWorkspaceYSchema(
      {
        schemaBindings: [
          {
            canonicalName: schema.name,
            schemaName: 'Historical PRD',
            version: schema.version,
            schemaHash,
          },
        ],
      },
      { select: vi.fn() } as never,
      'proj_history'
    );

    expect(storageMock.findYSchemaArtifactVersion).toHaveBeenCalledWith(expect.anything(), {
      canonical_name: schema.name,
      version: schema.version,
      project_id: 'proj_history',
    });
    expect(resolved).toEqual({
      canonicalName: schema.name,
      schema: normalizedSchema,
      version: schema.version,
    });
  });

  it('resolves a published Blueprint Schema by its exact identity and Schema hash', async () => {
    const schema = {
      yschema: '0.1' as const,
      name: 'projects/proj_blueprint/product-schema',
      version: '1.0.0',
      strict: false,
      nodes: { product: { required: true, repeated: false } },
    };
    const normalizedSchema = normalizeYSchemaObject(schema);
    const schemaHash = await sha256CompositionValue(normalizedSchema);
    storageMock.findYSchemaArtifactVersion.mockResolvedValueOnce({
      status: 'published',
      manifest: {
        apiVersion: 't3x.dev/yschema-blueprint/v1',
        schema,
        registry: { schemaHash },
      },
    });

    const resolved = await resolveWorkspaceYSchema(
      {
        schemaBindings: [
          {
            canonicalName: schema.name,
            schemaName: 'Product Schema',
            version: schema.version,
            schemaHash,
          },
        ],
      },
      { select: vi.fn() } as never,
      'proj_blueprint'
    );

    expect(resolved).toEqual({
      canonicalName: schema.name,
      schema: normalizedSchema,
      version: schema.version,
    });
  });

  it('rejects a Blueprint Schema when its bound hash does not match the published payload', async () => {
    const schema = {
      yschema: '0.1' as const,
      name: 'projects/proj_blueprint/product-schema',
      version: '1.0.0',
      strict: false,
      nodes: { product: { required: true, repeated: false } },
    };
    storageMock.findYSchemaArtifactVersion.mockResolvedValueOnce({
      status: 'published',
      manifest: {
        apiVersion: 't3x.dev/yschema-blueprint/v1',
        schema,
      },
    });

    const resolved = await resolveWorkspaceYSchema(
      {
        schemaBindings: [
          {
            canonicalName: schema.name,
            schemaName: 'Product Schema',
            version: schema.version,
            schemaHash: `sha256:${'0'.repeat(64)}`,
          },
        ],
      },
      { select: vi.fn() } as never,
      'proj_blueprint'
    );

    expect(resolved).toEqual({
      canonicalName: schema.name,
      schema: null,
      version: schema.version,
    });
  });
});
