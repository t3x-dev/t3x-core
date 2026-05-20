// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitCeremony } from '@/components/commit/CommitCeremony';

const reducedMotion = vi.hoisted(() => ({ value: false }));

vi.mock('@/hooks/shared/useReducedMotion', () => ({
  useReducedMotion: () => reducedMotion.value,
}));

describe('CommitCeremony', () => {
  beforeEach(() => {
    reducedMotion.value = false;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows sealed confirmation with the real commit hash', () => {
    render(
      <CommitCeremony hash="sha256:1234567890abcdef1234567890abcdef" open onComplete={vi.fn()} />
    );

    expect(screen.getByRole('status', { name: 'Commit sealed' })).toBeVisible();
    expect(screen.getByText('Sealed')).toBeVisible();
    expect(screen.getByText('1234567890ab')).toBeVisible();
    expect(screen.getByTitle('sha256:1234567890abcdef1234567890abcdef')).toBeVisible();
  });

  it('finishes after the lightweight ceremony duration', () => {
    const onComplete = vi.fn();
    render(
      <CommitCeremony hash="sha256:1234567890abcdef1234567890abcdef" open onComplete={onComplete} />
    );

    act(() => {
      vi.advanceTimersByTime(1399);
    });
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps confirmation but removes motion for reduced-motion users', () => {
    reducedMotion.value = true;

    render(
      <CommitCeremony hash="sha256:1234567890abcdef1234567890abcdef" open onComplete={vi.fn()} />
    );

    expect(screen.getByRole('status', { name: 'Commit sealed' })).toHaveAttribute(
      'data-motion',
      'reduced'
    );
    expect(screen.getByText('Sealed')).toBeVisible();
    expect(screen.queryByTestId('commit-seal-animation')).toBeNull();
  });
});
