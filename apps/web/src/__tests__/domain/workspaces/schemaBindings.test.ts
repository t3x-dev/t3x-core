import { describe, expect, it } from 'vitest';
import { getSchemaRegistryPreview } from '@/data/schemaReleases';
import {
  applyProjectWorkspaceSchemaBindings,
  mergeProjectWorkspaceSchemaBindings,
  rebindWorkspaceCandidate,
  schemaReleaseToWorkspaceBinding,
} from '@/domain/workspaces/schemaBindings';
import type { WorkspaceCandidate } from '@/types/workspaces';

const PROMPT_SCHEMA_HASH =
  'sha256:1d05f6c4ae0aeef34f15714e166377e4fd4c08644c885a2ddc7c2e50bf39f930';

const baseCandidate = {
  revision: 1,
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

const registry = getSchemaRegistryPreview('proj_1');
const release = registry.families.find((family) => family.id === 'prompt')?.releases[0];
const draftRelease = registry.families
  .find((family) => family.id === 'prd')
  ?.releases.find((candidate) => candidate.status === 'draft');

if (!release || !draftRelease) throw new Error('Schema release fixtures are incomplete');

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
    schemaBindings: [{ schemaName: 'Release Note Schema', version: 'v1', mode: 'pinned' }],
  },
];

describe('workspace schema bindings', () => {
  it('converts a schema release into a workspace binding', () => {
    expect(schemaReleaseToWorkspaceBinding(release, 'pinned')).toEqual({
      canonicalName: 't3x/prompt',
      schemaHash: PROMPT_SCHEMA_HASH,
      schemaName: 'Prompt Schema',
      version: 'v1',
      mode: 'pinned',
    });
  });

  it('rejects draft or runtime-unavailable releases', () => {
    expect(() => schemaReleaseToWorkspaceBinding(draftRelease, 'draft_override')).toThrow(
      'is not available for binding'
    );
    expect(() =>
      schemaReleaseToWorkspaceBinding({ ...release, runtimeAvailable: false }, 'pinned')
    ).toThrow('is not available for binding');
  });

  it('pins a selected schema to the current workspace', () => {
    const updated = applyProjectWorkspaceSchemaBindings(candidates, {
      byWorkspaceId: {
        workspace_pinned: schemaReleaseToWorkspaceBinding(release, 'pinned'),
      },
    });

    expect(updated[0].schemaBindings).toEqual([
      {
        canonicalName: 't3x/prompt',
        schemaHash: PROMPT_SCHEMA_HASH,
        schemaName: 'Prompt Schema',
        version: 'v1',
        mode: 'pinned',
      },
    ]);
    expect(updated[1].schemaBindings).toEqual(candidates[1].schemaBindings);
  });

  it('merges only live Workspace-specific bindings', () => {
    const workspaceBinding = schemaReleaseToWorkspaceBinding(release, 'pinned');

    expect(
      mergeProjectWorkspaceSchemaBindings(
        { byWorkspaceId: {} },
        { byWorkspaceId: { workspace_pinned: workspaceBinding } }
      )
    ).toEqual({
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
      {
        canonicalName: 't3x/prompt',
        schemaHash: PROMPT_SCHEMA_HASH,
        schemaName: 'Prompt Schema',
        version: 'v1',
        mode: 'pinned',
      },
    ]);
  });

  it('treats a changed release hash as a stale binding even when name and version match', () => {
    const promptBinding = schemaReleaseToWorkspaceBinding(release, 'pinned');
    const candidate = {
      ...candidates[0],
      schemaBindings: [{ ...promptBinding, schemaHash: `sha256:${'0'.repeat(64)}` }],
    };

    const rebound = rebindWorkspaceCandidate(candidate, promptBinding);

    expect(rebound).not.toBe(candidate);
    expect(rebound.schemaBindings).toEqual([promptBinding]);
    expect(rebound.schemaReview.verdict).toBe('needs_review');
  });
});
