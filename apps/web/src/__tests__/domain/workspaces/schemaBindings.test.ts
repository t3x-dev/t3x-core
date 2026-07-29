import { describe, expect, it } from 'vitest';
import {
  applyProjectWorkspaceSchemaBindings,
  getProjectDefaultSchemaBinding,
  mergeProjectWorkspaceSchemaBindings,
  rebindWorkspaceCandidate,
  schemaReleaseToWorkspaceBinding,
  withProjectDefaultSchemaBinding,
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

  it('round-trips the project default through project metadata without dropping other metadata', () => {
    const binding = schemaReleaseToWorkspaceBinding(release, 'project_default');
    const metadata = withProjectDefaultSchemaBinding({ description: 'Infra project' }, binding);

    expect(metadata.description).toBe('Infra project');
    expect(getProjectDefaultSchemaBinding(metadata)).toEqual(binding);
  });

  it('merges persisted project defaults with live workspace overrides', () => {
    const projectDefault = schemaReleaseToWorkspaceBinding(release, 'project_default');
    const workspaceBinding = schemaReleaseToWorkspaceBinding(release, 'pinned');

    expect(
      mergeProjectWorkspaceSchemaBindings(
        { projectDefault, byWorkspaceId: {} },
        { byWorkspaceId: { workspace_pinned: workspaceBinding } }
      )
    ).toEqual({
      projectDefault,
      byWorkspaceId: { workspace_pinned: workspaceBinding },
    });
  });

  it('marks generated candidate and YOps state stale when a Workspace changes Schema', () => {
    const candidate = {
      ...candidates[0],
      schemaCandidate: {
        summary: 'Generated candidate',
        fields: [
          {
            id: 'field_1',
            path: 'summary.problem',
            label: 'Problem',
            type: 'string',
            required: true,
            status: 'covered' as const,
          },
        ],
      },
      yopsDraft: {
        id: 'draft_1',
        operations: [{ id: 'op_1', op: 'set', path: 'prd/summary/problem', summary: 'Set' }],
      },
    };

    const rebound = rebindWorkspaceCandidate(
      candidate,
      schemaReleaseToWorkspaceBinding(release, 'pinned'),
      '2026-07-29T00:00:00.000Z'
    );

    expect(rebound.status).toBe('draft');
    expect(rebound.updatedAt).toBe('2026-07-29T00:00:00.000Z');
    expect(rebound.schemaCandidate.fields).toEqual([]);
    expect(rebound.schemaReview.verdict).toBe('needs_review');
    expect(rebound.yopsDraft.operations).toEqual([]);
  });

  it('replaces stale overrides instead of retaining multiple active Schema bindings', () => {
    const candidate = {
      ...candidates[0],
      schemaBindings: [
        { schemaName: 'Draft Schema', version: 'v3', mode: 'draft_override' as const },
        { schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' as const },
      ],
    };

    const rebound = rebindWorkspaceCandidate(
      candidate,
      schemaReleaseToWorkspaceBinding(release, 'pinned')
    );

    expect(rebound.schemaBindings).toEqual([
      { schemaName: 'Docker Compose', version: 'v2', mode: 'pinned' },
    ]);
  });
});
