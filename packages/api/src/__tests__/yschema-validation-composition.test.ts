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

import { resolveValidationSchema } from '../lib/yschema-validation';

describe('Composition Commit validation schema resolution', () => {
  it('restores only the exact schema hash recorded by the Commit', async () => {
    const composition: YSchemaCompositionDraft = {
      apiVersion: 't3x.dev/yschema-composition/v1',
      id: 'composition:historical',
      revision: 4,
      family: 'prd',
      status: 'draft',
      core: { canonicalName: 't3x/prd-core', version: '1.1.0' },
      modules: [{ canonicalName: 't3x/prd-database-design', version: '1.0.0', order: 10 }],
    };
    const compiled = await compileYSchemaComposition({
      composition,
      core: builtInPrdCoreArtifact,
      modules: builtInPrdModules,
    });
    storageMock.findYSchemaCompositionSnapshot.mockResolvedValue({
      schemaJson: compiled.schema,
    });

    const restored = await resolveValidationSchema(
      {} as never,
      'proj_history',
      composition.id,
      'r4',
      compiled.compiledSchemaHash
    );
    const rejected = await resolveValidationSchema(
      {} as never,
      'proj_history',
      composition.id,
      'r4',
      `sha256:${'0'.repeat(64)}`
    );

    expect(restored).toEqual(compiled.schema);
    expect(rejected).toBeNull();
    expect(storageMock.findYSchemaCompositionSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        project_id: 'proj_history',
        composition_id: composition.id,
        composition_revision: 4,
      })
    );
  });
});
