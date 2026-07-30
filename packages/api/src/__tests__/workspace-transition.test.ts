import { yvalueToTrees } from '@t3x-dev/core';
import {
  type AnyDB,
  ConflictError,
  createCommit,
  createMaterial,
  ensureMainBranch,
  findBranchByName,
  insertProject,
  listRepositoryDecisionAudit,
  listTransitionCommits,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { t3xPrdP0Fixtures } from '@t3x-dev/yschema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  decideWorkspaceTransition,
  reviewWorkspaceTransition,
  WorkspaceTransitionDecisionDeniedError,
  WorkspaceTransitionLegacyHeadError,
  WorkspaceTransitionReviewStaleError,
} from '../lib/workspace-transition';
import { setupTestDB, testData } from './setup';

const HUMAN = { kind: 'human' as const, id: 'user:test-maintainer' };

function content(value: unknown) {
  return {
    trees: yvalueToTrees(structuredClone(value) as Parameters<typeof yvalueToTrees>[0]),
    relations: [],
  };
}

async function workspace(input: {
  db: AnyDB;
  projectId: string;
  workspaceId: string;
  targetBranch?: string;
}) {
  const material = await createMaterial(input.db, {
    project_id: input.projectId,
    source_type: 'document',
    title: `Source ${input.workspaceId}`,
    content_text: `Source evidence for ${input.workspaceId}`,
    content_hash: `sha256:${input.workspaceId}`,
  });
  return upsertWorkspaceDraft(input.db, {
    project_id: input.projectId,
    workspace_id: input.workspaceId,
    title: `Workspace ${input.workspaceId}`,
    target_branch: input.targetBranch ?? 'main',
    workspace_state: {
      id: input.workspaceId,
      projectId: input.projectId,
      title: `Workspace ${input.workspaceId}`,
      targetBranch: input.targetBranch ?? 'main',
      schemaBindings: [
        {
          canonicalName: 't3x/prd',
          version: t3xPrdP0Fixtures.normalizedYSchema.version,
          mode: 'pinned',
        },
      ],
      sourceBundle: [
        {
          id: `material:${material.id}`,
          type: 'document',
          materialId: material.id,
          contentHash: material.content_hash,
        },
      ],
    },
  });
}

let db: AnyDB;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
});

afterAll(async () => cleanup());

