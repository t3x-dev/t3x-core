// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MergeReadyStrip } from '@/components/merge/MergeReadyStrip';

describe('MergeReadyStrip', () => {
  it('separates structure readiness from the required merge message', () => {
    render(<MergeReadyStrip autoKeptCount={8} conflictCount={0} previewTotal={8} message="" />);

    expect(screen.getByText('Structure ready')).toBeVisible();
    expect(screen.getByText(/8 auto-kept · 0 conflicts · message required/)).toBeVisible();
  });

  it('labels the merge ready when conflicts are clear and a message exists', () => {
    render(
      <MergeReadyStrip
        autoKeptCount={8}
        conflictCount={0}
        previewTotal={8}
        message="Merge branch"
      />
    );

    expect(screen.getByText('Ready to merge')).toBeVisible();
    expect(screen.getByText(/8 auto-kept · 0 conflicts$/)).toBeVisible();
    expect(screen.getByText('Preview total 8')).toBeInTheDocument();
  });
});
