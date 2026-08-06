import {
  type AnyDB,
  createMaterial,
  ensureMainBranch,
  insertProject,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inspectTransition } from '../lib/transition-control-plane';
import { reviewWorkspaceSourceTransition } from '../lib/workspace-source-transition';
import {
  decideWorkspaceTransition,
  WorkspaceTransitionReviewStaleError,
} from '../lib/workspace-transition';
import { setupTestDB, testData } from './setup';

describe('Workspace source Transition durable review', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => cleanup());

  it('materializes one inspectable Transition and reuses an exact review retry', async () => {
    const project = await insertProject(db, testData.project({ name: 'Source review identity' }));
    await ensureMainBranch(db, project.projectId);
    const workspaceId = 'workspace_source_identity';
    const source = ['esphome:', '  name: source-identity', 'esp32:', '  board: esp32dev'].join(
      '\n'
    );
    const material = await createMaterial(db, {
      project_id: project.projectId,
      source_type: 'document',
      title: 'device.yaml',
      content_text: source,
      content_hash: 'sha256:source-review-identity',
    });
    const draft = await upsertWorkspaceDraft(db, {
      project_id: project.projectId,
      workspace_id: workspaceId,
      title: 'Source identity Workspace',
      target_branch: 'main',
      workspace_state: {
        id: workspaceId,
        projectId: project.projectId,
        title: 'Source identity Workspace',
        targetBranch: 'main',
      },
    });
    const actor = { kind: 'human' as const, id: 'human:source-review' };
    const input = {
      projectId: project.projectId,
      workspaceId,
      artifact: {
        format: 't3x.dev/workspace-source-artifact/v1' as const,
        rootPath: 'device.yaml',
        resources: [],
      },
      change: {
        mode: 'import' as const,
        root: { materialId: material.id, contentHash: material.content_hash },
      },
      why: 'Import the server-resolved exact source.',
      expectedRevision: draft.revision,
      actor,
    };

    const first = await reviewWorkspaceSourceTransition(db, input);
    const second = await reviewWorkspaceSourceTransition(db, input);
    expect(second.transitionId).toBe(first.transitionId);

    const durable = await inspectTransition({
      db,
      projectId: project.projectId,
      transitionId: first.transitionId,
      actor,
    });
    expect(durable.requestKind).toBe('exact_source_import');
    expect(durable.precondition.effectDigest).toBe(first.precondition.effectDigest);
    expect(durable.precondition.statementDigests).toEqual(first.precondition.statementDigests);
    await expect(
      decideWorkspaceTransition(db, {
        projectId: project.projectId,
        workspaceId,
        transitionId: first.transitionId,
        content: { trees: [], relations: [] },
        outcome: 'accepted',
        precondition: {
          workspaceRevision: first.precondition.workspaceRevision,
          refHead: first.precondition.refHead,
          effectDigest: first.precondition.effectDigest,
          proposalDigest: first.precondition.proposalDigest,
          statementDigests: [...first.precondition.statementDigests],
          policyDigest: first.precondition.policyDigest,
        },
        actor,
      })
    ).rejects.toBeInstanceOf(WorkspaceTransitionReviewStaleError);
  });
});
