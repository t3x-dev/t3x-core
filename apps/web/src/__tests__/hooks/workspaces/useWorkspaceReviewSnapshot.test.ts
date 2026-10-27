// @vitest-environment jsdom

import type {
  WorkspaceFullSchemaReview,
  WorkspaceTransitionReviewSnapshotEnvelope,
} from '@t3x-dev/api-client';
import { waitFor } from '@testing-library/react';
import { act, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceReviewSnapshot } from '@/hooks/workspaces/useWorkspaceReviewSnapshot';
import {
  decideWorkspaceTransition,
  fetchLatestWorkspaceTransitionReviewSnapshot,
  fetchWorkspaceTransitionReviewSnapshot,
} from '@/queries/workspaces';
import { cleanupRoots, renderHook } from '../renderHook';

vi.mock('@/queries/workspaces', () => ({
  decideWorkspaceTransition: vi.fn(),
  fetchLatestWorkspaceTransitionReviewSnapshot: vi.fn(),
  fetchWorkspaceTransitionReviewSnapshot: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  vi.mocked(fetchLatestWorkspaceTransitionReviewSnapshot).mockImplementation(
    async () => await vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mock.results.at(-1)?.value
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanupRoots();
});

describe('useWorkspaceReviewSnapshot', () => {
  it('blocks accepting and overriding an empty snapshot but keeps rejection auditable', async () => {
    const loaded = snapshotEnvelope('reviewing');
    const schema = { status: 'unbound' as const, schemaHash: null, definition: null, bindings: [] };
    vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue({
      ...loaded,
      schema_review: {
        schema: 't3x.application/workspace-schema-review/v1',
        base: schema,
        draft: schema,
        baseContent: {},
        draftContent: {},
        actionCount: 2,
        changes: [],
      },
    });
    vi.mocked(decideWorkspaceTransition).mockClear();
    vi.mocked(decideWorkspaceTransition).mockRejectedValue(new Error('rejection reached server'));
    const { result } = renderHook(() =>
      useWorkspaceReviewSnapshot('proj_1', 'workspace_prd_handoff', loaded.snapshot_id)
    );
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    await act(async () => {
      await result.current.decide('accepted');
    });
    await act(async () => {
      await result.current.decide('overridden', 'still empty');
    });
    expect(result.current.state.error).toContain('No changes to commit');
    expect(decideWorkspaceTransition).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.decide('rejected');
    });
    expect(decideWorkspaceTransition).toHaveBeenCalledWith(
      'proj_1',
      'workspace_prd_handoff',
      expect.objectContaining({ outcome: 'rejected' })
    );
  });
  it('loads one immutable Workspace ReviewSnapshot with abortable transport', async () => {
    vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue(
      snapshotEnvelope('reviewing')
    );

    const { result } = renderHook(() =>
      useWorkspaceReviewSnapshot(
        'proj_1',
        'workspace_prd_handoff',
        'rvs_88888888888888888888888888888888'
      )
    );

    await waitFor(() => expect(result.current.state.loading).toBe(false));

    expect(fetchWorkspaceTransitionReviewSnapshot).toHaveBeenCalledWith(
      'proj_1',
      'workspace_prd_handoff',
      'rvs_88888888888888888888888888888888',
      expect.any(AbortSignal)
    );
    expect(result.current.state.data?.change_projection.title).toBe('Reduce device log volume');
    expect(result.current.state.loading).toBe(false);
  });

  it('decides from the immutable snapshot without replaying Workspace content in Web', async () => {
    const loaded: WorkspaceTransitionReviewSnapshotEnvelope = snapshotEnvelope('reviewing');
    const schemaReview: WorkspaceFullSchemaReview = {
      schema: 't3x.application/workspace-schema-review/v1',
      base: { status: 'unbound', schemaHash: null, definition: null, bindings: [] },
      draft: {
        status: 'bound',
        schemaHash: `sha256:${'a'.repeat(64)}`,
        definition: { nodes: {} },
        bindings: [],
      },
      changes: [],
      actionCount: 2,
      baseContent: {},
      draftContent: { title: 'Frozen Draft' },
    };
    vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue({
      ...loaded,
      schema_review: schemaReview,
    });
    vi.mocked(decideWorkspaceTransition).mockResolvedValue({
      ...decisionEnvelope('committed'),
      workspace: { id: 'workspace_prd_handoff', projectId: 'proj_1' },
    } as never);
    const commitCreated = vi.fn();
    window.addEventListener('t3x:commit-created', commitCreated);
    const { result } = renderHook(() =>
      useWorkspaceReviewSnapshot(
        'proj_1',
        'workspace_prd_handoff',
        'rvs_88888888888888888888888888888888'
      )
    );

    await waitFor(() => expect(result.current.state.loading).toBe(false));
    await act(async () => {
      await result.current.decide('accepted');
    });

    expect(decideWorkspaceTransition).toHaveBeenCalledWith('proj_1', 'workspace_prd_handoff', {
      transitionId: `trn_${'1'.repeat(32)}`,
      outcome: 'accepted',
      precondition: {
        workspace_revision: 7,
        ref_head: null,
        effect_digest: `sha256:${'a'.repeat(64)}`,
        proposal_digest: `sha256:${'b'.repeat(64)}`,
        statement_digests: [`sha256:${'c'.repeat(64)}`],
        policy_digest: `sha256:${'d'.repeat(64)}`,
      },
    });
    expect(result.current.state.data?.change_projection.status).toBe('committed');
    expect(result.current.state.data?.schema_review).toEqual(schemaReview);
    expect(commitCreated).toHaveBeenCalledOnce();
    window.removeEventListener('t3x:commit-created', commitCreated);
  });

  it('blocks accept for an unavailable Base contract but leaves rejection available for audit', async () => {
    vi.mocked(decideWorkspaceTransition).mockClear();
    const loaded: WorkspaceTransitionReviewSnapshotEnvelope = snapshotEnvelope('reviewing');
    const unknown: WorkspaceFullSchemaReview = {
      schema: 't3x.application/workspace-schema-review/v1',
      base: { status: 'unknown', schemaHash: null, definition: null, bindings: [] },
      draft: {
        status: 'bound',
        schemaHash: `sha256:${'a'.repeat(64)}`,
        definition: { nodes: {} },
        bindings: [],
      },
      changes: [],
      actionCount: 1,
      baseContent: {},
      draftContent: {},
    };
    vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue({
      ...loaded,
      schema_review: unknown,
    });
    const { result } = renderHook(() =>
      useWorkspaceReviewSnapshot('proj_1', 'workspace_prd_handoff', loaded.snapshot_id)
    );
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    await act(async () => {
      await result.current.decide('accepted');
    });
    expect(decideWorkspaceTransition).not.toHaveBeenCalled();
    expect(result.current.state.error).toContain('Base Schema');
    vi.mocked(decideWorkspaceTransition).mockRejectedValueOnce(
      new Error('Audit transport unavailable')
    );
    await act(async () => {
      await result.current.decide('rejected');
    });
    expect(decideWorkspaceTransition).toHaveBeenCalledWith(
      'proj_1',
      'workspace_prd_handoff',
      expect.objectContaining({ outcome: 'rejected' })
    );
  });
  it('blocks accepting or overriding an old ready snapshot with no validation for its bound Schema', async () => {
    vi.mocked(decideWorkspaceTransition).mockClear();
    const loaded = snapshotEnvelope('reviewing') as WorkspaceTransitionReviewSnapshotEnvelope;
    const data = {
      ...loaded,
      schema_review: {
        schema: 't3x.application/workspace-schema-review/v1',
        base: { status: 'unbound', schemaHash: null, definition: null, bindings: [] },
        draft: {
          status: 'bound',
          schemaHash: `sha256:${'b'.repeat(64)}`,
          definition: { nodes: {} },
          bindings: [],
        },
        changes: [],
        actionCount: 0,
        baseContent: {},
        draftContent: {},
      },
    } as WorkspaceTransitionReviewSnapshotEnvelope & { schema_review: WorkspaceFullSchemaReview };
    vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue(data);
    const { result } = renderHook(() =>
      useWorkspaceReviewSnapshot('proj_1', 'workspace_prd_handoff', loaded.snapshot_id)
    );
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    for (const outcome of ['accepted', 'overridden'] as const) {
      await act(async () => {
        await result.current.decide(outcome, 'Must not bypass missing validation');
      });
      expect(result.current.state.error).toContain('no conclusive validation result');
    }
    expect(decideWorkspaceTransition).not.toHaveBeenCalled();
  });
});