describe('Workspace Transition application use case', () => {
  it('reviews and commits an accepted Transition from an empty ref', async () => {
    const project = await insertProject(db, testData.project({ name: 'Workspace Accept' }));
    await ensureMainBranch(db, project.projectId);
    const draft = await workspace({ db, projectId: project.projectId, workspaceId: 'accept' });
    const target = content(t3xPrdP0Fixtures.validCandidateTree);

    const review = await reviewWorkspaceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'accept',
      content: target,
      why: 'Capture the reviewed PRD as governed state.',
      expectedRevision: draft.revision,
      actor: HUMAN,
    });

    expect(review.transition).toMatchObject({
      mode: 'transition',
      claims: {
        actor: HUMAN,
        intent: { mode: 'unspecified' },
        rationale: {
          mode: 'authored',
          value: 'Capture the reviewed PRD as governed state.',
        },
      },
      checks: {
        objectIntegrity: 'verified',
        replay: { observation: 'observed', outcomes: ['verified'] },
        validation: { observation: 'observed', outcomes: ['passed'] },
      },
      capabilities: { accept: { disposition: 'allowed' } },
    });

    const decided = await decideWorkspaceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'accept',
      content: target,
      why: 'Capture the reviewed PRD as governed state.',
      outcome: 'accepted',
      precondition: review.precondition,
      actor: HUMAN,
    });

    expect(decided.commit).toMatchObject({ schema: 't3x/commit/v2', parents: [] });
    expect(decided.transition).toMatchObject({
      mode: 'transition',
      decision: { observation: 'supplied', outcome: 'accepted' },
      history: { observation: 'committed' },
    });
    expect(decided.workspace).toMatchObject({ status: 'committed', revision: 2 });
    if (decided.transition.mode !== 'transition') throw new Error('Expected TransitionV2 view');
    expect((await findBranchByName(db, project.projectId, 'main'))?.headCommitHash).toBe(
      decided.transition.audit.commit?.digest
    );

    const childDraft = await workspace({
      db,
      projectId: project.projectId,
      workspaceId: 'accept-child',
    });
    const childCandidate = structuredClone(t3xPrdP0Fixtures.validCandidateTree);
    childCandidate.summary.outcome = 'Advance the verified Transition history with a child.';
    const childTarget = content(childCandidate);
    const childReview = await reviewWorkspaceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'accept-child',
      content: childTarget,
      expectedRevision: childDraft.revision,
      actor: HUMAN,
    });
    const child = await decideWorkspaceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'accept-child',
      content: childTarget,
      outcome: 'accepted',
      precondition: childReview.precondition,
      actor: HUMAN,
    });

    expect(child.commit?.parents).toEqual([
      expect.objectContaining({ digest: decided.transition.audit.commit?.digest }),
    ]);
    expect(await listTransitionCommits(db, project.projectId)).toHaveLength(2);
  });

  it('requires an authored reason to override failed validation', async () => {
    const project = await insertProject(db, testData.project({ name: 'Workspace Override' }));
    await ensureMainBranch(db, project.projectId);
    await workspace({ db, projectId: project.projectId, workspaceId: 'override' });
    const target = content(t3xPrdP0Fixtures.candidateWithHardErrors);
    const review = await reviewWorkspaceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'override',
      content: target,
      actor: HUMAN,
    });

    expect(review.transition).toMatchObject({
      checks: { validation: { observation: 'observed', outcomes: ['failed'] } },
      capabilities: {
        accept: { disposition: 'denied' },
        override: { disposition: 'allowed' },
      },
    });
    await expect(
      decideWorkspaceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'override',
        content: target,
        outcome: 'accepted',
        precondition: review.precondition,
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(WorkspaceTransitionDecisionDeniedError);
    await expect(
      decideWorkspaceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'override',
        content: target,
        outcome: 'overridden',
        precondition: review.precondition,
        actor: HUMAN,
      })
    ).rejects.toThrow('Override requires an explicit authored Decision reason');

    const decided = await decideWorkspaceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'override',
      content: target,
      outcome: 'overridden',
      decisionReason: 'Ship this invalid fixture only to exercise the explicit override path.',
      precondition: review.precondition,
      actor: HUMAN,
    });
    expect(decided.transition).toMatchObject({
      decision: {
        outcome: 'overridden',
        rationale: {
          mode: 'authored',
          value: 'Ship this invalid fixture only to exercise the explicit override path.',
        },
      },
      history: { observation: 'committed' },
    });
  });

  it('does not treat another project material as validation provenance', async () => {
    const sourceProject = await insertProject(
      db,
      testData.project({ name: 'Foreign Source Owner' })
    );
    const foreignMaterial = await createMaterial(db, {
      project_id: sourceProject.projectId,
      source_type: 'document',
      title: 'Foreign evidence',
      content_text: 'This material belongs to another project.',
      content_hash: 'sha256:foreign-evidence',
    });
    const project = await insertProject(db, testData.project({ name: 'Foreign Source Consumer' }));
    await ensureMainBranch(db, project.projectId);
    await upsertWorkspaceDraft(db, {
      project_id: project.projectId,
      workspace_id: 'foreign-source',
      title: 'Foreign source workspace',
      target_branch: 'main',
      workspace_state: {
        id: 'foreign-source',
        projectId: project.projectId,
        title: 'Foreign source workspace',
        targetBranch: 'main',
        schemaBindings: [
          {
            canonicalName: 't3x/prd',
            version: t3xPrdP0Fixtures.normalizedYSchema.version,
            mode: 'pinned',
          },
        ],
        sourceBundle: [
          {
            id: `material:${foreignMaterial.id}`,
            type: 'document',
            materialId: foreignMaterial.id,
            contentHash: foreignMaterial.content_hash,
          },
        ],
      },
    });

    const review = await reviewWorkspaceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'foreign-source',
      content: content(t3xPrdP0Fixtures.validCandidateTree),
      actor: HUMAN,
    });

    expect(review.transition).toMatchObject({
      checks: { validation: { observation: 'observed', outcomes: ['failed'] } },
      capabilities: { accept: { disposition: 'denied' } },
    });
  });

  it('records rejection without creating a commit or advancing the ref', async () => {
    const project = await insertProject(db, testData.project({ name: 'Workspace Reject' }));
    await ensureMainBranch(db, project.projectId);
    await workspace({ db, projectId: project.projectId, workspaceId: 'reject' });
    const target = content(t3xPrdP0Fixtures.validCandidateTree);
    const review = await reviewWorkspaceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'reject',
      content: target,
      actor: HUMAN,
    });
    const rejected = await decideWorkspaceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'reject',
      content: target,
      outcome: 'rejected',
      decisionReason: 'Revise the audience before accepting this proposal.',
      precondition: review.precondition,
      actor: HUMAN,
    });

    expect(rejected.commit).toBeUndefined();
    expect(rejected.transition).toMatchObject({
      decision: { observation: 'supplied', outcome: 'rejected' },
      history: { observation: 'not_committed' },
    });
    expect(await listTransitionCommits(db, project.projectId)).toEqual([]);
    expect((await findBranchByName(db, project.projectId, 'main'))?.headCommitHash).toBeNull();
    expect(
      await listRepositoryDecisionAudit(db, { projectId: project.projectId, refName: 'main' })
    ).toHaveLength(1);
  });

  it('refuses a stale review after the Workspace revision changes', async () => {
    const project = await insertProject(db, testData.project({ name: 'Workspace Stale' }));
    await ensureMainBranch(db, project.projectId);
    const draft = await workspace({ db, projectId: project.projectId, workspaceId: 'stale' });
    const target = content(t3xPrdP0Fixtures.validCandidateTree);
    const review = await reviewWorkspaceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'stale',
      content: target,
      actor: HUMAN,
    });
    await upsertWorkspaceDraft(
      db,
      {
        project_id: project.projectId,
        workspace_id: 'stale',
        title: 'Changed after review',
        target_branch: 'main',
        workspace_state: {
          ...(draft.workspace_state ?? {}),
          title: 'Changed after review',
        },
      },
      draft.revision
    );

    await expect(
      decideWorkspaceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'stale',
        content: target,
        outcome: 'accepted',
        precondition: review.precondition,
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(
      await listRepositoryDecisionAudit(db, { projectId: project.projectId, refName: 'main' })
    ).toHaveLength(0);
  });

  it('refuses a changed target even when the Workspace revision is unchanged', async () => {
    const project = await insertProject(db, testData.project({ name: 'Workspace Target Stale' }));
    await ensureMainBranch(db, project.projectId);
    await workspace({ db, projectId: project.projectId, workspaceId: 'target-stale' });
    const target = content(t3xPrdP0Fixtures.validCandidateTree);
    const review = await reviewWorkspaceTransition(db, {
      projectId: project.projectId,
      workspaceId: 'target-stale',
      content: target,
      actor: HUMAN,
    });
    const changed = JSON.parse(JSON.stringify(t3xPrdP0Fixtures.validCandidateTree)) as {
      summary: { outcome: string };
    };
    changed.summary.outcome = 'A different target must require another review.';

    await expect(
      decideWorkspaceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'target-stale',
        content: content(changed),
        outcome: 'accepted',
        precondition: review.precondition,
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(WorkspaceTransitionReviewStaleError);
    await expect(
      decideWorkspaceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'target-stale',
        content: target,
        why: 'A different rationale must require another review.',
        outcome: 'accepted',
        precondition: review.precondition,
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(WorkspaceTransitionReviewStaleError);
    expect(
      await listRepositoryDecisionAudit(db, { projectId: project.projectId, refName: 'main' })
    ).toHaveLength(0);
  });

  it('fails closed rather than inventing a CommitV2 parent for a legacy head', async () => {
    const project = await insertProject(db, testData.project({ name: 'Workspace Legacy' }));
    await ensureMainBranch(db, project.projectId);
    await createCommit(db, {
      project_id: project.projectId,
      content: { trees: [], relations: [] },
      author: { type: 'human', id: 'human:legacy' },
      branch: 'main',
      enforceBranchLinearity: true,
    });
    await workspace({ db, projectId: project.projectId, workspaceId: 'legacy' });

    await expect(
      reviewWorkspaceTransition(db, {
        projectId: project.projectId,
        workspaceId: 'legacy',
        content: content(t3xPrdP0Fixtures.validCandidateTree),
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(WorkspaceTransitionLegacyHeadError);
  });
});
