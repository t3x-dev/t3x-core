import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describeTransitionObject } from '@t3x-dev/core';
import {
  type AnyDB,
  createMaterial,
  ensureMainBranch,
  findBranchByName,
  getTransitionRefHead,
  insertBranch,
  insertProject,
  listRepositoryDecisionAudit,
  listTransitionCommits,
  updateBranchHead,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildWorkspaceSourceProposal,
  decideWorkspaceSourceRevert,
  decideWorkspaceSourceTransition,
  reviewWorkspaceSourceRevert,
  reviewWorkspaceSourceTransition,
  WORKSPACE_SOURCE_ARTIFACT_FORMAT,
  WorkspaceSourceArtifactError,
  type WorkspaceSourceArtifactSelector,
  WorkspaceSourceInputsError,
  WorkspaceSourceRevertUnavailableError,
  type WorkspaceSourceRunnerCapability,
} from '../lib/workspace-source-transition';
import {
  WorkspaceTransitionDecisionDeniedError,
  WorkspaceTransitionReviewStaleError,
} from '../lib/workspace-transition';
import type {
  LocalOciCommandExecutor,
  LocalOciCommandResult,
} from '../lib/workspace-validation/local-oci-provider';
import { setupTestDB, testData } from './setup';

const HUMAN = { kind: 'human' as const, id: 'user:source-maintainer' };
const ROOT_PATH = 'device.yaml';
const BASE_SOURCE = [
  '# Preserve the exact source.',
  'esphome:',
  '  name: greenhouse-sensor',
  'logger:',
  '  level: DEBUG # Keep this comment.',
  '',
].join('\n');
const SECRET_SOURCE = [
  'esphome:',
  '  name: secret-sensor',
  'logger:',
  '  level: DEBUG',
  'wifi:',
  '  ssid: !secret wifi_ssid',
  '  password: !secret wifi_password',
  '',
].join('\n');
const TRANSIENT_SECRETS = {
  wifi_password: 'must-never-be-persisted-password',
  wifi_ssid: 'must-never-be-persisted-ssid',
};

function contentHash(source: string): string {
  return `sha256:${createHash('sha256').update(source, 'utf8').digest('hex')}`;
}

async function material(db: AnyDB, projectId: string, title: string, source: string) {
  return createMaterial(db, {
    project_id: projectId,
    source_type: 'document',
    title,
    filename: ROOT_PATH,
    mime_type: 'application/yaml',
    content_text: source,
    content_hash: contentHash(source),
  });
}

async function workspace(db: AnyDB, projectId: string, workspaceId: string, targetBranch = 'main') {
  return upsertWorkspaceDraft(db, {
    project_id: projectId,
    workspace_id: workspaceId,
    title: `Workspace ${workspaceId}`,
    target_branch: targetBranch,
    workspace_state: {
      id: workspaceId,
      projectId,
      title: `Workspace ${workspaceId}`,
      targetBranch,
    },
  });
}

function artifact(
  resources: WorkspaceSourceArtifactSelector['resources'] = []
): WorkspaceSourceArtifactSelector {
  return {
    format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
    rootPath: ROOT_PATH,
    resources,
  };
}

function commandResult(input: Partial<LocalOciCommandResult>): LocalOciCommandResult {
  return {
    exit_code: Object.hasOwn(input, 'exit_code') ? (input.exit_code ?? null) : 0,
    stdout: input.stdout ?? '',
    stderr: input.stderr ?? '',
    timed_out: input.timed_out,
    output_truncated: input.output_truncated,
    error: input.error,
  };
}

function dockerExecutor(result: LocalOciCommandResult): LocalOciCommandExecutor {
  return async (command, args) => {
    if (command === 'docker' && args[0] === 'info') return commandResult({ exit_code: 0 });
    if (command === 'docker' && args[0] === 'run') return result;
    return commandResult({ exit_code: null, error: { code: 'ENOENT', message: 'not found' } });
  };
}

function runner(
  executor: LocalOciCommandExecutor,
  tempRoot: string
): WorkspaceSourceRunnerCapability {
  return { executor, tempRoot };
}

let db: AnyDB;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
});

