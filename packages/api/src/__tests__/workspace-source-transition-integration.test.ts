import { describeTransitionObject } from '@t3x-dev/core';
import {
  type AnyDB,
  createMaterial,
  ensureMainBranch,
  insertProject,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inspectTransition } from '../lib/transition-control-plane';
import {
  decideWorkspaceSourceRevert,
  decideWorkspaceSourceTransition,
  reviewWorkspaceSourceRevert,
  reviewWorkspaceSourceTransition,
} from '../lib/workspace-source-transition';
import {
  decideWorkspaceTransition,
  WorkspaceTransitionReviewStaleError,
} from '../lib/workspace-transition';
import type {
  LocalOciCommandExecutor,
  LocalOciCommandResult,
} from '../lib/workspace-validation/local-oci-provider';
import { setupTestDB, testData } from './setup';

function commandResult(): LocalOciCommandResult {
  return { exit_code: 0, stdout: '', stderr: '' };
}

const runnerExecutor: LocalOciCommandExecutor = async () => commandResult();

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
    const capabilities = { runner: { executor: runnerExecutor } };
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

    const first = await reviewWorkspaceSourceTransition(db, input, capabilities);
    const second = await reviewWorkspaceSourceTransition(db, input, capabilities);
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

    const decisionInput = {
      ...input,
      transitionId: first.transitionId,
      outcome: 'accepted' as const,
      precondition: first.precondition,
    };
    await expect(
      decideWorkspaceSourceTransition(
        db,
        {
          ...decisionInput,
          precondition: {
            ...decisionInput.precondition,
            sourceSelectorDigest: `sha256:${'0'.repeat(64)}`,
          },
        },
        capabilities
      )
    ).rejects.toBeInstanceOf(WorkspaceTransitionReviewStaleError);
    const decided = await decideWorkspaceSourceTransition(db, decisionInput, capabilities);
    const retried = await decideWorkspaceSourceTransition(db, decisionInput, capabilities);
    expect(decided.commit).toBeDefined();
    expect(retried.commit).toEqual(decided.commit);
    expect(retried.decisionDigest).toBe(decided.decisionDigest);
    expect(retried.workspace).toEqual(decided.workspace);
    expect(retried.runner).toEqual(decided.runner);
    expect(retried.workspace?.sourceArtifact).toEqual(decided.workspace?.sourceArtifact);

    const importedRevision = decided.workspace?.revision;
    if (typeof importedRevision !== 'number') throw new Error('Import did not persist a revision');
    const editInput = {
      projectId: project.projectId,
      workspaceId,
      artifact: input.artifact,
      change: {
        mode: 'edit' as const,
        operations: [
          {
            op: 'replace_scalar' as const,
            path: ['esphome', 'name'],
            expect: 'source-identity',
            value: 'source-edited',
          },
        ],
      },
      why: 'Edit the exact source.',
      expectedRevision: importedRevision,
      actor,
    };
    const editReview = await reviewWorkspaceSourceTransition(db, editInput, capabilities);
    const editDecisionInput = {
      ...editInput,
      transitionId: editReview.transitionId,
      outcome: 'accepted' as const,
      precondition: editReview.precondition,
    };
    const edited = await decideWorkspaceSourceTransition(db, editDecisionInput, capabilities);
    const editedRetry = await decideWorkspaceSourceTransition(db, editDecisionInput, capabilities);
    expect(editedRetry.commit).toEqual(edited.commit);
    expect(editedRetry.workspace).toEqual(edited.workspace);

    if (edited.commit === undefined) throw new Error('Edit did not create a CommitV2');
    const editedRevision = edited.workspace?.revision;
    if (typeof editedRevision !== 'number') throw new Error('Edit did not persist a revision');
    const revertInput = {
      projectId: project.projectId,
      workspaceId,
      commitId: describeTransitionObject(edited.commit).digest,
      why: 'Revert the exact-source edit.',
      expectedRevision: editedRevision,
      actor,
    };
    const revertReview = await reviewWorkspaceSourceRevert(db, revertInput, capabilities);
    const revertDecisionInput = {
      ...revertInput,
      transitionId: revertReview.transitionId,
      outcome: 'accepted' as const,
      precondition: revertReview.precondition,
    };
    const reverted = await decideWorkspaceSourceRevert(db, revertDecisionInput, capabilities);
    const revertedRetry = await decideWorkspaceSourceRevert(db, revertDecisionInput, capabilities);
    expect(revertedRetry.commit).toEqual(reverted.commit);
    expect(revertedRetry.workspace).toEqual(reverted.workspace);
  });
});
