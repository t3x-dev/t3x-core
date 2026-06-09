// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectDemoTourOverlay } from '@/components/onboarding/ProjectDemoTourOverlay';

describe('ProjectDemoTourOverlay', () => {
  it('labels the guided escape action as skipping the demo', () => {
    const onSkip = vi.fn();

    render(
      <>
        <button type="button" data-intro-target="canvas-commit-node">
          Commit card
        </button>
        <ProjectDemoTourOverlay open onClose={vi.fn()} onSkip={onSkip} interactionMode="guided" />
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skip demo' }));

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('moves from the commit card to Details in the default canvas stage', async () => {
    const onDone = vi.fn();

    render(
      <>
        <button type="button" data-intro-target="canvas-commit-node">
          Commit card
        </button>
        <button type="button" data-intro-target="canvas-floating-action-details">
          Details
        </button>
        <ProjectDemoTourOverlay open onClose={vi.fn()} onDone={onDone} interactionMode="guided" />
      </>
    );

    expect(screen.getByText('Click the highlighted commit card')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Commit card' }));

    await waitFor(() => {
      expect(screen.getByText('Click Details to inspect this commit')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(screen.queryByText('Click the highlighted + New Leaf action')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it('moves from the commit card to the + New Leaf action in the leaf stage', async () => {
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
        <div data-intro-target="canvas-leaf-type-options">
          <button type="button">Twitter</button>
        </div>
        <ProjectDemoTourOverlay
          open
          onClose={vi.fn()}
          onDone={onDone}
          interactionMode="guided"
          stage="leaf"
        />
      </>
    );

    expect(screen.getByText('Click the highlighted commit card again')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Commit card' }));

    await waitFor(() => {
      expect(screen.getByText('Click the highlighted + New Leaf action')).toBeInTheDocument();
    });
    expect(screen.queryByText('What to click here')).toBeNull();
    expect(screen.queryByText('Click the highlighted Leaf tab')).toBeNull();

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'New Leaf' }));

    await waitFor(() => {
      expect(screen.getByText('Choose an output type')).toBeInTheDocument();
    });
    expect(screen.getByText('Leaf type')).toBeInTheDocument();
    expect(screen.queryByText('What to click here')).toBeNull();
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Twitter' }));

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it('does not finish the leaf type step from a non-button click inside the target area', async () => {
    const onDone = vi.fn();

    render(
      <>
        <button type="button" data-intro-target="canvas-commit-node">
          Commit card
        </button>
        <button type="button" data-intro-target="canvas-floating-action-new-leaf">
          New Leaf
        </button>
        <div data-testid="leaf-type-options" data-intro-target="canvas-leaf-type-options">
          <button type="button">Twitter</button>
        </div>
        <ProjectDemoTourOverlay
          open
          onClose={vi.fn()}
          onDone={onDone}
          interactionMode="guided"
          stage="leaf"
        />
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Commit card' }));
    await waitFor(() => {
      expect(screen.getByText('Click the highlighted + New Leaf action')).toBeInTheDocument();
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'New Leaf' }));
    await waitFor(() => {
      expect(screen.getByText('Choose an output type')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('leaf-type-options'));

    expect(screen.getByText('Choose an output type')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Twitter' }));

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it('stays on the current step when the next guided target never appears', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();

    try {
      render(
        <>
          <button type="button" data-intro-target="canvas-commit-node">
            Commit card
          </button>
          <button type="button" data-intro-target="canvas-floating-action-new-leaf">
            New Leaf
          </button>
          <ProjectDemoTourOverlay
            open
            onClose={vi.fn()}
            onDone={onDone}
            interactionMode="guided"
            stage="leaf"
          />
        </>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Commit card' }));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(screen.getByText('Click the highlighted + New Leaf action')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'New Leaf' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100);
      });

      expect(screen.getByText('Click the highlighted + New Leaf action')).toBeInTheDocument();
      expect(screen.queryByText('Choose an output type')).toBeNull();
      expect(onDone).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
