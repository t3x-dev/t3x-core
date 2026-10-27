/** biome-ignore-all lint/suspicious/noExplicitAny: compact API contract assertions */

import {
  applyYOps,
  diffCommits,
  executeMerge,
  flattenTrees,
  type MergeDecision,
  prepareMerge,
  type SemanticContent,
  yvalueToTrees,
} from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  findBranchByName,
  findWorkspaceDraft,
  insertBranch,
  insertProject,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRepositorySemanticCommit } from '../lib/repository-state-transition';
import {
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  workspaceAuthoringState,
} from '../lib/workspace-authoring';
import { pullRequestRoutes } from '../routes/pull-requests.openapi';
import { setupTestDB, testData } from './setup';
import { commitSemanticFixture } from './transition-fixture';

type ApiResponse = any;
type YOps = Parameters<typeof applyYOps>[1];

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

const app = new Hono();
app.route('/', pullRequestRoutes);

/** One document every operation starts from, so each branch edit is independent. */
const BASE_DOCUMENT = {
  product: { title: 'Study', version: 1, status: 'draft' },
  item: { name: 'plan', priority: 'must', notes: 'keep' },
  lists: { tags: ['alpha', 'beta', 'alpha'] },
  delivery: { owner: 'ada', deadline: 'friday', goal: 'learn', audience: 'students' },
  box: { inner: { value: 1 } },
  pair: { left: { a: 1 }, right: { b: 2 } },
};

const MAIN_ONLY = [{ set: { path: 'product/status', value: 'live' } }] as unknown as YOps;

interface Scenario {
  name: string;
  sourceOps: YOps;
  targetOps?: YOps;
  /** clean merges immediately; conflict needs a decision; unchanged cannot open a PR. */
  outcome: 'clean' | 'conflict' | 'unchanged';
  resolve?: 'source' | 'target';
  /** A conflicted PR must reject a merge that supplies no decision. */
  rejectUnresolved?: boolean;
}

