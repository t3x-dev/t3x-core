import { describe, expect, it } from 'vitest';
import {
  applyProjectWorkspaceSchemaBindings,
  schemaReleaseToWorkspaceBinding,
} from '@/domain/workspaces/schemaBindings';
import type { SchemaRelease } from '@/types/schemas';
import type { WorkspaceCandidate } from '@/types/workspaces';

const baseCandidate = {
  projectId: 'proj_1',
  summary: 'Summary',
  status: 'draft',
  updatedAt: '2026-07-01T00:00:00.000Z',
  baseCommitHash: null,
  targetBranch: 'main',
  sourceBundle: [],
  schemaCandidate: { summary: 'Candidate', fields: [] },
  schemaReview: { verdict: 'ready', summary: 'Ready', gaps: [] },
  yopsDraft: { id: 'draft_1', operations: [] },
  outputTargets: [],
} satisfies Omit<WorkspaceCandidate, 'id' | 'title' | 'schemaBindings'>;

const release = {
  id: 'schema_docker_v2',
  projectId: 'proj_1',
  name: 'Docker Compose',
  version: 'v2',
  status: 'active',
  description: 'Compose service template.',
  source: 'official',
  category: 'Infra',
  rootKey: 'compose',
  requiredFields: ['services.*.image'],
  compatibleWith: ['workspace yschema'],
  migrationSummary: 'Keeps service image identity stable.',
  breakingChangeLevel: 'minor',
  usedByCommitCount: 0,
  usedByWorkspaceCount: 0,
  releasedAt: '2026-07-01T00:00:00.000Z',
} satisfies SchemaRelease;

const candidates: WorkspaceCandidate[] = [
  {
    ...baseCandidate,
    id: 'workspace_pinned',
    title: 'Pinned workspace',
    schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
  },
  {
    ...baseCandidate,
    id: 'workspace_default',
    title: 'Default workspace',
    schemaBindings: [{ schemaName: 'Release Note Schema', version: 'v1', mode: 'project_default' }],
  },
];

describe('workspace schema bindings', () => {
  it('converts a schema release into a workspace binding', () => {
    expect(schemaReleaseToWorkspaceBinding(release, 'pinned')).toEqual({
      schemaName: 'Docker Compose',
      version: 'v2',
      mode: 'pinned',
    });
  });

  it('pins a selected schema to the current workspace', () => {
    const updated = applyProjectWorkspaceSchemaBindings(candidates, {
      byWorkspaceId: {
        workspace_pinned: schemaReleaseToWorkspaceBinding(release, 'pinned'),
      },
    });

    expect(updated[0].schemaBindings).toEqual([
      { schemaName: 'Docker Compose', version: 'v2', mode: 'pinned' },
    ]);
    expect(updated[1].schemaBindings).toEqual(candidates[1].schemaBindings);
  });

  it('updates project defaults without overriding pinned workspaces', () => {
    const updated = applyProjectWorkspaceSchemaBindings(candidates, {
      projectDefault: schemaReleaseToWorkspaceBinding(release, 'project_default'),
      byWorkspaceId: {},
    });

    expect(updated[0].schemaBindings).toEqual(candidates[0].schemaBindings);
    expect(updated[1].schemaBindings).toEqual([
      { schemaName: 'Docker Compose', version: 'v2', mode: 'project_default' },
    ]);
  });
});
