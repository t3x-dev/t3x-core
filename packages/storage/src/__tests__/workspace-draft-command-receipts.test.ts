import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertProject } from '../queries/projects';
import {
  digestWorkspaceDraftCommandRequestCanonicalJson,
  digestWorkspaceDraftCommandResultCanonicalJson,
  findWorkspaceDraftCommandReceipt,
  recordWorkspaceDraftCommandReceipt,
  WorkspaceDraftCommandConflictError,
} from '../queries/workspace-draft-command-receipts';
import { createTestDB, testData } from './setup';

describe('workspace draft command receipts', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  const actor = { kind: 'human' as const, id: 'local:anonymous' };
  const workspaceId = 'workspace_prd_handoff';

  beforeEach(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(db, testData.project({ name: 'Workspace Receipt Test' }));
    projectId = project.projectId;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('records and reuses a Workspace draft command receipt for identical facts', async () => {
    const resultWorkspaceState = {
      id: workspaceId,
      projectId,
      title: 'PRD audience handoff',
      status: 'draft',
      updatedAt: '2026-08-26T00:00:00.000Z',
    };
    const input = {
      projectId,
      workspaceId,
      command: 'draft.save',
      actor,
      requestId: 'req_workspace_save_1',
      requestDigest: digestWorkspaceDraftCommandRequestCanonicalJson(
        JSON.stringify({ command: 'draft.save', workspaceId, workspace: resultWorkspaceState })
      ),
      resultRevision: 1,
      resultDigest: digestWorkspaceDraftCommandResultCanonicalJson(
        JSON.stringify({ revision: 1, workspace: resultWorkspaceState })
      ),
      resultWorkspaceState,
    };

    const first = await recordWorkspaceDraftCommandReceipt(db, input);
    expect(first.reused).toBe(false);
    expect(first.receipt.resultRevision).toBe(1);
    expect(first.receipt.resultWorkspaceState.title).toBe('PRD audience handoff');

    const second = await recordWorkspaceDraftCommandReceipt(db, input);
    expect(second.reused).toBe(true);
    expect(second.receipt).toEqual(first.receipt);

    const found = await findWorkspaceDraftCommandReceipt(db, {
      projectId,
      workspaceId,
      actor,
      requestId: 'req_workspace_save_1',
    });
    expect(found?.requestDigest).toBe(input.requestDigest);
  });

  it('rejects the same request id when command facts change', async () => {
    const workspace = { id: workspaceId, projectId, title: 'Original', status: 'draft' };
    const base = {
      projectId,
      workspaceId,
      command: 'draft.save',
      actor,
      requestId: 'req_workspace_save_conflict',
      requestDigest: digestWorkspaceDraftCommandRequestCanonicalJson(JSON.stringify(workspace)),
      resultRevision: 1,
      resultDigest: digestWorkspaceDraftCommandResultCanonicalJson(JSON.stringify(workspace)),
      resultWorkspaceState: workspace,
    };

    await recordWorkspaceDraftCommandReceipt(db, base);

    await expect(
      recordWorkspaceDraftCommandReceipt(db, {
        ...base,
        requestDigest: digestWorkspaceDraftCommandRequestCanonicalJson(
          JSON.stringify({ ...workspace, title: 'Changed' })
        ),
      })
    ).rejects.toBeInstanceOf(WorkspaceDraftCommandConflictError);
  });
});
