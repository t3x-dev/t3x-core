// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type { TransitionViewV1 } from '@t3x-dev/core';
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
        parents: ['sha256:f0aafcd'],
        schema: 't3x/commit/v2',
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

function transitionView(): TransitionViewV1 {
  return {
    checks: {
      humanConfirmation: { observation: 'observed', runs: [{}] },
      objectIntegrity: 'verified',
      observationScope: { completeness: 'complete', sources: [] },
      replay: { observation: 'observed', outcomes: ['passed'], runs: [], unsupportedProfiles: [] },
      runner: {
        observation: 'no_statement_observed',
        outcomes: [],
        runs: [],
        unsupportedProfiles: [],
      },
      validation: {
        observation: 'observed',
        outcomes: ['failed'],
        runs: [],
        unsupportedProfiles: [],
      },
    },
    decision: { observation: 'not_supplied' },
  } as unknown as TransitionViewV1;
}

describe('CanvasSelectionPanel', () => {
  it('keeps the empty state quiet until a commit is selected', () => {
    const { container } = render(<CanvasSelectionPanel actions={[]} node={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows repository metadata, parents, and applicable commit actions', () => {
    const node = makeNode();
    const actions = buildCommitActions({ onViewDiff: noop });

    render(<CanvasSelectionPanel actions={actions} node={node} />);

    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Trip Plan1')).toBeInTheDocument();
    expect(screen.getByText(/2576b13/)).toBeInTheDocument();
    expect(screen.getByText(/f0aafcd/)).toBeInTheDocument();
    expect(screen.getByText('Tester')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View Diff Changes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create Leaf/i })).not.toBeInTheDocument();
  });

  it('renders statuses from the transition projection instead of fixed check results', () => {
    render(
      <CanvasSelectionPanel
        actions={[]}
        node={makeNode()}
        transitionState={{ error: null, loading: false, view: transitionView() }}
      />
    );

    expect(screen.getByText('Object integrity')).toBeInTheDocument();
    expect(screen.getByText('Replay')).toBeInTheDocument();
    expect(screen.getByText('Validation')).toBeInTheDocument();
    expect(screen.getByText('Runner')).toBeInTheDocument();
    expect(screen.getByText('Human confirmation')).toBeInTheDocument();
    expect(screen.getByText('verified')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('Not observed')).toBeInTheDocument();
    expect(screen.queryByText('Schema Check')).not.toBeInTheDocument();
    expect(screen.queryByText('Replay Check')).not.toBeInTheDocument();
  });

  it('shows real branch and merge-parent context', () => {
    const baseCommit = makeNode().data.commit!;
    const branchNode = makeNode({
      branchName: 'branch 1',
      branchType: 'branch',
      commit: {
        ...baseCommit,
        branch: 'branch 1',
        parents: ['sha256:2576b1356297', 'sha256:mergeparent'],
      },
      title: 'Trip Plan2',
    });
    const actions = buildCommitActions({ onMerge: noop, onViewDiff: noop });

    render(<CanvasSelectionPanel actions={actions} node={branchNode} />);

    const inspector = screen.getByRole('complementary');
    expect(inspector).toHaveAttribute('data-branch-color', 'branch 1');
    expect(inspector.style.getPropertyValue('--branch-accent')).toMatch(/^hsl\(/);
    expect(screen.getAllByText('branch 1').length).toBeGreaterThan(0);
    expect(screen.getByText(/mergepa/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument();
  });
});
