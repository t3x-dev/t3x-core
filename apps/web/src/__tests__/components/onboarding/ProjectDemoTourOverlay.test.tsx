// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectDemoTourOverlay } from '@/components/onboarding/ProjectDemoTourOverlay';

async function flushGuidedClick() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  });
}

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

  it('finishes the default canvas stage after the commit card is selected', async () => {
    const onDone = vi.fn();

    render(
      <>
        <button type="button" data-intro-target="canvas-commit-node">
          Commit card
        </button>
        <ProjectDemoTourOverlay open onClose={vi.fn()} onDone={onDone} interactionMode="guided" />
      </>
    );

    expect(screen.getByText('Select this commit version')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Commit card' }));

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Open commit details')).not.toBeInTheDocument();
  });

  it('guides delivery to State and finishes only after following the State link', async () => {
    const onDone = vi.fn();
    render(
      <>
        <button type="button" data-intro-target="canvas-commit-node">
          Commit card
        </button>
        <a href="#state" data-intro-target="canvas-back-to-state">
          Back to State
        </a>
        <ProjectDemoTourOverlay
          open
          onClose={vi.fn()}
          onDone={onDone}
          interactionMode="guided"
          stage="delivery"
        />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Commit card' }));
    await waitFor(() => expect(screen.getByText('Open State for delivery')).toBeInTheDocument());
    await flushGuidedClick();
    expect(screen.queryByText('Create a Leaf from this version')).not.toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: 'Back to State' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('keeps the escape action usable when State is unavailable', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const onSkip = vi.fn();
    try {
      render(
        <>
          <button type="button" data-intro-target="canvas-commit-node">
            Commit card
          </button>
          <ProjectDemoTourOverlay
            open
            onClose={vi.fn()}
            onDone={onDone}
            onSkip={onSkip}
            interactionMode="guided"
            stage="delivery"
          />
        </>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Commit card' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100);
      });
      expect(screen.getByText('Select this commit version')).toBeInTheDocument();
      expect(onDone).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Skip demo' }));
      expect(onSkip).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
