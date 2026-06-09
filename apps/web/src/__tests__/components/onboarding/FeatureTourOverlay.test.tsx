// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { SVGProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FeatureTourOverlay,
  type FeatureTourStep,
} from '@/components/onboarding/FeatureTourOverlay';

describe('FeatureTourOverlay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not rerender the active step when unrelated DOM mutations keep the target rect unchanged', async () => {
    let iconRenderCount = 0;
    const TestIcon = (props: SVGProps<SVGSVGElement>) => {
      iconRenderCount += 1;
      return <svg aria-label="Test icon" {...props} />;
    };
    const steps: FeatureTourStep[] = [
      {
        id: 'target',
        label: 'Target',
        title: 'Stable target',
        description: 'Keeps the same measured rect.',
        target: 'stable-target',
        tone: 'commit',
        icon: TestIcon as FeatureTourStep['icon'],
        details: ['Watch the stable target.'],
      },
    ];

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    render(
      <>
        <button
          type="button"
          data-intro-target="stable-target"
          ref={(node) => {
            if (!node) return;
            vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
              bottom: 40,
              height: 20,
              left: 10,
              right: 110,
              top: 20,
              width: 100,
              x: 10,
              y: 20,
              toJSON: () => ({}),
            });
          }}
        >
          Stable target
        </button>
        <FeatureTourOverlay open title="Tour" steps={steps} onClose={vi.fn()} />
      </>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stable target' })).toBeInTheDocument();
    });
    const initialIconRenderCount = iconRenderCount;
    expect(initialIconRenderCount).toBeGreaterThan(0);

    await act(async () => {
      const unrelatedNode = document.createElement('div');
      unrelatedNode.textContent = 'unrelated mutation';
      document.body.appendChild(unrelatedNode);
      await Promise.resolve();
    });

    expect(iconRenderCount).toBe(initialIconRenderCount);
  });
});
