/** CommitV2 merge pipeline adapter tests. */

/** biome-ignore-all lint/suspicious/noExplicitAny: compact operation fixtures */

import type { PipelineEvent } from '@t3x-dev/core';
import { collectResult, runOperation } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiPipelineContext } from '../../ops/context';
import type { MergeExecuteInput, MergePrepareInput } from '../../ops/merge';
import { MergeError, mergeExecuteOp, mergePrepareOp } from '../../ops/merge';

const prepared = {
  autoKept: [],
  conflicts: [{ path: 'shared', slotConflicts: [] }],
  onlyInSource: ['source_only'],
  onlyInTarget: ['target_only'],
  relationsOnlyInSource: [],
  relationsOnlyInTarget: [],
  relationsInBoth: [],
};

const { prepareRepositoryYOpsMerge, commitRepositoryYOpsMerge } = vi.hoisted(() => ({
  prepareRepositoryYOpsMerge: vi.fn(),
  commitRepositoryYOpsMerge: vi.fn(),
}));

const committed = {
  commit: {
    schema: 't3x/commit/v2' as const,
    parents: [
      { kind: 'commit', schema: 't3x/commit/v2', digest: `sha256:${'b'.repeat(64)}` },
      { kind: 'commit', schema: 't3x/commit/v2', digest: `sha256:${'a'.repeat(64)}` },
    ],
  },
  commitDigest: `sha256:${'c'.repeat(64)}`,
  recordedAt: '2026-08-03T00:00:00.000Z',
  content: { trees: [], relations: [] },
  mergeSummary: {
    kept_identical: 0,
    resolved_conflicts: 1,
    kept_from_source: 1,
    kept_from_target: 1,
    discarded: 0,
    total_nodes: 0,
  },
};

vi.mock('../../lib/repository-state-transition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/repository-state-transition')>();
  return { ...actual, prepareRepositoryYOpsMerge, commitRepositoryYOpsMerge };
});

function context(): ApiPipelineContext {
  return {
    db: {} as any,
    projectId: 'project-1',
    userId: 'user-1',
    providerRegistry: {} as any,
    abortSignal: new AbortController().signal,
  } as ApiPipelineContext;
}

async function collectEvents<O>(generator: AsyncGenerator<PipelineEvent, O>) {
  const events: PipelineEvent[] = [];
  let result: IteratorResult<PipelineEvent, O>;
  do {
    result = await generator.next();
    if (!result.done) events.push(result.value);
  } while (!result.done);
  return { events, result: result.value };
}

const prepareInput: MergePrepareInput = {
  project_id: 'project-1',
  source_hash: `sha256:${'a'.repeat(64)}`,
  target_hash: `sha256:${'b'.repeat(64)}`,
};

const executeInput: MergeExecuteInput = {
  ...prepareInput,
  prepared,
  decisions: {
    conflictResolutions: { shared: 'source' },
    keepFromSource: ['source_only'],
    keepFromTarget: ['target_only'],
    keepRelationsFromSource: true,
    keepRelationsFromTarget: true,
  },
  message: 'Merge feature into main',
  branch: 'main',
  author: { type: 'human', id: 'user-1', name: 'Alice' },
  writeAuthority: {
    actor: { kind: 'agent', id: 'agent:api-key:ak_merge' },
    policyBinding: {
      projectId: 'project-1',
      refName: 'main',
      policy: {} as any,
      resource: {
        uri: 't3x://policies/merge-test',
        mediaType: 'application/vnd.t3x.acceptance-policy+json',
        digest: `sha256:${'d'.repeat(64)}`,
      },
      updatedBy: { kind: 'human', id: 'user:policy-admin' },
      updatedAt: '2026-08-03T00:00:00.000Z',
    },
  },
};

describe('CommitV2 merge operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareRepositoryYOpsMerge.mockResolvedValue(prepared);
    commitRepositoryYOpsMerge.mockResolvedValue(committed);
  });

  it('prepares from the explicitly scoped repository service', async () => {
    const { events, result } = await collectEvents(
      runOperation(mergePrepareOp, prepareInput, context())
    );

    expect(events.map((event) => `${event.type}:${event.step ?? ''}`)).toEqual(
      expect.arrayContaining([
        'step_start:load',
        'step_done:load',
        'step_start:transform',
        'step_done:transform',
      ])
    );
    expect(result).toEqual({ prepared, source_project_id: 'project-1' });
    expect(prepareRepositoryYOpsMerge).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        sourceDigest: prepareInput.source_hash,
        targetDigest: prepareInput.target_hash,
      })
    );
  });

  it('commits through the two-parent CommitV2 service and returns a task projection', async () => {
    const output = await collectResult(runOperation(mergeExecuteOp, executeInput, context()));

    expect(commitRepositoryYOpsMerge).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        refName: 'main',
        actor: { kind: 'agent', id: 'agent:api-key:ak_merge' },
        policyBinding: executeInput.writeAuthority.policyBinding,
        policyBindingSource: 'server-selected',
      })
    );
    expect(output.commit).toMatchObject({
      schema: 't3x/commit/v2',
      hash: `sha256:${'c'.repeat(64)}`,
      parents: [`sha256:${'b'.repeat(64)}`, `sha256:${'a'.repeat(64)}`],
      branch: 'main',
    });
  });

  it('rejects unresolved conflicts before persistence', async () => {
    await expect(
      collectResult(
        runOperation(
          mergeExecuteOp,
          {
            ...executeInput,
            decisions: { ...executeInput.decisions, conflictResolutions: {} },
          },
          context()
        )
      )
    ).rejects.toMatchObject({ code: 'UNRESOLVED_CONFLICTS' });
    expect(commitRepositoryYOpsMerge).not.toHaveBeenCalled();
  });

  it('keeps a stable typed operation error surface', () => {
    expect(mergePrepareOp.name).toBe('merge.prepare');
    expect(mergeExecuteOp.name).toBe('merge.execute');
    expect(new MergeError('INVALID_REQUEST', 'bad')).toMatchObject({
      name: 'MergeError',
      code: 'INVALID_REQUEST',
      message: 'bad',
    });
  });
});