it('retains the original snapshot and preconditions when a concurrent edit prevents approval', async () => {
  const loaded = snapshotEnvelope('reviewing') as WorkspaceTransitionReviewSnapshotEnvelope;
  vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue(loaded);
  vi.mocked(decideWorkspaceTransition).mockRejectedValueOnce(
    new Error('Workspace revision changed. Prepare a new review.')
  );
  const { result } = renderHook(() =>
    useWorkspaceReviewSnapshot('proj_1', 'workspace_prd_handoff', loaded.snapshot_id)
  );
  await waitFor(() => expect(result.current.state.loading).toBe(false));
  await act(async () => {
    expect(await result.current.decide('accepted')).toBeNull();
  });
  expect(result.current.state.data?.snapshot.snapshotId).toBe(loaded.snapshot_id);
  expect(result.current.state.error).toContain('Workspace revision changed');
  expect(result.current.state.deciding).toBe(false);
});
it('serializes rapid decisions and keeps refresh from replacing an in-flight decision', async () => {
  vi.mocked(decideWorkspaceTransition).mockClear();
  const loaded = snapshotEnvelope('reviewing') as WorkspaceTransitionReviewSnapshotEnvelope;
  vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue(loaded);
  let finish!: (value: never) => void;
  vi.mocked(decideWorkspaceTransition).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { result } = renderHook(() =>
    useWorkspaceReviewSnapshot('proj_1', 'workspace_prd_handoff', loaded.snapshot_id)
  );
  await waitFor(() => expect(result.current.state.loading).toBe(false));
  const reads = vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mock.calls.length;
  await act(async () => {
    const first = result.current.decide('accepted');
    expect(await result.current.decide('rejected')).toBeNull();
    await result.current.load();
    expect(fetchWorkspaceTransitionReviewSnapshot).toHaveBeenCalledTimes(reads);
    finish({
      ...decisionEnvelope('committed'),
      workspace: { id: 'workspace_prd_handoff' },
    } as never);
    await first;
  });
  expect(decideWorkspaceTransition).toHaveBeenCalledTimes(1);
  expect(result.current.state.data?.snapshot.snapshotId).toBe(
    'rvs_99999999999999999999999999999999'
  );
});
it('requires an override reason and preserves the recorded rejection without a commit event', async () => {
  vi.mocked(decideWorkspaceTransition).mockClear();
  const loaded = snapshotEnvelope('reviewing') as WorkspaceTransitionReviewSnapshotEnvelope;
  vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue(loaded);
  const { result } = renderHook(() =>
    useWorkspaceReviewSnapshot('proj_1', 'workspace_prd_handoff', loaded.snapshot_id)
  );
  await waitFor(() => expect(result.current.state.loading).toBe(false));
  await act(async () => {
    await result.current.decide('overridden', '  ');
  });
  expect(decideWorkspaceTransition).not.toHaveBeenCalled();
  const response = decisionEnvelope('committed');
  Object.assign(response.review_snapshot, {
    snapshotId: 'rvs_rejected',
    objects: loaded.snapshot.objects,
  });
  Object.assign(response.transition, {
    decision: { observation: 'supplied', outcome: 'rejected' },
    history: { observation: 'not_committed' },
  });
  vi.mocked(decideWorkspaceTransition).mockResolvedValueOnce(response as never);
  const commitCreated = vi.fn();
  window.addEventListener('t3x:commit-created', commitCreated);
  try {
    await act(async () => {
      expect(await result.current.decide('rejected')).toBeNull();
    });
    expect(result.current.state.data?.snapshot.snapshotId).toBe('rvs_rejected');
    expect(result.current.state.data?.snapshot.objects.commit).toBeUndefined();
    expect(commitCreated).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('t3x:commit-created', commitCreated);
  }
});

