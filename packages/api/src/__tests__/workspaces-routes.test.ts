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

  it('saves reviewed workspace draft state for later recovery', async () => {
    const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'client_side_id_is_ignored',
          projectId: 'client_project_is_ignored',
          title: 'Reviewed PRD workspace',
          status: 'schema_review',
          updatedAt: '2026-01-01T00:00:00.000Z',
          targetBranch: 'feature/reviewed-prd',
          baseCommitHash: 'sha256:review-base',
          sourceBundle: [{ id: 'src_1', type: 'document', title: 'Reviewed source' }],
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          schemaCandidate: {
            summary: 'User reviewed candidate.',
            fields: [],
          },
          schemaReview: {
            verdict: 'ready',
            summary: 'Ready after user review.',
            gaps: [],
          },
          yopsDraft: {
            id: 'draft:reviewed',
            operations: [],
          },
          outputTargets: [],
        },
      }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.workspace).toEqual(
      expect.objectContaining({
        id: 'workspace_prd_handoff',
        projectId: 'proj_sources',
        title: 'Reviewed PRD workspace',
        status: 'schema_review',
      })
    );
    expect(body.data.workspace.updatedAt).toEqual(expect.any(String));
    expect(body.data.workspace.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
    expect(Number.isNaN(Date.parse(body.data.workspace.updatedAt))).toBe(false);
    expect(storageMock.upsertWorkspaceDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        project_id: 'proj_sources',
        workspace_id: 'workspace_prd_handoff',
        title: 'Reviewed PRD workspace',
        parent_commit_hash: 'sha256:review-base',
        target_branch: 'feature/reviewed-prd',
      })
    );

    const getRes = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff');
    expect(getRes.status).toBe(200);
    const getBody: ApiResponse = await getRes.json();
    expect(getBody.data.workspace.schemaCandidate.summary).toBe('User reviewed candidate.');
  });

  it('preserves backend workspace metadata when saving reviewed state', async () => {
    const extractRes = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_prd_handoff',
            projectId: 'proj_sources',
            title: 'Backend extracted workspace',
            schemaBindings: [{ schemaName: 'PRD Schema v2' }],
            sourceBundle: [],
            yopsDraft: { id: 'draft:stable-extracted', operations: [] },
          },
          sources: [
            {
              id: 'src_backend',
              type: 'document',
              title: 'Backend source',
              previewText: 'Problem: Backend extracted problem',
            },
          ],
        }),
      }
    );
    const extractBody: ApiResponse = await extractRes.json();
    const extractedCandidateId = extractBody.data.candidate_id;

    const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'Reviewed without backend fields',
          backendCandidateId: 'candidate:client-forged',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [],
          yopsDraft: { id: 'draft:stable-extracted', operations: [] },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.candidate_id).toBe(extractedCandidateId);
    expect(body.data.workspace.backendCandidateId).toBe(extractedCandidateId);
  });

  it('does not let review saves mark the workspace committed', async () => {
    const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'Reviewed but not committed',
          status: 'committed',
          lastCommitHash: 'sha256:client-forged-commit',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [],
          yopsDraft: { id: 'draft:review-save', operations: [] },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.workspace.status).toBe('schema_review');
    expect(body.data.workspace.lastCommitHash).toBeUndefined();
  });

  it('normalizes invalid review save statuses before persisting', async () => {
    const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'Invalid status workspace',
          status: 'not_a_real_workspace_status',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [],
          yopsDraft: { id: 'draft:invalid-status', operations: [] },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.workspace.status).toBe('draft');
  });
});
