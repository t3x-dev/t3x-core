// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasSelectionPanel } from '@/components/canvas/CanvasSelectionPanel';
import { buildCommitActions } from '@/components/canvas/CommitActionPanel';
import type { CanvasNodeData } from '@/types/nodes';

const noop = vi.fn();

function makeNode(overrides: Partial<CanvasNodeData> = {}): Node<CanvasNodeData, 'unit'> {
  return {
    data: {
      branchName: 'main',
      branchType: 'main',
      commit: {
        author: { type: 'human', name: 'Tester' },
        branch: 'main',
        committed_at: '2026-05-19T00:00:00Z',
        content: { trees: [{ key: 'food_ideas', slots: {}, children: [] }], relations: [] },
        hash: 'sha256:2576b1356297',
        message: 'fresh, sweet, indulgent, comforting',
        schema: 't3x/commit',
        sources: null,
      },
      commitHash: 'sha256:2576b1356297',
      commitStatus: 'committed',
      conversationId: 'conv_05a9',
      entryId: '2576b13',
      kind: 'unit',
      leaves: [],
      sources: [{ id: 'conv_05a9', label: 'conv#05a9', type: 'conversation' }],
      status: 'committed',
      summary: '+ food_ideas subtree',
      tags: [],
      timestamp: '2d ago',
      title: 'Trip Plan1',
      ...overrides,
    },
    id: 'node_1',
    position: { x: 0, y: 0 },
    type: 'unit',
  };
}

describe('CanvasSelectionPanel', () => {
  it('keeps the empty state quiet until a commit is selected', () => {
    render(<CanvasSelectionPanel actions={[]} node={null} />);

    expect(screen.getByText('SELECTION')).toBeInTheDocument();
    expect(screen.getByText('Select a commit on the canvas.')).toBeInTheDocument();
  });

  it('summarizes the selected commit and only shows actions that apply', () => {
    const node = makeNode();
    const actions = buildCommitActions({
      onCreateLeaf: noop,
      onViewDetails: noop,
      onViewDiff: noop,
    });

    render(<CanvasSelectionPanel actions={actions} node={node} parentHash="sha256:f0aafcd" />);

    expect(screen.getByText('Trip Plan1')).toBeInTheDocument();
    expect(screen.getByText('1 tree · 0 relations')).toBeInTheDocument();
    expect(screen.getByText('food_ideas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Diff' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create Leaf From This Version' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Merge Into Main' })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Merge is hidden on main/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Action Logic')).toBeInTheDocument();
  });

  it('explains why branch-head nodes expose merge and still allow new leaves', () => {
    const node = makeNode({
      branchName: 'branch 1',
      branchType: 'branch',
      summary: 'destination adds Hawaii',
      title: 'Trip Plan2',
    });
    const actions = buildCommitActions({
      onCreateLeaf: noop,
      onMerge: noop,
      onViewDetails: noop,
      onViewDiff: noop,
    });

    render(
      <CanvasSelectionPanel
        actions={actions}
        canMerge
        node={node}
        parentHash="sha256:2576b1356297"
      />
    );

    expect(screen.getByText('branch 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Merge Into Main' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create Leaf From This Version' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Merge appears because this is the latest branch head/i)
    ).toBeInTheDocument();
  });
});
