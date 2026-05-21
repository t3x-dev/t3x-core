// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { EdgeProps } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { AnimatedEdge } from '@/components/canvas/AnimatedEdge';

vi.mock('@xyflow/react', () => ({
  BaseEdge: ({ id, path, style }: { id: string; path: string; style: Record<string, unknown> }) => (
    <path data-path={path} data-style={JSON.stringify(style)} data-testid={`base-edge-${id}`} />
  ),
  getSmoothStepPath: () => ['M0 0 L10 10'],
  useStore: () => false,
}));

function renderEdge(overrides: Partial<EdgeProps> = {}) {
  const props = {
    data: { edgeType: 'evolve' },
    id: 'edge-a',
    selected: false,
    source: 'node-a',
    sourcePosition: 'right',
    sourceX: 0,
    sourceY: 0,
    style: {},
    target: 'node-b',
    targetPosition: 'left',
    targetX: 10,
    targetY: 10,
    ...overrides,
  } as unknown as EdgeProps;
  return render(
    <svg aria-hidden="true">
      <AnimatedEdge {...props} />
    </svg>
  );
}

function getBaseStyle() {
  return JSON.parse(screen.getByTestId('base-edge-edge-a').getAttribute('data-style') ?? '{}');
}

describe('AnimatedEdge rhythm contract', () => {
  it('renders default edges with low-noise tokenized rhythm', () => {
    renderEdge();

    expect(getBaseStyle()).toMatchObject({
      opacity: 'var(--edge-default-opacity)',
      stroke: 'var(--edge-evolve-base)',
      strokeWidth: 2,
    });
    expect(screen.queryByTestId('edge-glow-edge-a')).not.toBeInTheDocument();
  });

  it('renders selected branch path edges stronger without relying on raw colors', () => {
    renderEdge({
      data: { edgePathTone: 'branch', edgeRhythm: 'selected', edgeType: 'evolve' },
    } as Partial<EdgeProps>);

    expect(getBaseStyle()).toMatchObject({
      opacity: 'var(--edge-selected-opacity)',
      stroke: 'var(--edge-branch-selected)',
      strokeWidth: 2.5,
    });
    expect(screen.getByTestId('edge-glow-edge-a')).toHaveAttribute(
      'stroke',
      'var(--edge-branch-glow)'
    );
  });

  it('keeps non-selected branches visible while dimming them', () => {
    renderEdge({
      data: { edgePathTone: 'commit', edgeRhythm: 'dimmed', edgeType: 'merge' },
    } as Partial<EdgeProps>);

    expect(getBaseStyle()).toMatchObject({
      opacity: 'var(--edge-dim-opacity)',
      stroke: 'var(--edge-merge-base)',
      strokeWidth: 1.25,
    });
  });
});