it('opens the latest result of the pinned Transition while retaining its frozen Schema content', async () => {
  const fixed = snapshotEnvelope('reviewing');
  const schema = {
    schema: 't3x.application/workspace-schema-review/v1',
    draftContent: { title: 'Frozen content' },
  } as WorkspaceFullSchemaReview;
  vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue({
    ...fixed,
    schema_review: schema,
  });
  vi.mocked(fetchLatestWorkspaceTransitionReviewSnapshot).mockResolvedValue(
    snapshotEnvelope('committed')
  );
  const { result } = renderHook(() =>
    useWorkspaceReviewSnapshot('proj_1', 'workspace_prd_handoff', fixed.snapshot_id)
  );
  await waitFor(() => expect(result.current.state.loading).toBe(false));
  expect(fetchLatestWorkspaceTransitionReviewSnapshot).toHaveBeenCalledWith(
    'proj_1',
    'workspace_prd_handoff',
    fixed.transition_id
  );
  expect(result.current.state.data?.change_projection.status).toBe('committed');
  expect(result.current.state.data?.schema_review).toEqual(schema);
  await act(async () => {
    await result.current.decide('accepted');
  });
  expect(decideWorkspaceTransition).not.toHaveBeenCalled();
});

it('keeps the fixed Review and blocks decisions if latest returns another Transition', async () => {
  const fixed = snapshotEnvelope('reviewing');
  const other = snapshotEnvelope('committed');
  other.transition_id = 'trn_other';
  other.snapshot.transitionId = 'trn_other';
  vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue(fixed);
  vi.mocked(fetchLatestWorkspaceTransitionReviewSnapshot).mockResolvedValue(other);
  const { result } = renderHook(() =>
    useWorkspaceReviewSnapshot('proj_1', 'workspace_prd_handoff', fixed.snapshot_id)
  );
  await waitFor(() => expect(result.current.state.loading).toBe(false));
  expect(result.current.state.data?.snapshot_id).toBe(fixed.snapshot_id);
  expect(result.current.state.latestUnavailable).toBe(true);
  expect(result.current.state.error).toContain('different Review');
  await act(async () => {
    await result.current.decide('rejected');
  });
  expect(decideWorkspaceTransition).not.toHaveBeenCalled();
});

