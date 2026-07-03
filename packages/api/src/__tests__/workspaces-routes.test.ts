import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  closeDB: vi.fn(() => Promise.resolve()),
  getDB: vi.fn(() => Promise.resolve({})),
}));

const storageMock = vi.hoisted(() => {
  let workspaceDraft: Record<string, unknown> | null = null;

  return {
    reset: () => {
      workspaceDraft = null;
    },
    findMaterialsByProject: vi.fn(() => Promise.resolve([])),
    findWorkspaceDraft: vi.fn((_db, projectId: string, workspaceId: string) =>
      Promise.resolve(
        workspaceDraft
          ? {
              id: 'draft_workspace',
              project_id: projectId,
              workspace_id: workspaceId,
              workspace_state: workspaceDraft,
              title: 'PRD audience handoff',
              status: 'editing',
              revision: 1,
              nodes: [],
              constraints: [],
              created_at: '2026-07-03T00:00:00.000Z',
              updated_at: '2026-07-03T00:00:00.000Z',
            }
          : null
      )
    ),
    listWorkspaceDrafts: vi.fn((_db, projectId: string) =>
      Promise.resolve(
        workspaceDraft
          ? [
              {
                id: 'draft_workspace',
                project_id: projectId,
                workspace_id: 'workspace_prd_handoff',
                workspace_state: workspaceDraft,
                title: 'PRD audience handoff',
                status: 'editing',
                revision: 1,
                nodes: [],
                constraints: [],
                created_at: '2026-07-03T00:00:00.000Z',
                updated_at: '2026-07-03T00:00:00.000Z',
              },
            ]
          : []
      )
    ),
    upsertWorkspaceDraft: vi.fn(
      (_db, input: { workspace_id: string; workspace_state: Record<string, unknown> }) => {
        workspaceDraft = input.workspace_state;
        return Promise.resolve({
          id: 'draft_workspace',
          project_id: 'proj_sources',
          workspace_id: input.workspace_id,
          workspace_state: workspaceDraft,
          title: 'PRD audience handoff',
          status: 'editing',
          revision: 1,
          nodes: [],
          constraints: [],
          created_at: '2026-07-03T00:00:00.000Z',
          updated_at: '2026-07-03T00:00:00.000Z',
        });
      }
    ),
  };
});

vi.mock('@t3x-dev/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/storage')>();
  return {
    ...actual,
    findMaterialsByProject: storageMock.findMaterialsByProject,
    findWorkspaceDraft: storageMock.findWorkspaceDraft,
    listWorkspaceDrafts: storageMock.listWorkspaceDrafts,
    upsertWorkspaceDraft: storageMock.upsertWorkspaceDraft,
  };
});

import { workspaceRoutes } from '../routes/workspaces.openapi';

// biome-ignore lint/suspicious/noExplicitAny: route responses are intentionally schema-flexible here.
type ApiResponse = any;

describe('Workspace routes', () => {
  const app = new Hono();
  app.route('/', workspaceRoutes);

  beforeEach(() => {
    storageMock.reset();
    storageMock.findMaterialsByProject.mockClear();
    storageMock.findWorkspaceDraft.mockClear();
    storageMock.listWorkspaceDrafts.mockClear();
    storageMock.upsertWorkspaceDraft.mockClear();
  });

  it('extracts schema candidates from each source instead of a single merged text blob', async () => {
    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_prd_handoff',
            projectId: 'proj_sources',
            schemaBindings: [{ schemaName: 'PRD Schema v2' }],
            sourceBundle: [],
          },
          sources: [
            {
              id: 'src_old',
              type: 'document',
              title: 'Old PRD',
              previewText: [
                'Problem: Old problem',
                'Audience: Old reviewers',
                'Outcome: Old outcome',
                'Requirement: Old requirement',
                'Priority: should',
                'Acceptance: Old acceptance',
              ].join('\n'),
            },
            {
              id: 'src_new',
              type: 'document',
              title: 'New PRD',
              previewText: [
                'Problem: New problem',
                'Audience: New reviewers',
                'Outcome: New outcome',
                'Requirement: New requirement',
                'Priority: must',
                'Acceptance: New acceptance',
              ].join('\n'),
            },
          ],
        }),
      }
    );

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);

    const fields = body.data.workspace.schemaCandidate.fields;
    const summary = fields.find((field: ApiResponse) => field.path === 'summary');
    const problem = summary.children.find((field: ApiResponse) => field.path === 'summary.problem');
    const audience = summary.children.find(
      (field: ApiResponse) => field.path === 'summary.audience'
    );
    expect(problem.value).toBe('New problem');
    expect(audience.evidence).toBe('New PRD: New reviewers');

    const requirements = fields.find((field: ApiResponse) => field.path === 'requirements');
    expect(requirements.children).toHaveLength(2);
    expect(requirements.children.map((field: ApiResponse) => field.path)).toEqual([
      'requirements.old_requirement',
      'requirements.new_requirement',
    ]);
    expect(requirements.children[1].children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'requirements.new_requirement.priority',
          value: 'must',
          evidence: 'New PRD: must',
        }),
      ])
    );
  });

  it('persists extract state and builds YOps from stored workspace state', async () => {
    const extractRes = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_prd_handoff',
            projectId: 'proj_sources',
            title: 'PRD audience handoff',
            targetBranch: 'feature/prd-audience',
            baseCommitHash: 'sha256:base',
            schemaBindings: [{ schemaName: 'PRD Schema v2' }],
            sourceBundle: [],
            yopsDraft: { id: 'draft_empty', operations: [] },
          },
          sources: [
            {
              id: 'src_new',
              type: 'document',
              title: 'New PRD',
              previewText: [
                'Problem: New problem',
                'Audience: New reviewers',
                'Outcome: New outcome',
                'Requirement: New requirement',
                'Priority: must',
                'Acceptance: New acceptance',
              ].join('\n'),
            },
          ],
        }),
      }
    );

    expect(extractRes.status).toBe(200);
    const extractBody: ApiResponse = await extractRes.json();
    expect(storageMock.upsertWorkspaceDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        project_id: 'proj_sources',
        workspace_id: 'workspace_prd_handoff',
        title: 'PRD audience handoff',
        parent_commit_hash: 'sha256:base',
        target_branch: 'feature/prd-audience',
      })
    );

    const yopsRes = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/yops-draft',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: { id: 'workspace_prd_handoff' } }),
      }
    );

    expect(yopsRes.status).toBe(200);
    const yopsBody: ApiResponse = await yopsRes.json();
    expect(yopsBody.data.workspace.schemaCandidate.fields.length).toBeGreaterThan(0);
    expect(yopsBody.data.workspace.yopsDraft.operations.length).toBeGreaterThan(0);
    expect(yopsBody.data.workspace.backendCandidateId).toBe(extractBody.data.candidate_id);
  });

  it('lists and reads persisted workspace state', async () => {
    await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_prd_handoff',
            projectId: 'proj_sources',
            title: 'PRD audience handoff',
            schemaBindings: [{ schemaName: 'PRD Schema v2' }],
            sourceBundle: [],
          },
          sources: [],
        }),
      }
    );

    const listRes = await app.request('/v1/projects/proj_sources/workspaces');
    expect(listRes.status).toBe(200);
    const listBody: ApiResponse = await listRes.json();
    expect(listBody.data.workspaces[0].id).toBe('workspace_prd_handoff');

    const getRes = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff');
    expect(getRes.status).toBe(200);
    const getBody: ApiResponse = await getRes.json();
    expect(getBody.data.workspace.id).toBe('workspace_prd_handoff');
  });
});