const scenarios: Scenario[] = [
  {
    name: 'set writes a dev slot while main changes another slot',
    sourceOps: [{ set: { path: 'product/title', value: 'Dev study' } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'unset removes a dev slot and keeps the main-only slot',
    sourceOps: [{ unset: { path: 'item/notes' } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'define adds an empty node only on dev',
    sourceOps: [{ define: { path: 'meta' } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'drop removes a node only on dev',
    sourceOps: [{ drop: { path: 'box' } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'rename moves a slot key only on dev',
    sourceOps: [{ rename: { path: 'item/notes', to: 'details' } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'populate writes several slots without touching the main-only slot',
    sourceOps: [
      { populate: { path: 'item', values: { name: 'roadmap', lane: 'beta' } } },
    ] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'append extends a sequence only on dev',
    sourceOps: [{ append: { path: 'lists/tags', value: 'gamma' } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'move relocates a slot onto a node main also edits',
    sourceOps: [{ move: { from: 'item/notes', to: 'product/notes' } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'clone copies a slot onto a node main also edits',
    sourceOps: [{ clone: { from: 'item/priority', to: 'product/priority' } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'nest wraps sibling keys into a new child',
    sourceOps: [
      { nest: { path: 'delivery', keys: ['owner', 'deadline'], under: 'schedule' } },
    ] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'split distributes keys into new child mappings',
    sourceOps: [
      { split: { path: 'delivery', into: { people: ['owner'], timing: ['deadline'] } } },
    ] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'fold promotes the single child of a mapping',
    sourceOps: [{ fold: { path: 'box' } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'merge combines sibling mappings into one',
    sourceOps: [
      { merge: { path: 'pair', keys: ['left', 'right'], into: 'joined' } },
    ] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'sort reorders a sequence only on dev',
    sourceOps: [{ sort: { path: 'lists/tags', order: 'asc' } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'unique drops duplicate sequence items only on dev',
    sourceOps: [{ unique: { path: 'lists/tags' } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'pick keeps only the listed keys',
    sourceOps: [{ pick: { path: 'delivery', keys: ['owner', 'goal'] } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'omit removes the listed keys',
    sourceOps: [{ omit: { path: 'delivery', keys: ['audience'] } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'assert guards a path and the following set still merges',
    sourceOps: [
      { assert: { path: 'product/title', equals: 'Study' } },
      { set: { path: 'product/title', value: 'Guarded' } },
    ] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'assert alone does not open a pull request',
    sourceOps: [{ assert: { path: 'product', exists: true } }] as unknown as YOps,
    outcome: 'unchanged',
  },
  {
    name: 'additions on both branches are both kept',
    sourceOps: [{ set: { path: 'wrong_book', value: { title: '错题本' } } }] as unknown as YOps,
    targetOps: [{ set: { path: 'reminder', value: { title: '学习提醒' } } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'different slots of one node merge together',
    sourceOps: [{ set: { path: 'item/priority', value: 'should' } }] as unknown as YOps,
    targetOps: [{ set: { path: 'item/name', value: '练习' } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'the same slot edited differently conflicts and can keep dev',
    sourceOps: [{ set: { path: 'product/title', value: 'Dev title' } }] as unknown as YOps,
    targetOps: [{ set: { path: 'product/title', value: 'Main title' } }] as unknown as YOps,
    outcome: 'conflict',
    resolve: 'source',
  },
  {
    name: 'the same slot edited differently can keep main',
    sourceOps: [{ set: { path: 'product/title', value: 'Dev title' } }] as unknown as YOps,
    targetOps: [{ set: { path: 'product/title', value: 'Main title' } }] as unknown as YOps,
    outcome: 'conflict',
    resolve: 'target',
  },
  {
    name: 'a conflict rejects merge until a decision is supplied',
    sourceOps: [{ set: { path: 'item/priority', value: 'could' } }] as unknown as YOps,
    targetOps: [{ set: { path: 'item/priority', value: 'wont' } }] as unknown as YOps,
    outcome: 'conflict',
    rejectUnresolved: true,
  },
  {
    name: 'deleting a node dev changed is a conflict resolved toward dev',
    sourceOps: [{ set: { path: 'item/notes', value: 'revised' } }] as unknown as YOps,
    targetOps: [{ drop: { path: 'item' } }] as unknown as YOps,
    outcome: 'conflict',
    resolve: 'source',
  },
  {
    name: 'editing a node dev deleted is a conflict resolved toward main',
    sourceOps: [{ drop: { path: 'item' } }] as unknown as YOps,
    targetOps: [{ set: { path: 'item/notes', value: 'revised' } }] as unknown as YOps,
    outcome: 'conflict',
    resolve: 'target',
  },
  {
    name: 'both branches deleting the same node leaves it absent',
    sourceOps: [{ drop: { path: 'box' } }] as unknown as YOps,
    targetOps: [{ drop: { path: 'box' } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'both branches adding the same node content stay clean',
    sourceOps: [{ set: { path: 'extra', value: { title: 'shared' } } }] as unknown as YOps,
    targetOps: [{ set: { path: 'extra', value: { title: 'shared' } } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'both branches adding the same node with different slots conflict',
    sourceOps: [{ set: { path: 'extra', value: { title: 'dev' } } }] as unknown as YOps,
    targetOps: [{ set: { path: 'extra', value: { title: 'main' } } }] as unknown as YOps,
    outcome: 'conflict',
    resolve: 'source',
  },
  {
    name: 'different appends to one sequence conflict',
    sourceOps: [{ append: { path: 'lists/tags', value: 'dev' } }] as unknown as YOps,
    targetOps: [{ append: { path: 'lists/tags', value: 'main' } }] as unknown as YOps,
    outcome: 'conflict',
    resolve: 'target',
  },
  {
    name: 'sort and unique on one sequence conflict',
    sourceOps: [{ sort: { path: 'lists/tags', order: 'desc' } }] as unknown as YOps,
    targetOps: [{ unique: { path: 'lists/tags' } }] as unknown as YOps,
    outcome: 'conflict',
    resolve: 'source',
  },
  {
    name: 'pick and omit of different keys merge slot by slot',
    sourceOps: [{ pick: { path: 'delivery', keys: ['owner', 'goal'] } }] as unknown as YOps,
    targetOps: [{ omit: { path: 'delivery', keys: ['audience'] } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'pick conflicts with an edit of a key it removes',
    sourceOps: [{ pick: { path: 'delivery', keys: ['owner'] } }] as unknown as YOps,
    targetOps: [{ set: { path: 'delivery/goal', value: 'ship' } }] as unknown as YOps,
    outcome: 'conflict',
    resolve: 'target',
  },
  {
    name: 'rename on dev conflicts with an edit of the old slot on main',
    sourceOps: [{ rename: { path: 'item/notes', to: 'details' } }] as unknown as YOps,
    targetOps: [{ set: { path: 'item/notes', value: 'rewritten' } }] as unknown as YOps,
    outcome: 'conflict',
    resolve: 'source',
  },
  {
    name: 'move on dev conflicts with an edit of the moved slot on main',
    sourceOps: [{ move: { from: 'delivery/goal', to: 'product/goal' } }] as unknown as YOps,
    targetOps: [{ set: { path: 'delivery/goal', value: 'ship' } }] as unknown as YOps,
    outcome: 'conflict',
    resolve: 'target',
  },
  {
    name: 'identical edits on both branches merge without a conflict',
    sourceOps: [{ set: { path: 'product/version', value: 2 } }] as unknown as YOps,
    targetOps: [{ set: { path: 'product/version', value: 2 } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'several dev operations merge with one unrelated main edit',
    sourceOps: [
      { set: { path: 'item/priority', value: 'should' } },
      { append: { path: 'lists/tags', value: 'gamma' } },
      { define: { path: 'meta' } },
    ] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'a nested child edit merges with a sibling addition',
    sourceOps: [{ set: { path: 'box/inner/value', value: 9 } }] as unknown as YOps,
    targetOps: [{ set: { path: 'box/sibling', value: { title: 'added' } } }] as unknown as YOps,
    outcome: 'clean',
  },
  {
    name: 'unset on dev and populate on main of the same node conflict',
    sourceOps: [{ unset: { path: 'delivery/audience' } }] as unknown as YOps,
    targetOps: [
      { populate: { path: 'delivery', values: { audience: 'teams', channel: 'mail' } } },
    ] as unknown as YOps,
    outcome: 'conflict',
    resolve: 'source',
  },
  {
    name: 'editing then cloning a node conflicts with deleting it on main',
    sourceOps: [
      { set: { path: 'item/name', value: 'renamed' } },
      { clone: { from: 'item/name', to: 'product/copied' } },
    ] as unknown as YOps,
    targetOps: [{ drop: { path: 'item' } }] as unknown as YOps,
    outcome: 'conflict',
    resolve: 'source',
  },
  {
    name: 'nest on dev conflicts with an edit of a nested key on main',
    sourceOps: [
      { nest: { path: 'delivery', keys: ['owner', 'deadline'], under: 'schedule' } },
    ] as unknown as YOps,
    targetOps: [{ set: { path: 'delivery/owner', value: 'grace' } }] as unknown as YOps,
    outcome: 'conflict',
    resolve: 'target',
  },
];

function changedNodeCount(diff: ReturnType<typeof diffCommits>) {
  return diff.modified.length + diff.onlyInSource.length + diff.onlyInTarget.length;
}

const BASE_CONTENT: SemanticContent = {
  trees: yvalueToTrees(BASE_DOCUMENT),
  relations: [],
};

function applyDocument(ops: YOps): SemanticContent {
  const applied = applyYOps(structuredClone(BASE_CONTENT), ops);
  if (!applied.ok) throw new Error(applied.error?.message ?? 'YOps apply failed');
  return { trees: applied.trees, relations: applied.relations };
}

function frameSlots(content: SemanticContent) {
  return Object.fromEntries(flattenTrees(content.trees).map((frame) => [frame.id, frame.slots]));
}

describe('Pull request merge across the 18 YOps', () => {
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(scenarios)('$name', async (scenario) => {
    const project = await insertProject(mockDB, testData.project({ name: scenario.name }));
    const projectId = project.projectId;
    const fork = await commitSemanticFixture(mockDB, {
      projectId,
      refName: 'main',
      content: applyDocument([] as unknown as YOps),
      intent: 'fork point',
    });
    await insertBranch(mockDB, { projectId, name: 'dev', parentBranch: 'main' });
    const source = await commitSemanticFixture(mockDB, {
      projectId,
      refName: 'dev',
      content: applyDocument(scenario.sourceOps),
      intent: 'dev edit',
    });
    const target = await commitSemanticFixture(mockDB, {
      projectId,
      refName: 'main',
      content: applyDocument(scenario.targetOps ?? MAIN_ONLY),
      intent: 'main edit',
    });

    const forkContent = (await getRepositorySemanticCommit(mockDB, fork.commitDigest, projectId))!
      .semanticContent;
    const sourceContent = (await getRepositorySemanticCommit(
      mockDB,
      source.commitDigest,
      projectId
    ))!.semanticContent;
    const targetContent = (await getRepositorySemanticCommit(
      mockDB,
      target.commitDigest,
      projectId
    ))!.semanticContent;
    const preview = diffCommits(forkContent, sourceContent);
    const againstTargetHead = diffCommits(targetContent, sourceContent);

    const comparison = await app.request(
      `/v1/projects/${projectId}/pull-requests/compare?base=main`
    );
    expect(comparison.status).toBe(200);
    const candidate = ((await comparison.json()) as ApiResponse).data.compare_branches[0];
    expect(candidate).toMatchObject({
      branch: 'dev',
      base_branch: 'main',
      head_commit_id: source.commitDigest,
      base_commit_id: target.commitDigest,
      merge_base_commit_id: fork.commitDigest,
      ahead_by: 1,
      behind_by: 1,
      changed_nodes: changedNodeCount(preview),
    });
    // Nodes added only on main must not be reported as removals in the dev preview.
    for (const path of againstTargetHead.onlyInSource) {
      if (!flattenTrees(forkContent.trees).some((frame) => frame.id === path)) {
        expect(preview.onlyInSource).not.toContain(path);
      }
    }

    const opened = await app.request(`/v1/projects/${projectId}/pull-requests`, {
      body: JSON.stringify({
        description: scenario.name,
        expected_source_commit_id: source.commitDigest,
        expected_target_commit_id: target.commitDigest,
        source_branch: 'dev',
        target_branch: 'main',
        title: scenario.name,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    if (scenario.outcome === 'unchanged') {
      expect(candidate.status).toBe('no_changes');
      expect(opened.status).toBe(400);
      expect(((await opened.json()) as ApiResponse).error.code).toBe('PULL_REQUEST_NO_CHANGES');
      return;
    }

    expect(candidate.status).toBe('ready');
    expect(opened.status).toBe(201);
    const number = ((await opened.json()) as ApiResponse).data.number;
    const rerun = await app.request(
      `/v1/projects/${projectId}/pull-requests/${number}/checks/rerun`,
      { method: 'POST' }
    );
    expect(rerun.status).toBe(200);
    const readiness = (await rerun.json()) as ApiResponse;
    const prepared = prepareMerge(forkContent, sourceContent, targetContent);
    expect(prepared.conflicts.length > 0).toBe(scenario.outcome === 'conflict');
    expect(readiness.data.status).toBe(scenario.outcome === 'conflict' ? 'blocked' : 'ready');

    const decisions: MergeDecision = {
      conflictResolutions: Object.fromEntries(
        prepared.conflicts.map((conflict) => [conflict.path, scenario.resolve ?? 'source'])
      ),
      keepFromSource: prepared.onlyInSource,
      keepFromTarget: prepared.onlyInTarget,
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    };
    const checkWorkspaces =
      scenario.name === 'set writes a dev slot while main changes another slot';
    const actor = { kind: 'human' as const, id: 'human:test' };
    if (checkWorkspaces) {
      for (const workspaceId of ['clean', 'dirty']) {
        const refName = workspaceId === 'clean' ? 'main' : 'dev';
        const refHead = workspaceId === 'clean' ? target.commitDigest : source.commitDigest;
        const workspace = await upsertWorkspaceDraft(mockDB, {
          project_id: projectId,
          workspace_id: workspaceId,
          title: workspaceId,
          target_branch: refName,
          workspace_state: { targetBranch: refName },
        });
        const initialized = await initializeWorkspaceAuthoring(mockDB, {
          projectId,
          workspaceId,
          actionId: `init:${workspaceId}`,
          actor,
          expectedWorkspaceRevision: workspace.revision,
          expectedRefHead: refHead,
        });
        if (workspaceId === 'dirty')
          await publishWorkspaceAuthoringAction(mockDB, {
            projectId,
            workspaceId,
            actor,
            actionId: 'local-edit',
            channel: 'manual',
            expectedWorkspaceRevision: initialized.draft.revision,
            expectedRevision: 0,
            expectedRefHead: refHead,
            operations: [{ set: { path: 'local', value: 'keep' } }],
          });
      }
    }
    const dirtyBefore = checkWorkspaces
      ? await findWorkspaceDraft(mockDB, projectId, 'dirty')
      : null;
    const merge = await app.request(`/v1/projects/${projectId}/pull-requests/${number}/merge`, {
      body: JSON.stringify({
        expected_source_commit_id: source.commitDigest,
        expected_target_commit_id: target.commitDigest,
        strategy: 'deterministic_merge',
        ...(scenario.outcome === 'conflict' && !scenario.rejectUnresolved ? { decisions } : {}),
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    if (scenario.rejectUnresolved) {
      expect(merge.status).toBe(409);
      expect(((await merge.json()) as ApiResponse).error.code).toBe('PULL_REQUEST_NOT_READY');
      return;
    }

    expect(merge.status).toBe(200);
    const mergedHead = (await findBranchByName(mockDB, projectId, 'main'))?.headCommitHash;
    expect(mergedHead).toBeTruthy();
    if (checkWorkspaces) {
      const clean = (await findWorkspaceDraft(mockDB, projectId, 'clean'))!;
      expect(workspaceAuthoringState(clean.workspace_state!).basis.refHead).toBe(mergedHead);
      expect(workspaceAuthoringState(clean.workspace_state!).ledger.compositionRevision).toBe(0);
      expect(await findWorkspaceDraft(mockDB, projectId, 'dirty')).toEqual(dirtyBefore);
    }
    const merged = (await getRepositorySemanticCommit(mockDB, mergedHead!, projectId))!
      .semanticContent;
    const predicted = executeMerge(forkContent, sourceContent, targetContent, prepared, decisions);
    expect(frameSlots(merged)).toEqual(frameSlots(predicted));
    expect(merged.relations).toEqual(predicted.relations);
  });
});