it.each([
  'committed',
  'rejected',
] as const)('recovers a lost Decision response from the same Transition latest %s result', async (status) => {
  const fixed = snapshotEnvelope('reviewing');
  vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue(fixed);
  vi.mocked(fetchLatestWorkspaceTransitionReviewSnapshot)
    .mockResolvedValueOnce(fixed)
    .mockResolvedValueOnce(finalEnvelope(status));
  vi.mocked(decideWorkspaceTransition).mockRejectedValueOnce(new TypeError('Network disconnected'));
  const commitCreated = vi.fn();
  window.addEventListener('t3x:commit-created', commitCreated);
  try {
    const { result } = renderHook(() =>
      useWorkspaceReviewSnapshot('proj_1', 'workspace_prd_handoff', fixed.snapshot_id)
    );
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    await act(async () => {
      await result.current.decide(status === 'committed' ? 'accepted' : 'rejected');
    });
    expect(result.current.state.data?.change_projection.status).toBe(status);
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.recovery).toBeUndefined();
    expect(window.sessionStorage.length).toBe(0);
    expect(decideWorkspaceTransition).toHaveBeenCalledTimes(1);
    expect(commitCreated).toHaveBeenCalledTimes(status === 'committed' ? 1 : 0);
  } finally {
    window.removeEventListener('t3x:commit-created', commitCreated);
  }
});

