import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  ConflictError,
  findWorkspaceDraft,
  listWorkspaceDrafts,
  upsertWorkspaceDraft,
} from '../queries/drafts';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

function workspaceState(status: string, projectId: string): Record<string, unknown> {
  return {
    id: 'workspace_prd_handoff',
    projectId,
    title: 'PRD audience handoff',
    status,
    updatedAt: '2026-07-03T00:00:00.000Z',
    baseCommitHash: 'sha256:base',
    targetBranch: 'feature/prd-audience',
    sourceBundle: [],
    schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
    schemaCandidate: { summary: 'mapped', fields: [] },
    schemaReview: { verdict: 'ready', summary: 'ready', gaps: [] },
    yopsDraft: { id: 'draft:candidate:workspace_prd_handoff', operations: [] },
    outputTargets: [],
    backendCandidateId: 'candidate:workspace_prd_handoff',
  };
}

describe('workspace drafts', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeEach(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(db, testData.project({ name: 'Workspace Draft Test' }));
    projectId = project.projectId;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('upserts, lists, and finds persisted workspace staged state', async () => {
    const first = await upsertWorkspaceDraft(db, {
      project_id: projectId,
      workspace_id: 'workspace_prd_handoff',
      title: 'PRD audience handoff',
      parent_commit_hash: 'sha256:base',
      target_branch: 'feature/prd-audience',
      workspace_state: workspaceState('draft', projectId),
    });

    expect(first.id).toMatch(/^draft_/);
    expect(first.workspace_id).toBe('workspace_prd_handoff');
    expect(first.workspace_state?.status).toBe('draft');
    expect(first.parent_commit_hash).toBe('sha256:base');
    expect(first.target_branch).toBe('feature/prd-audience');

    const second = await upsertWorkspaceDraft(
      db,
      {
        project_id: projectId,
        workspace_id: 'workspace_prd_handoff',
        title: 'PRD audience handoff',
        parent_commit_hash: 'sha256:base',
        target_branch: 'feature/prd-audience',
        workspace_state: workspaceState('ready_for_yops', projectId),
      },
      first.revision
    );

    expect(second.id).toBe(first.id);
    expect(second.revision).toBe(first.revision + 1);
    expect(second.status).toBe('editing');
    expect(second.workspace_state?.status).toBe('ready_for_yops');

    const conflictingUpdate = {
      project_id: projectId,
      workspace_id: 'workspace_prd_handoff',
      title: 'Conflicting update',
      target_branch: 'feature/prd-audience',
      workspace_state: workspaceState('schema_review', projectId),
    };
    await expect(
      upsertWorkspaceDraft(db, conflictingUpdate, first.revision)
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(upsertWorkspaceDraft(db, conflictingUpdate)).rejects.toBeInstanceOf(ConflictError);

    const found = await findWorkspaceDraft(db, projectId, 'workspace_prd_handoff');
    expect(found?.id).toBe(first.id);
    expect(found?.workspace_state?.backendCandidateId).toBe('candidate:workspace_prd_handoff');

    const list = await listWorkspaceDrafts(db, projectId);
    expect(list.map((draft) => draft.workspace_id)).toEqual(['workspace_prd_handoff']);

    await expect(
      upsertWorkspaceDraft(db, {
        project_id: projectId,
        workspace_id: 'workspace_b',
        title: 'Workspace B',
        target_branch: 'feature/prd-audience',
        workspace_state: { ...workspaceState('schema_review', projectId), id: 'workspace_b' },
      })
    ).rejects.toThrow();

    await upsertWorkspaceDraft(
      db,
      {
        project_id: projectId,
        workspace_id: 'workspace_prd_handoff',
        title: 'Committed workspace',
        target_branch: 'feature/prd-audience',
        workspace_state: {
          ...workspaceState('committed', projectId),
          id: 'workspace_prd_handoff',
          lastCommitHash: 'sha256:committed',
        },
      },
      second.revision
    );

    const openWorkspace = await upsertWorkspaceDraft(db, {
      project_id: projectId,
      workspace_id: 'workspace_next',
      title: 'Next workspace',
      parent_commit_hash: 'sha256:committed',
      target_branch: 'feature/prd-audience',
      workspace_state: {
        ...workspaceState('draft', projectId),
        id: 'workspace_next',
        baseCommitHash: 'sha256:committed',
      },
    });

    expect(openWorkspace.workspace_id).toBe('workspace_next');
  });
});