afterAll(async () => cleanup());

describe('exact-source Workspace Transition application use case', () => {
  it('imports exact source through Replay and commits without fabricating validation or Runner evidence', async () => {
    const project = await insertProject(db, testData.project({ name: 'Source Import' }));
    await ensureMainBranch(db, project.projectId);
    const root = await material(db, project.projectId, 'ESPHome root', SECRET_SOURCE);
    const draft = await workspace(db, project.projectId, 'source-import');
    const proposalInput = {
      projectId: project.projectId,
      workspaceId: 'source-import',
      artifact: artifact(),
      change: {
        mode: 'import' as const,
        root: { materialId: root.id, contentHash: root.content_hash },
      },
      why: 'Import the existing device configuration without rewriting it.',
      expectedRevision: draft.revision,
      actor: HUMAN,
    };
    const built = await buildWorkspaceSourceProposal(db, proposalInput);
    const review = await reviewWorkspaceSourceTransition(db, {
      ...proposalInput,
    });

    expect(review.transition.audit.effect?.digest).toBe(
      describeTransitionObject(built.effect).digest
    );
    expect(review.transition.audit.proposal?.digest).toBe(
      describeTransitionObject(built.proposal).digest
    );

    expect(review.runner).toEqual({
      mode: 'inputs_unavailable',
      reason: 'secret_resolver_unavailable',
      secretReferenceNames: ['wifi_password', 'wifi_ssid'],
    });
    expect(review.transition).toMatchObject({
      claims: {
        actor: HUMAN,
        intent: { mode: 'unspecified' },
        rationale: {
          mode: 'authored',
          value: 'Import the existing device configuration without rewriting it.',
        },
      },
      checks: {
        objectIntegrity: 'verified',
        replay: { observation: 'observed', outcomes: ['verified'] },
        validation: { observation: 'no_statement_observed' },
        runner: { observation: 'no_statement_observed' },
      },
      capabilities: { accept: { disposition: 'allowed' } },
    });
    expect(review.precondition.sourceInputManifestDigest).toBeNull();

    const decided = await decideWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-import',
      artifact: artifact(),
      change: {
        mode: 'import',
        root: { materialId: root.id, contentHash: root.content_hash },
      },
      why: 'Import the existing device configuration without rewriting it.',
      outcome: 'accepted',
      precondition: review.precondition,
      actor: HUMAN,
    });

    expect(decided.commit).toMatchObject({ schema: 't3x/commit/v2', parents: [] });
    const head = await getTransitionRefHead(db, {
      projectId: project.projectId,
      refName: 'main',
    });
    expect(head).toMatchObject({ format: 'transition_v2', state: { value: SECRET_SOURCE } });
    expect(decided.workspace).toMatchObject({
      status: 'committed',
      revision: 2,
      sourceArtifact: {
        format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
        rootPath: ROOT_PATH,
        root: { materialId: root.id, contentHash: root.content_hash },
      },
    });
  });

  it('edits only the addressed scalar and advances append-only child history', async () => {
    const project = await insertProject(db, testData.project({ name: 'Source Edit' }));
    await ensureMainBranch(db, project.projectId);
    const root = await material(db, project.projectId, 'Editable root', BASE_SOURCE);
    await workspace(db, project.projectId, 'source-edit-import');
    const imported = await reviewWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-edit-import',
      artifact: artifact(),
      change: { mode: 'import', root: { materialId: root.id } },
      actor: HUMAN,
    });
    const genesis = await decideWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-edit-import',
      artifact: artifact(),
      change: { mode: 'import', root: { materialId: root.id } },
      outcome: 'accepted',
      precondition: imported.precondition,
      actor: HUMAN,
    });

    await workspace(db, project.projectId, 'source-edit-child');
    const change = {
      mode: 'edit' as const,
      operations: [
        {
          op: 'replace_scalar' as const,
          path: ['logger', 'level'],
          expect: 'DEBUG',
          value: 'INFO',
        },
      ],
    };
    const review = await reviewWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-edit-child',
      artifact: artifact(),
      change,
      why: 'Reduce production log volume.',
      actor: HUMAN,
    });
    const decided = await decideWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-edit-child',
      artifact: artifact(),
      change,
      why: 'Reduce production log volume.',
      outcome: 'accepted',
      precondition: review.precondition,
      actor: HUMAN,
    });

    expect(decided.commit?.parents).toEqual([
      expect.objectContaining({ digest: genesis.transition.audit.commit?.digest }),
    ]);
    const head = await getTransitionRefHead(db, {
      projectId: project.projectId,
      refName: 'main',
    });
    if (head.format !== 'transition_v2') throw new Error('Expected a TransitionV2 head');
    expect(head.state.value).toBe(BASE_SOURCE.replace('level: DEBUG', 'level: INFO'));
    expect(head.state.value).toContain('# Preserve the exact source.');
    expect(head.state.value).toContain('# Keep this comment.');
    expect(await listTransitionCommits(db, project.projectId)).toHaveLength(2);
  });

  it('reviews a server-derived reverse Effect and commits an append-only revert child', async () => {
    const project = await insertProject(db, testData.project({ name: 'Source Revert' }));
    await ensureMainBranch(db, project.projectId);
    const root = await material(db, project.projectId, 'Revert root', BASE_SOURCE);
    await workspace(db, project.projectId, 'source-revert');
    const imported = await reviewWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert',
      artifact: artifact(),
      change: { mode: 'import', root: { materialId: root.id } },
      actor: HUMAN,
    });
    await decideWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert',
      artifact: artifact(),
      change: { mode: 'import', root: { materialId: root.id } },
      outcome: 'accepted',
      precondition: imported.precondition,
      actor: HUMAN,
    });
    const change = {
      mode: 'edit' as const,
      operations: [
        {
          op: 'replace_scalar' as const,
          path: ['logger', 'level'],
          expect: 'DEBUG',
          value: 'INFO',
        },
      ],
    };
    const editedReview = await reviewWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert',
      artifact: artifact(),
      change,
      why: 'Reduce production log volume.',
      actor: HUMAN,
    });
    const edited = await decideWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert',
      artifact: artifact(),
      change,
      why: 'Reduce production log volume.',
      outcome: 'accepted',
      precondition: editedReview.precondition,
      actor: HUMAN,
    });
    const editedCommitId = edited.transition.audit.commit?.digest;
    if (editedCommitId === undefined) throw new Error('Expected committed source edit');

    const review = await reviewWorkspaceSourceRevert(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert',
      commitId: editedCommitId,
      why: 'Restore the previous logging level.',
      actor: HUMAN,
    });
    expect(review.transition).toMatchObject({
      change: {
        base: edited.transition.change.result,
        result: edited.transition.change.base,
        operations: [
          {
            op: 'replace_scalar',
            path: ['logger', 'level'],
            expect: 'INFO',
            value: 'DEBUG',
          },
        ],
      },
      claims: {
        rationale: { mode: 'authored', value: 'Restore the previous logging level.' },
      },
      checks: { replay: { observation: 'observed', outcomes: ['verified'] } },
    });

    const rejected = await decideWorkspaceSourceRevert(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert',
      commitId: editedCommitId,
      why: 'Restore the previous logging level.',
      outcome: 'rejected',
      decisionReason: 'Keep INFO while diagnosing the device.',
      precondition: review.precondition,
      actor: HUMAN,
    });
    expect(rejected.commit).toBeUndefined();
    expect(
      (await getTransitionRefHead(db, { projectId: project.projectId, refName: 'main' })).head
    ).toBe(editedCommitId);
    expect(await listTransitionCommits(db, project.projectId)).toHaveLength(2);

    const reviewedAgain = await reviewWorkspaceSourceRevert(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert',
      commitId: editedCommitId,
      why: 'Restore the previous logging level.',
      actor: HUMAN,
    });
    const reverted = await decideWorkspaceSourceRevert(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert',
      commitId: editedCommitId,
      why: 'Restore the previous logging level.',
      outcome: 'accepted',
      precondition: reviewedAgain.precondition,
      actor: HUMAN,
    });
    expect(reverted.commit?.parents).toEqual([expect.objectContaining({ digest: editedCommitId })]);
    const head = await getTransitionRefHead(db, {
      projectId: project.projectId,
      refName: 'main',
    });
    if (head.format !== 'transition_v2') throw new Error('Expected a TransitionV2 head');
    expect(head.state.value).toBe(BASE_SOURCE);
    expect(reverted.transition.change.result).toEqual(edited.transition.change.base);
    expect(await listTransitionCommits(db, project.projectId)).toHaveLength(3);
  });

  it('refuses import and stale edit reverts without changing repository history', async () => {
    const project = await insertProject(db, testData.project({ name: 'Source Revert Guards' }));
    await ensureMainBranch(db, project.projectId);
    const root = await material(db, project.projectId, 'Revert guard root', BASE_SOURCE);
    await workspace(db, project.projectId, 'source-revert-guards');
    const importReview = await reviewWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert-guards',
      artifact: artifact(),
      change: { mode: 'import', root: { materialId: root.id } },
      actor: HUMAN,
    });
    const imported = await decideWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert-guards',
      artifact: artifact(),
      change: { mode: 'import', root: { materialId: root.id } },
      outcome: 'accepted',
      precondition: importReview.precondition,
      actor: HUMAN,
    });
    const importCommitId = imported.transition.audit.commit?.digest;
    if (importCommitId === undefined) throw new Error('Expected committed source import');
    await expect(
      reviewWorkspaceSourceRevert(db, {
        projectId: project.projectId,
        workspaceId: 'source-revert-guards',
        commitId: importCommitId,
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(WorkspaceSourceRevertUnavailableError);

    const firstChange = {
      mode: 'edit' as const,
      operations: [
        {
          op: 'replace_scalar' as const,
          path: ['logger', 'level'],
          expect: 'DEBUG',
          value: 'INFO',
        },
      ],
    };
    const firstReview = await reviewWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert-guards',
      artifact: artifact(),
      change: firstChange,
      actor: HUMAN,
    });
    const firstEdit = await decideWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert-guards',
      artifact: artifact(),
      change: firstChange,
      outcome: 'accepted',
      precondition: firstReview.precondition,
      actor: HUMAN,
    });
    const firstEditId = firstEdit.transition.audit.commit?.digest;
    if (firstEditId === undefined) throw new Error('Expected committed source edit');
    const revertReview = await reviewWorkspaceSourceRevert(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert-guards',
      commitId: firstEditId,
      actor: HUMAN,
    });

    const competingChange = {
      mode: 'edit' as const,
      operations: [
        {
          op: 'replace_scalar' as const,
          path: ['logger', 'level'],
          expect: 'INFO',
          value: 'WARN',
        },
      ],
    };
    const competingReview = await reviewWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert-guards',
      artifact: artifact(),
      change: competingChange,
      actor: HUMAN,
    });
    const competing = await decideWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-revert-guards',
      artifact: artifact(),
      change: competingChange,
      outcome: 'accepted',
      precondition: competingReview.precondition,
      actor: HUMAN,
    });
    const competingId = competing.transition.audit.commit?.digest;
    if (competingId === undefined) throw new Error('Expected competing source edit');

    await expect(
      decideWorkspaceSourceRevert(db, {
        projectId: project.projectId,
        workspaceId: 'source-revert-guards',
        commitId: firstEditId,
        outcome: 'accepted',
        precondition: revertReview.precondition,
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(WorkspaceTransitionReviewStaleError);
    expect(
      (await getTransitionRefHead(db, { projectId: project.projectId, refName: 'main' })).head
    ).toBe(competingId);
    expect(await listTransitionCommits(db, project.projectId)).toHaveLength(3);
  });

  it('fails closed for zero-operation, stale, and unsupported source edits', async () => {
    const project = await insertProject(db, testData.project({ name: 'Source Edit Guards' }));
    await ensureMainBranch(db, project.projectId);
    const root = await material(db, project.projectId, 'Guarded root', BASE_SOURCE);
    await workspace(db, project.projectId, 'source-edit-guards-import');
    const review = await reviewWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-edit-guards-import',
      artifact: artifact(),
      change: { mode: 'import', root: { materialId: root.id } },
      actor: HUMAN,
    });
    await decideWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-edit-guards-import',
      artifact: artifact(),
      change: { mode: 'import', root: { materialId: root.id } },
      outcome: 'accepted',
      precondition: review.precondition,
      actor: HUMAN,
    });
    await workspace(db, project.projectId, 'source-edit-guards');

    await expect(
      reviewWorkspaceSourceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'source-edit-guards',
        artifact: artifact(),
        change: { mode: 'edit', operations: [] },
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(WorkspaceSourceArtifactError);
    await expect(
      reviewWorkspaceSourceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'source-edit-guards',
        artifact: artifact(),
        change: {
          mode: 'edit',
          operations: [
            {
              op: 'replace_scalar',
              path: ['logger', 'level'],
              expect: 'INFO',
              value: 'WARN',
            },
          ],
        },
        actor: HUMAN,
      })
    ).rejects.toMatchObject({ code: 'STALE_BASE' });
    await expect(
      reviewWorkspaceSourceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'source-edit-guards',
        artifact: artifact(),
        change: {
          mode: 'edit',
          operations: [
            {
              op: 'replace_scalar',
              path: ['logger'],
              expect: 'DEBUG',
              value: 'WARN',
            },
          ],
        },
        actor: HUMAN,
      })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_SEMANTICS' });
  });

  it('re-resolves project Materials and binds the selector into the review precondition', async () => {
    const owner = await insertProject(db, testData.project({ name: 'Source Owner' }));
    const foreign = await insertProject(db, testData.project({ name: 'Source Consumer' }));
    await ensureMainBranch(db, foreign.projectId);
    const foreignRoot = await material(db, owner.projectId, 'Foreign root', BASE_SOURCE);
    await workspace(db, foreign.projectId, 'foreign-source');
    await expect(
      reviewWorkspaceSourceTransition(db, {
        projectId: foreign.projectId,
        workspaceId: 'foreign-source',
        artifact: artifact(),
        change: { mode: 'import', root: { materialId: foreignRoot.id } },
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(WorkspaceSourceArtifactError);

    const project = await insertProject(db, testData.project({ name: 'Source Selector' }));
    await ensureMainBranch(db, project.projectId);
    const first = await material(db, project.projectId, 'First root', BASE_SOURCE);
    const second = await material(
      db,
      project.projectId,
      'Second root',
      BASE_SOURCE.replace('# Preserve the exact source.', '# Alternative exact source.')
    );
    await workspace(db, project.projectId, 'selector-stale');
    await expect(
      reviewWorkspaceSourceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'selector-stale',
        artifact: artifact(),
        change: {
          mode: 'import',
          root: { materialId: first.id, contentHash: `sha256:${'0'.repeat(64)}` },
        },
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(WorkspaceSourceArtifactError);
    const review = await reviewWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'selector-stale',
      artifact: artifact(),
      change: { mode: 'import', root: { materialId: first.id } },
      actor: HUMAN,
    });
    await expect(
      decideWorkspaceSourceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'selector-stale',
        artifact: artifact(),
        change: { mode: 'import', root: { materialId: second.id } },
        outcome: 'accepted',
        precondition: review.precondition,
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(WorkspaceTransitionReviewStaleError);
    expect(await listTransitionCommits(db, project.projectId)).toEqual([]);

    await insertBranch(db, { projectId: project.projectId, name: 'competing' });
    await workspace(db, project.projectId, 'competing-head', 'competing');
    const competingReview = await reviewWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'competing-head',
      artifact: artifact(),
      change: { mode: 'import', root: { materialId: first.id } },
      actor: HUMAN,
    });
    const competing = await decideWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'competing-head',
      artifact: artifact(),
      change: { mode: 'import', root: { materialId: first.id } },
      outcome: 'accepted',
      precondition: competingReview.precondition,
      actor: HUMAN,
    });
    if (competing.commit === undefined) throw new Error('Expected competing CommitV2');
    const competingHead = await getTransitionRefHead(db, {
      projectId: project.projectId,
      refName: 'competing',
    });
    if (competingHead.head === null) throw new Error('Expected competing ref head');
    await updateBranchHead(db, project.projectId, 'main', competingHead.head);
    await expect(
      decideWorkspaceSourceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'selector-stale',
        artifact: artifact(),
        change: { mode: 'import', root: { materialId: first.id } },
        outcome: 'accepted',
        precondition: review.precondition,
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(WorkspaceTransitionReviewStaleError);
    expect(await listTransitionCommits(db, project.projectId)).toHaveLength(1);
  });

  it('rejects missing include resources instead of validating a partial source tree', async () => {
    const project = await insertProject(db, testData.project({ name: 'Source Includes' }));
    await ensureMainBranch(db, project.projectId);
    const root = await material(
      db,
      project.projectId,
      'Root with include',
      `${BASE_SOURCE}packages:\n  common: !include packages/common.yaml\n`
    );
    await workspace(db, project.projectId, 'missing-include');

    await expect(
      reviewWorkspaceSourceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'missing-include',
        artifact: artifact(),
        change: { mode: 'import', root: { materialId: root.id } },
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(WorkspaceSourceInputsError);

    const included = await material(db, project.projectId, 'Included source', 'api:\n');
    await expect(
      reviewWorkspaceSourceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'missing-include',
        artifact: artifact([
          { path: 'packages/common.yaml', materialId: included.id },
          { path: 'packages/common.yaml', materialId: included.id },
        ]),
        change: { mode: 'import', root: { materialId: root.id } },
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(WorkspaceSourceArtifactError);
  });

  it('uses transient server secrets for a real provider Statement without persisting values', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 't3x-source-transition-'));
    try {
      const project = await insertProject(db, testData.project({ name: 'Source Runner' }));
      await ensureMainBranch(db, project.projectId);
      const root = await material(db, project.projectId, 'Runner root', SECRET_SOURCE);
      await workspace(db, project.projectId, 'source-runner');
      const requestedNames: string[][] = [];
      const capabilities = {
        secretResolver: {
          async resolve(input: { names: readonly string[] }) {
            requestedNames.push([...input.names]);
            return TRANSIENT_SECRETS;
          },
        },
        runner: runner(
          dockerExecutor(commandResult({ exit_code: 0, stdout: 'INFO Configuration is valid!\n' })),
          tempRoot
        ),
      };
      const mismatchedSecrets = await reviewWorkspaceSourceTransition(
        db,
        {
          projectId: project.projectId,
          workspaceId: 'source-runner',
          artifact: artifact(),
          change: { mode: 'import', root: { materialId: root.id } },
          actor: HUMAN,
        },
        {
          secretResolver: {
            async resolve() {
              return { ...TRANSIENT_SECRETS, unrelated_secret: 'must-never-enter-runner' };
            },
          },
          runner: capabilities.runner,
        }
      );
      expect(mismatchedSecrets.runner).toEqual({
        mode: 'inputs_unavailable',
        reason: 'secret_resolution_failed',
        secretReferenceNames: ['wifi_password', 'wifi_ssid'],
      });
      expect(mismatchedSecrets.transition.checks.runner).toMatchObject({
        observation: 'no_statement_observed',
      });
      const review = await reviewWorkspaceSourceTransition(
        db,
        {
          projectId: project.projectId,
          workspaceId: 'source-runner',
          artifact: artifact(),
          change: { mode: 'import', root: { materialId: root.id } },
          actor: HUMAN,
        },
        capabilities
      );

      expect(requestedNames).toEqual([['wifi_password', 'wifi_ssid']]);
      expect(review.runner).toMatchObject({ mode: 'statement', outcome: 'passed' });
      expect(review.transition).toMatchObject({
        checks: {
          replay: { observation: 'observed', outcomes: ['verified'] },
          validation: { observation: 'no_statement_observed' },
          runner: { observation: 'observed', outcomes: ['passed'] },
        },
        capabilities: { accept: { disposition: 'allowed' } },
      });
      expect(review.precondition.sourceInputManifestDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(JSON.stringify(review)).not.toContain(TRANSIENT_SECRETS.wifi_password);
      expect(JSON.stringify(review)).not.toContain(TRANSIENT_SECRETS.wifi_ssid);

      const decided = await decideWorkspaceSourceTransition(
        db,
        {
          projectId: project.projectId,
          workspaceId: 'source-runner',
          artifact: artifact(),
          change: { mode: 'import', root: { materialId: root.id } },
          outcome: 'accepted',
          precondition: review.precondition,
          actor: HUMAN,
        },
        capabilities
      );
      expect(requestedNames).toEqual([
        ['wifi_password', 'wifi_ssid'],
        ['wifi_password', 'wifi_ssid'],
      ]);
      expect(JSON.stringify(decided)).not.toContain(TRANSIENT_SECRETS.wifi_password);
      expect(JSON.stringify(decided)).not.toContain(TRANSIENT_SECRETS.wifi_ssid);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('requires an explicit override for a failed Runner Statement', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 't3x-source-transition-failed-'));
    try {
      const project = await insertProject(db, testData.project({ name: 'Source Runner Failure' }));
      await ensureMainBranch(db, project.projectId);
      const root = await material(db, project.projectId, 'Failed runner root', BASE_SOURCE);
      await workspace(db, project.projectId, 'failed-runner');
      const capabilities = {
        runner: runner(
          dockerExecutor(
            commandResult({ exit_code: 1, stderr: 'Invalid configuration at logger.level' })
          ),
          tempRoot
        ),
      };
      const review = await reviewWorkspaceSourceTransition(
        db,
        {
          projectId: project.projectId,
          workspaceId: 'failed-runner',
          artifact: artifact(),
          change: { mode: 'import', root: { materialId: root.id } },
          actor: HUMAN,
        },
        capabilities
      );
      expect(review.transition).toMatchObject({
        checks: { runner: { observation: 'observed', outcomes: ['failed'] } },
        capabilities: {
          accept: { disposition: 'denied' },
          override: { disposition: 'allowed' },
        },
      });
      await expect(
        decideWorkspaceSourceTransition(
          db,
          {
            projectId: project.projectId,
            workspaceId: 'failed-runner',
            artifact: artifact(),
            change: { mode: 'import', root: { materialId: root.id } },
            outcome: 'accepted',
            precondition: review.precondition,
            actor: HUMAN,
          },
          capabilities
        )
      ).rejects.toBeInstanceOf(WorkspaceTransitionDecisionDeniedError);

      const overridden = await decideWorkspaceSourceTransition(
        db,
        {
          projectId: project.projectId,
          workspaceId: 'failed-runner',
          artifact: artifact(),
          change: { mode: 'import', root: { materialId: root.id } },
          outcome: 'overridden',
          decisionReason: 'Keep the failed external check visible while accepting this fixture.',
          precondition: review.precondition,
          actor: HUMAN,
        },
        capabilities
      );
      expect(overridden.transition).toMatchObject({
        decision: { observation: 'supplied', outcome: 'overridden' },
        history: { observation: 'committed' },
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('records rejection without granting CommitV2 authority or moving the ref', async () => {
    const project = await insertProject(db, testData.project({ name: 'Source Reject' }));
    await ensureMainBranch(db, project.projectId);
    const root = await material(db, project.projectId, 'Rejected root', BASE_SOURCE);
    await workspace(db, project.projectId, 'source-reject');
    const review = await reviewWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-reject',
      artifact: artifact(),
      change: { mode: 'import', root: { materialId: root.id } },
      actor: HUMAN,
    });
    const rejected = await decideWorkspaceSourceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'source-reject',
      artifact: artifact(),
      change: { mode: 'import', root: { materialId: root.id } },
      outcome: 'rejected',
      decisionReason: 'Use a different device identifier before import.',
      precondition: review.precondition,
      actor: HUMAN,
    });

    expect(rejected.commit).toBeUndefined();
    expect(rejected.transition).toMatchObject({
      decision: { observation: 'supplied', outcome: 'rejected' },
      history: { observation: 'not_committed' },
    });
    expect((await findBranchByName(db, project.projectId, 'main'))?.headCommitHash).toBeNull();
    expect(await listTransitionCommits(db, project.projectId)).toEqual([]);
    expect(
      await listRepositoryDecisionAudit(db, { projectId: project.projectId, refName: 'main' })
    ).toHaveLength(1);
  });
});
