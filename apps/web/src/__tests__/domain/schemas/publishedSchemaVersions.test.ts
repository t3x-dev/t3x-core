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

  it('places published versions into their Family history without changing current pointers', () => {
    const registry = {
      defaultFamilyId: 'prd',
      families: [
        {
          id: 'prd',
          name: 'PRD',
          canonicalName: 't3x/prd',
          description: 'PRD contracts',
          currentReleaseId: 'official-current',
          releases: [],
        },
        {
          id: 'prompt',
          name: 'Prompt',
          canonicalName: 't3x/prompt',
          description: 'Prompt contracts',
          currentReleaseId: 'prompt-current',
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

    expect(merged.families[0]?.currentReleaseId).toBe('official-current');
    expect(merged.families[0]?.releases[0]).toMatchObject({
      canonicalName: manifest.canonicalName,
      version: manifest.version,
    });
    expect(merged.families[1]?.currentReleaseId).toBe('prompt-current');
    expect(merged.families[1]?.releases[0]).toMatchObject({
      canonicalName: promptManifest.canonicalName,
      version: promptManifest.version,
    });
  });
});
