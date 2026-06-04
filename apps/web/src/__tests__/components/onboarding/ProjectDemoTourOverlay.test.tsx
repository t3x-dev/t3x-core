// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectDemoTourOverlay } from '@/components/onboarding/ProjectDemoTourOverlay';

describe('ProjectDemoTourOverlay', () => {
  it('moves from the commit card to the + New Leaf action instead of the sidebar Leaf tab', async () => {
    const onDone = vi.fn();

    render(
      <>
        <button type="button" data-intro-target="canvas-commit-node">
          Commit card
        </button>
        <button type="button" data-intro-target="canvas-floating-action-new-leaf">
          New Leaf
        </button>
        <button type="button" data-intro-target="sidebar-leaf-tab">
          Leaf tab
        </button>
        <ProjectDemoTourOverlay open onClose={vi.fn()} onDone={onDone} interactionMode="guided" />
      </>
    );

    expect(screen.getByText('Click the highlighted commit card')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Commit card' }));

    await waitFor(() => {
      expect(screen.getByText('Click the highlighted + New Leaf action')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Click + New Leaf in the floating version action bar.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Click the highlighted Leaf tab')).toBeNull();

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'New Leaf' }));

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });
});
