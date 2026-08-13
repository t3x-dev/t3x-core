import { describe, expect, it } from 'vitest';
import {
  mergePublishedSchemaVersions,
  publishedManifestToRelease,
} from '@/domain/schemas/publishedSchemaVersions';
import { isSchemaReleaseBindable } from '@/domain/workspaces/schemaBindings';
import type { PublishedSchemaVersionManifest } from '@/types/schemaModules';

const manifest: PublishedSchemaVersionManifest = {
  apiVersion: 't3x.dev/yschema-core/v1',
  canonicalName: 'projects/proj_test/prd',
  version: '1.0.0',
  family: 'prd',
  title: 'Project PRD',
  description: 'A composed PRD contract.',
  status: 'deprecated',
  source: 'team',
  updatedAt: '2026-08-04T00:00:00.000Z',
  registry: { schemaHash: `sha256:${'a'.repeat(64)}` },
  schema: {
    yschema: '0.1',
    name: 'projects/proj_test/prd',
    version: '1.0.0',
    nodes: {
      summary: {
        required: true,
        requiredSlots: ['problem'],
        slots: { problem: { type: 'string', maxWords: 80 } },
      },
    },
  },
};

describe('published Schema version projections', () => {
  it('renders a published manifest as a reusable historical release', () => {
    const release = publishedManifestToRelease(manifest, 'proj_test');

    expect(release.schemaHash).toBe(`sha256:${'a'.repeat(64)}`);
    expect(release.structure).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'summary', required: true }),
        expect.objectContaining({ path: 'summary.problem', constraint: 'max 80 words' }),
      ])
    );
    expect(release.canonicalYaml).toContain('name: projects/proj_test/prd');
    expect(isSchemaReleaseBindable(release)).toBe(true);
  });

  it('projects a recorded comparison into version history', () => {
    const compared = publishedManifestToRelease(
      {
        ...manifest,
        version: '1.1.0',
        registry: {
          schemaHash: `sha256:${'b'.repeat(64)}`,
          comparison: {
            baseVersion: '1.0.0',
            baseSchemaHash: `sha256:${'a'.repeat(64)}`,
            changes: [
              {
                kind: 'ADD',
                path: 'nodes.summary.slots.audience',
                summary: 'Contract path added.',
              },
            ],
          },
        },
      },
      'proj_test'
    );

    expect(compared.changesBaseReleaseId).toBe('published:projects/proj_test/prd@1.0.0');
    expect(compared.changes).toEqual([
      {
        kind: 'ADD',
        path: 'nodes.summary.slots.audience',
        summary: 'Contract path added.',
      },
    ]);
  });

  it('places published versions into their Schema history without creating a default pointer', () => {
    const registry = {
      defaultFamilyId: 'prd',
      families: [
        {
          id: 'prd',
          name: 'PRD',
          canonicalName: 't3x/prd',
          description: 'PRD contracts',
          releases: [],
        },
        {
          id: 'prompt',
          name: 'Prompt',
          canonicalName: 't3x/prompt',
          description: 'Prompt contracts',
          releases: [],
        },
      ],
    };

    const promptManifest: PublishedSchemaVersionManifest = {
      ...manifest,
      canonicalName: 'projects/proj_test/prompt',
      family: 'prompt',
      title: 'Project Prompt',
    };

    const merged = mergePublishedSchemaVersions(registry, [manifest, promptManifest], 'proj_test');

    expect(merged.families[0]?.releases[0]).toMatchObject({
      canonicalName: manifest.canonicalName,
      version: manifest.version,
    });
    expect(merged.families[1]?.releases[0]).toMatchObject({
      canonicalName: promptManifest.canonicalName,
      version: promptManifest.version,
    });
  });

  it('creates a separate Schema history for Blueprint versions', () => {
    const registry = {
      defaultFamilyId: 'prd',
      families: [
        {
          id: 'prd',
          name: 'PRD',
          canonicalName: 't3x/prd',
          description: 'PRD contracts',
          releases: [],
        },
      ],
    };
    const blueprint: PublishedSchemaVersionManifest = {
      ...manifest,
      apiVersion: 't3x.dev/yschema-blueprint/v1',
      canonicalName: 'projects/proj_test/product-schema',
      title: 'Product Schema',
      status: 'active',
      family: undefined,
    };

    const merged = mergePublishedSchemaVersions(registry, [blueprint], 'proj_test');

    expect(merged.families).toHaveLength(2);
    expect(merged.families[1]).toMatchObject({
      id: 'blueprint:projects/proj_test/product-schema',
      name: 'Product Schema',
      canonicalName: 'projects/proj_test/product-schema',
    });
    expect(merged.families[1]?.releases[0]).toMatchObject({ version: '1.0.0' });
  });

  it('does not project legacy Draft manifests into Schema version history', () => {
    const registry = {
      defaultFamilyId: 'prd',
      families: [
        {
          id: 'prd',
          name: 'PRD',
          canonicalName: 't3x/prd',
          description: 'PRD contracts',
          releases: [],
        },
      ],
    };

    const merged = mergePublishedSchemaVersions(
      registry,
      [{ ...manifest, status: 'draft' }],
      'proj_test'
    );

    expect(merged.families[0]?.releases).toEqual([]);
  });
});
