// @vitest-environment jsdom

import type { SourcedYOp } from '@t3x-dev/core';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/drafts/useScriptExecution', () => ({
  useScriptExecution: () => ({
    execute: vi.fn(),
    canRun: false,
    disabledReason: 'No runnable script',
  }),
}));

import { WorkspaceTopbar } from '@/components/chat/WorkspaceTopbar';
import { useWorkspaceStore } from '@/store/workspaceStore';

function llmOp(path: string): SourcedYOp {
  return {
    define: { path },
    source: {
      type: 'llm',
      model: 'm',
      at: '2026-04-26T00:00:00Z',
      turn_ref: { turn_hash: `sha256:${path}`, quote: path, start_char: 0, end_char: path.length },
    },
  } as SourcedYOp;
}

function manualOp(path: string): SourcedYOp {
  return {
    set: { path, value: 'manual' },
    source: {
      type: 'human',
      surface: 'tree',
      at: '2026-04-26T00:00:00Z',
    },
  } as SourcedYOp;
}

function scriptOp(path: string): SourcedYOp {
  return {
    set: { path, value: 'script' },
    source: {
      type: 'human',
      surface: 'script',
      author: 'alice',
      at: '2026-04-26T00:00:00Z',
    },
  } as SourcedYOp;
}

describe('WorkspaceTopbar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useWorkspaceStore.getState().reset();
  });

  it('labels parent-only replay state as inherited baseline', () => {
    useWorkspaceStore.setState({
      tree: {
        trees: [{ key: 'food', slots: { desired_food: 'chestnuts' }, children: [] }],
        relations: [],
      },
      opsLog: [],
      baselineCommitHash: 'sha256:parent_commit',
      hasConversationChanges: false,
      isCommitted: false,
      hasDraft: false,
    });

    render(<WorkspaceTopbar />);

    expect(screen.getByText('Inherited baseline')).not.toBeNull();
    expect(screen.queryByText(/0 applied/)).toBeNull();
  });

  it('labels normal workspace state with materialized, surface, and pending counts', () => {
    useWorkspaceStore.setState({
      opsLog: [llmOp('sights'), manualOp('food/desired_food'), scriptOp('food/style')],
      draftOps: [llmOp('routes')],
      hasDraft: true,
      baselineCommitHash: null,
      hasConversationChanges: true,
    });

    render(<WorkspaceTopbar />);

    expect(screen.getByText(/Materialized: 3 ops/)).not.toBeNull();
    expect(screen.getByText(/YOps: 1/)).not.toBeNull();
    expect(screen.getByText(/Tree: 1/)).not.toBeNull();
    expect(screen.queryByText(/Manual:/)).toBeNull();
    expect(screen.getByText(/Pending: 1/)).not.toBeNull();
  });
});
