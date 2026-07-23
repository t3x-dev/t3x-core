// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeafPanel } from '@/components/canvas/LeafPanel';
import { useCanvasStore } from '@/store/canvasStore';

const mocks = vi.hoisted(() => ({
  addLeaf: vi.fn(),
  addLeafFromTemplate: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock('@/hooks/canvas/useCanvasLeafActions', () => ({
  useCanvasLeafActions: () => ({
    add: mocks.addLeaf,
    addFromTemplate: mocks.addLeafFromTemplate,
  }),
}));

vi.mock('@/hooks/onboarding/useIntroDemoQueryFlag', () => ({
  useIntroDemoQueryFlag: () => false,
}));

vi.mock('@/hooks/shared/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('@/hooks/templates/useTemplatesList', () => ({
  useTemplatesList: () => ({ loading: false, templates: [] }),
}));

describe('LeafPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addLeaf.mockResolvedValue('leaf_created');
    useCanvasStore.setState({
      leafCreating: false,
      leafPanelCommitId: 'sha256:commit',
      leafPanelOpen: true,
      projectId: 'proj_test',
    });
  });

  afterEach(() => {
    cleanup();
    useCanvasStore.setState({
      leafPanelCommitId: undefined,
      leafPanelOpen: false,
      projectId: null,
    });
  });

  it('opens a newly created Leaf in the repository Outputs workspace', async () => {
    render(<LeafPanel projectName="Trust Gate" />);

    fireEvent.click(screen.getByRole('button', { name: 'X / Twitter' }));

    await waitFor(() => expect(mocks.addLeaf).toHaveBeenCalledWith('tweet'));
    expect(mocks.routerPush).toHaveBeenCalledWith('/t3x-dev/trust-gate/outputs?leaf=leaf_created');
  });
});
