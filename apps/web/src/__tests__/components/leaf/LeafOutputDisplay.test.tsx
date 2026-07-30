// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeafOutputDisplay } from '@/components/leaf/LeafOutputDisplay';

describe('LeafOutputDisplay', () => {
  it('guides the three-column flow without duplicating the generate action', () => {
    render(
      <LeafOutputDisplay
        assertions={null}
        constraints={[]}
        generateSuccessBanner={null}
        generatedAt={null}
        output={null}
      />
    );

    expect(screen.getByText('No output yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Review source nodes on the left, add constraints on the right, then describe the output below.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument();
  });
});