it('locks an uncertain Decision to its original outcome, reason and precondition across refresh', async () => {
  const fixed = snapshotEnvelope('reviewing');
  vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue(fixed);
  vi.mocked(decideWorkspaceTransition).mockRejectedValueOnce(new TypeError('Response lost'));
  const { result } = renderHook(() =>
    useWorkspaceReviewSnapshot('proj_1', 'workspace_prd_handoff', fixed.snapshot_id)
  );
  await waitFor(() => expect(result.current.state.loading).toBe(false));
  await act(async () => {
    await result.current.decide('overridden', '  Reviewed exception  ');
  });
  const original = structuredClone(vi.mocked(decideWorkspaceTransition).mock.calls[0]?.[2]);
  expect(result.current.state.recovery).toEqual({
    outcome: 'overridden',
    decisionReason: 'Reviewed exception',
  });
  await act(async () => {
    await result.current.decide('rejected');
    await result.current.decide('overridden', 'Different exception');
  });
  expect(decideWorkspaceTransition).toHaveBeenCalledTimes(1);
  const refreshed = structuredClone(fixed);
  refreshed.snapshot.review.precondition.statementDigests = ['sha256:new-evidence'];
  vi.mocked(fetchLatestWorkspaceTransitionReviewSnapshot).mockResolvedValueOnce(refreshed);
  await act(async () => {
    await result.current.load();
  });
  expect(result.current.state.recovery).toBeDefined();
  vi.mocked(decideWorkspaceTransition).mockResolvedValueOnce(
    decisionEnvelope('committed') as never
  );
  await act(async () => {
    await result.current.retryDecision?.();
  });
  expect(vi.mocked(decideWorkspaceTransition).mock.calls[1]?.[2]).toEqual(original);
  expect(result.current.state.data?.change_projection.status).toBe('committed');
  expect(result.current.state.recovery).toBeUndefined();
  expect(window.sessionStorage.length).toBe(0);
});

it('retains an uncertain original Decision after remount and does not switch its meaning', async () => {
  const fixed = snapshotEnvelope('reviewing');
  vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue(fixed);
  vi.mocked(decideWorkspaceTransition).mockRejectedValueOnce(new TypeError('Response lost'));
  const first = renderHook(() =>
    useWorkspaceReviewSnapshot('proj_1', 'workspace_prd_handoff', fixed.snapshot_id)
  );
  await waitFor(() => expect(first.result.current.state.loading).toBe(false));
  await act(async () => {
    await first.result.current.decide('rejected', 'Keep this draft');
  });
  const original = structuredClone(vi.mocked(decideWorkspaceTransition).mock.calls[0]?.[2]);
  first.unmount();
  const second = renderHook(() =>
    useWorkspaceReviewSnapshot('proj_1', 'workspace_prd_handoff', fixed.snapshot_id)
  );
  await waitFor(() => expect(second.result.current.state.loading).toBe(false));
  expect(second.result.current.state.recovery).toEqual({
    outcome: 'rejected',
    decisionReason: 'Keep this draft',
  });
  await act(async () => {
    await second.result.current.decide('accepted');
  });
  expect(decideWorkspaceTransition).toHaveBeenCalledTimes(1);
  const rejected = finalEnvelope('rejected');
  vi.mocked(fetchLatestWorkspaceTransitionReviewSnapshot).mockResolvedValueOnce(rejected);
  await act(async () => {
    await second.result.current.load();
  });
  expect(second.result.current.state.data?.change_projection.status).toBe('rejected');
  expect(second.result.current.state.recovery).toBeUndefined();
  expect(original?.outcome).toBe('rejected');
  expect(window.sessionStorage.length).toBe(0);
});

