// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyIntroDemoCommitToCanvasGraph,
  clearIntroDemoLocalCommit,
  INTRO_DEMO_LOCAL_COMMIT_STORAGE_KEY,
  type IntroDemoLocalCommit,
  readIntroDemoLocalCommit,
  resolveIntroDemoApiCommitForHash,
  saveIntroDemoLocalCommit,
} from '@/hooks/onboarding/introDemoLocalCommit';
import { DEMO_COMMIT_HASH, demoTree } from '@/hooks/onboarding/useIntroDemoReplayActions';
import type { CanvasNodeData } from '@/types/nodes';

function makeCommit(overrides: Partial<IntroDemoLocalCommit> = {}): IntroDemoLocalCommit {
  return {
    projectId: 'proj_demo',
    conversationId: 'conv_demo',
    hash: DEMO_COMMIT_HASH,
    branch: 'main',
    message: 'Prompt review demo',
    committedAt: '2026-06-04T06:55:00.000Z',
    content: demoTree(),
    ...overrides,
  };
}

function makeStagingNode(): Node<CanvasNodeData> {
  return {
    id: 'conv_demo',
    type: 'unit',
    position: { x: 0, y: 0 },
    data: {
      entryId: 'demo',
      title: 'Prompt review intake',
      summary: '1 turn',
      status: 'staging',
      timestamp: '2026-06-04T06:54:00.000Z',
      tags: ['unit'],
      kind: 'unit',
      conversationId: 'conv_demo',
      commitStatus: 'staging',
      pendingBranch: 'main',
    },
  };
}

describe('intro demo local commit', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('round-trips the local demo commit marker by project', () => {
    const commit = makeCommit();

    saveIntroDemoLocalCommit(commit);

    expect(readIntroDemoLocalCommit('proj_demo')).toEqual(commit);
    expect(readIntroDemoLocalCommit('proj_other')).toBeNull();
    expect(window.sessionStorage.getItem(INTRO_DEMO_LOCAL_COMMIT_STORAGE_KEY)).not.toBeNull();
  });

  it('clears the local demo commit marker for the completed project only', () => {
    const commit = makeCommit();
    saveIntroDemoLocalCommit(commit);

    clearIntroDemoLocalCommit('proj_other');
    expect(readIntroDemoLocalCommit('proj_demo')).toEqual(commit);

    clearIntroDemoLocalCommit('proj_demo');
    expect(readIntroDemoLocalCommit('proj_demo')).toBeNull();
    expect(window.sessionStorage.getItem(INTRO_DEMO_LOCAL_COMMIT_STORAGE_KEY)).toBeNull();
  });

  it('resolves a local demo commit into an API commit for matching detail routes', () => {
    const commit = makeCommit();
    saveIntroDemoLocalCommit(commit);

    const resolved = resolveIntroDemoApiCommitForHash('proj_demo', DEMO_COMMIT_HASH);

    expect(resolved?.hash).toBe(DEMO_COMMIT_HASH);
    expect(resolved?.project_id).toBe('proj_demo');
    expect(resolved?.message).toBe('Prompt review demo');
    expect(resolved?.content.trees[0]?.key).toBe('prompt_review_intake');
    expect(resolveIntroDemoApiCommitForHash('proj_demo', 'sha256:missing')).toBeNull();
    expect(resolveIntroDemoApiCommitForHash('proj_other', DEMO_COMMIT_HASH)).toBeNull();
  });

  it('turns the demo staging unit into a committed canvas unit', () => {
    const commit = makeCommit();
    const edge: Edge = {
      id: 'edge-conv_demo-leaf',
      source: 'conv_demo',
      target: 'leaf_1',
    };

    const result = applyIntroDemoCommitToCanvasGraph({
      nodes: [makeStagingNode()],
      edges: [edge],
      commit,
    });

    expect(result).not.toBeNull();
    const node = result?.nodes[0];
    expect(node?.id).toBe(DEMO_COMMIT_HASH);
    expect(node?.data.commitStatus).toBe('committed');
    expect(node?.data.commitHash).toBe(DEMO_COMMIT_HASH);
    expect(node?.data.branchType).toBe('main');
    expect(node?.data.pendingBranch).toBeUndefined();
    expect(node?.data.commit?.content.trees[0]?.key).toBe('prompt_review_intake');
    expect(result?.edges[0].source).toBe(DEMO_COMMIT_HASH);
    expect(result?.edges[0].id).toContain(DEMO_COMMIT_HASH);
  });

  it('folds a reloaded staging unit into the existing local committed unit', () => {
    const committedNode = makeStagingNode();
    committedNode.id = DEMO_COMMIT_HASH;
    committedNode.data.commitStatus = 'committed';
    committedNode.data.commitHash = DEMO_COMMIT_HASH;

    const result = applyIntroDemoCommitToCanvasGraph({
      nodes: [committedNode, makeStagingNode()],
      edges: [
        {
          id: 'edge-conv_demo-downstream',
          source: 'conv_demo',
          target: 'leaf_1',
        },
      ],
      commit: makeCommit(),
    });

    expect(result?.nodes).toHaveLength(1);
    expect(result?.nodes[0].id).toBe(DEMO_COMMIT_HASH);
    expect(result?.edges[0].source).toBe(DEMO_COMMIT_HASH);
  });
});
