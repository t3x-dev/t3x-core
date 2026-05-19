// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { DEMO_WORKSPACE_FIXTURE } from '@t3x-dev/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LandingDemoPreview } from '@/components/chat/LandingDemoPreview';

describe('LandingDemoPreview', () => {
  it('renders the source to YOps to commit path without requiring a provider', () => {
    render(<LandingDemoPreview onSelectSource={vi.fn()} />);

    expect(screen.getByText('source -> YOps -> commit')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Prompt Review' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText(DEMO_WORKSPACE_FIXTURE.source.title)).toBeVisible();
    expect(screen.getByText(/define:/)).toBeVisible();
    expect(screen.getByText(DEMO_WORKSPACE_FIXTURE.commit.message)).toBeVisible();
  });

  it('switches demo cases and prefill source from the selected fixture', () => {
    const onSelectSource = vi.fn();
    render(<LandingDemoPreview onSelectSource={onSelectSource} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Meeting Notes' }));

    expect(onSelectSource).toHaveBeenCalledWith(expect.stringContaining('Decision: ship'));
    expect(screen.getByText(/release_readiness/)).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Meeting Notes' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
