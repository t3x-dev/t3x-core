import type { SchemaRelease } from '@/types/schemas';

const schemaReleases: SchemaRelease[] = [
  {
    id: 'schema_prd_v3',
    projectId: 'preview_project',
    name: 'PRD Schema',
    version: 'v3',
    status: 'draft',
    usedByCommitCount: 0,
    usedByWorkspaceCount: 1,
    breakingChangeLevel: 'minor',
  },
  {
    id: 'schema_prd_v2',
    projectId: 'preview_project',
    name: 'PRD Schema',
    version: 'v2',
    status: 'active',
    releasedAt: '2026-06-20T00:00:00.000Z',
    releasedBy: 'HLQ',
    usedByCommitCount: 8,
    usedByWorkspaceCount: 2,
    breakingChangeLevel: 'none',
  },
  {
    id: 'schema_release_v1',
    projectId: 'preview_project',
    name: 'Release Note Schema',
    version: 'v1',
    status: 'deprecated',
    usedByCommitCount: 1,
    usedByWorkspaceCount: 0,
    breakingChangeLevel: 'breaking',
  },
];

export function getSchemaReleasePreviews(projectId: string): SchemaRelease[] {
  return schemaReleases.map((release) => ({ ...release, projectId }));
}
