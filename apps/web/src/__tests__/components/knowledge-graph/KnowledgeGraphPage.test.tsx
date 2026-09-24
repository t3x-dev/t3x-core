// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeGraphPage } from '@/components/knowledge-graph/KnowledgeGraphPage';

const mocks = vi.hoisted(() => ({ build: vi.fn(), fetchNodes: vi.fn() }));

vi.mock('@/hooks/knowledge-graph/useKnowledgeGraph', () => ({
  useKnowledgeGraph: () => ({
    nodes: [],
    loading: false,
    error: null,
    fetchNodes: mocks.fetchNodes,
    buildKnowledgeGraph: mocks.build,
  }),
}));
vi.mock('@/infrastructure/knowledge-graph', () => ({ buildKnowledgeGraph: mocks.build }));
vi.mock('@/components/knowledge-graph/KGToolbar', () => ({ KGToolbar: () => null }));
vi.mock('@/components/knowledge-graph/KGDetailPanel', () => ({ KGDetailPanel: () => null }));
vi.mock('@/components/knowledge-graph/KGCanvas', () => ({ KGCanvas: () => null }));

beforeEach(() => {
  mocks.build.mockReset().mockResolvedValue({ nodes_created: 0 });
  mocks.fetchNodes.mockReset().mockResolvedValue(undefined);
});

describe('KnowledgeGraphPage', () => {
  it('builds the graph through the existing endpoint and refreshes nodes', async () => {
    render(<KnowledgeGraphPage projectId="project-1" />);
    expect(mocks.fetchNodes).toHaveBeenCalledWith('project-1');
    fireEvent.click(screen.getByRole('button', { name: 'Build graph' }));
    await waitFor(() => expect(mocks.build).toHaveBeenCalledWith('project-1'));
    await waitFor(() => expect(mocks.fetchNodes).toHaveBeenCalledTimes(2));
  });

  it('shows build failure without claiming that a graph was generated', async () => {
    mocks.build.mockRejectedValue(new Error('Build failed'));
    render(<KnowledgeGraphPage projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Build graph' }));
    expect(await screen.findByText('Build failed')).toBeInTheDocument();
  });
});
