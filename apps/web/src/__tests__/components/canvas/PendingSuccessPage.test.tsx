// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PendingSuccessPage } from '@/components/canvas/NodeModal/PendingSuccessPage';

describe('PendingSuccessPage', () => {
  it('returns to the Canvas without exposing the removed commit details surface', () => {
    const onBackToCanvas = vi.fn();

    render(
      <PendingSuccessPage
        commitHash="sha256:abc123"
        diffStats={undefined}
        onBackToCanvas={onBackToCanvas}
        onClose={vi.fn()}
        onCreateOutput={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /View .* Details/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Canvas' }));
    expect(onBackToCanvas).toHaveBeenCalledTimes(1);
  });
});