it('ignores an old latest result when the active Workspace changes', async () => {
  const fixed = snapshotEnvelope('reviewing');
  const next = snapshotEnvelope('reviewing');
  next.workspace_id = 'workspace_next';
  next.snapshot.workspaceId = 'workspace_next';
  next.transition_id = 'trn_next';
  next.snapshot.transitionId = 'trn_next';
  let finishOld!: (value: WorkspaceTransitionReviewSnapshotEnvelope) => void;
  vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockImplementation(
    async (_project, workspace) => (workspace === 'workspace_next' ? next : fixed)
  );
  vi.mocked(fetchLatestWorkspaceTransitionReviewSnapshot)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        })
    )
    .mockResolvedValueOnce(next);
  const { result } = renderHook(() => {
    const [workspace, setWorkspace] = useState('workspace_prd_handoff');
    return {
      review: useWorkspaceReviewSnapshot('proj_1', workspace, fixed.snapshot_id),
      setWorkspace,
    };
  });
  await waitFor(() =>
    expect(fetchLatestWorkspaceTransitionReviewSnapshot).toHaveBeenCalledTimes(1)
  );
  await act(async () => {
    result.current.setWorkspace('workspace_next');
  });
  await waitFor(() => expect(result.current.review.state.loading).toBe(false));
  await act(async () => {
    finishOld(snapshotEnvelope('committed'));
  });
  expect(result.current.review.state.data?.workspace_id).toBe('workspace_next');
  expect(result.current.review.state.data?.change_projection.status).toBe('reviewing');
});

it('does not publish a late Decision or commit event after unmount', async () => {
  const fixed = snapshotEnvelope('reviewing');
  vi.mocked(fetchWorkspaceTransitionReviewSnapshot).mockResolvedValue(fixed);
  let finish!: (value: ReturnType<typeof decisionEnvelope>) => void;
  vi.mocked(decideWorkspaceTransition).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = (value) => resolve(value as never);
      })
  );
  const commitCreated = vi.fn();
  window.addEventListener('t3x:commit-created', commitCreated);
  try {
    const hook = renderHook(() =>
      useWorkspaceReviewSnapshot('proj_1', 'workspace_prd_handoff', fixed.snapshot_id)
    );
    await waitFor(() => expect(hook.result.current.state.loading).toBe(false));
    let decision!: Promise<unknown>;
    act(() => {
      decision = hook.result.current.decide('accepted');
    });
    hook.unmount();
    await act(async () => {
      finish(decisionEnvelope('committed'));
      await decision;
    });
    expect(commitCreated).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(1);
  } finally {
    window.removeEventListener('t3x:commit-created', commitCreated);
  }
});

function finalEnvelope(
  status: 'committed' | 'rejected'
): WorkspaceTransitionReviewSnapshotEnvelope {
  const data = snapshotEnvelope('committed');
  if (status === 'rejected') {
    const pending = snapshotEnvelope('reviewing');
    data.snapshot.objects = pending.snapshot.objects;
    Object.assign(data.snapshot.transition, {
      decision: { observation: 'supplied', outcome: 'rejected' },
      history: { observation: 'not_committed' },
    });
    data.change_projection.status = 'rejected';
  }
  return data;
}

function snapshotEnvelope(
  status: 'reviewing' | 'committed'
): WorkspaceTransitionReviewSnapshotEnvelope {
  const snapshot = reviewSnapshot(status);
  const changeProjection = changeProjectionFor(status, snapshot);
  return {
    snapshot_id: snapshot.snapshotId,
    snapshot_digest: snapshot.snapshotDigest,
    project_id: snapshot.projectId,
    workspace_id: snapshot.workspaceId,
    transition_id: snapshot.transitionId,
    review_digest: snapshot.review.digest,
    supersedes_snapshot_id: null,
    supersedes_snapshot_digest: null,
    snapshot,
    change_projection: changeProjection,
    created_at: snapshot.createdAt,
  } as unknown as WorkspaceTransitionReviewSnapshotEnvelope;
}

function decisionEnvelope(status: 'committed') {
  const snapshot = reviewSnapshot(status);
  return {
    transition_id: snapshot.transitionId,
    transition: snapshot.transition,
    precondition: {
      workspace_revision: 7,
      ref_head: null,
      effect_digest: `sha256:${'a'.repeat(64)}`,
      proposal_digest: `sha256:${'b'.repeat(64)}`,
      statement_digests: [`sha256:${'c'.repeat(64)}`],
      policy_digest: `sha256:${'d'.repeat(64)}`,
    },
    decision_digest: `sha256:${'f'.repeat(64)}`,
    review_snapshot: snapshot,
    change_projection: changeProjectionFor(status, snapshot),
  };
}

function changeProjectionFor(
  status: 'reviewing' | 'committed',
  snapshot: ReturnType<typeof reviewSnapshot>
) {
  return {
    schema: 't3x.application/change-projection/v1',
    version: 1,
    authoritative: false,
    source: {
      kind: 'review_snapshot',
      snapshotId: snapshot.snapshotId,
      snapshotDigest: snapshot.snapshotDigest,
      snapshotCreatedAt: snapshot.createdAt,
    },
    projectId: snapshot.projectId,
    workspaceId: snapshot.workspaceId,
    transitionId: snapshot.transitionId,
    title: 'Reduce device log volume',
    status,
    review: {
      digest: snapshot.review.digest,
      refName: 'feature/prd-audience',
      refHead: null,
      workspaceRevision: 7,
      policyDigest: `sha256:${'d'.repeat(64)}`,
    },
    objects: snapshot.objects,
    checks: {},
    actions: {},
  };
}

function reviewSnapshot(status: 'reviewing' | 'committed') {
  return {
    schema: 't3x.application/review-snapshot/v1',
    version: 1,
    snapshotId:
      status === 'reviewing'
        ? 'rvs_88888888888888888888888888888888'
        : 'rvs_99999999999999999999999999999999',
    snapshotDigest:
      status === 'reviewing' ? `sha256:${'8'.repeat(64)}` : `sha256:${'9'.repeat(64)}`,
    createdAt: '2026-08-17T00:00:00.000Z',
    projectId: 'proj_1',
    workspaceId: 'workspace_prd_handoff',
    transitionId: `trn_${'1'.repeat(32)}`,
    request: {
      kind: 'structured_yops',
      id: 'request:workspace_prd_handoff',
      createdAt: '2026-08-17T00:00:00.000Z',
    },
    review: {
      digest: `sha256:${'r'.repeat(64)}`,
      precondition: {
        workspaceRevision: 7,
        refName: 'feature/prd-audience',
        refHead: null,
        effectDigest: `sha256:${'a'.repeat(64)}`,
        proposalDigest: `sha256:${'b'.repeat(64)}`,
        statementDigests: [`sha256:${'c'.repeat(64)}`],
        policyDigest: `sha256:${'d'.repeat(64)}`,
      },
    },
    objects: {
      base: { kind: 'state', schema: 't3x/state/v1', digest: `sha256:${'1'.repeat(64)}` },
      result: { kind: 'state', schema: 't3x/state/v1', digest: `sha256:${'2'.repeat(64)}` },
      effect: { kind: 'effect', schema: 't3x/effect/v1', digest: `sha256:${'a'.repeat(64)}` },
      proposal: {
        kind: 'statement',
        schema: 't3x/statement/v1',
        digest: `sha256:${'b'.repeat(64)}`,
      },
      statements: [
        {
          kind: 'statement',
          schema: 't3x/statement/v1',
          digest: `sha256:${'c'.repeat(64)}`,
        },
      ],
      ...(status === 'committed'
        ? {
            commit: {
              kind: 'commit',
              schema: 't3x/commit/v2',
              digest: `sha256:${'e'.repeat(64)}`,
            },
            decision: {
              kind: 'statement',
              schema: 't3x/statement/v1',
              digest: `sha256:${'f'.repeat(64)}`,
            },
          }
        : {}),
    },
    transition: {
      mode: 'transition',
      checks: {
        validation: {
          runs: [{ predicate: { schemaResource: { digest: `sha256:${'a'.repeat(64)}` } } }],
        },
      },
      decision:
        status === 'reviewing'
          ? { observation: 'not_supplied' }
          : { observation: 'supplied', outcome: 'accepted' },
      history:
        status === 'committed'
          ? { observation: 'committed', commit: { id: `sha256:${'e'.repeat(64)}` } }
          : { observation: 'not_committed' },
    },
  };
}
