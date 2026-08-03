// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CommitHistoryRow } from '@/components/history/CommitHistoryRow';

describe('CommitHistoryRow', () => {
  it('opens the selected commit in the shared T3X Diff view and preserves History return state', () => {
    render(
      <CommitHistoryRow
        author={{ type: 'human', name: 'W' }}
        branch="main"
        committedAt="2026-07-29T08:00:00.000Z"
        diffStats={{ addedCount: 1, modifiedCount: 2, removedCount: 0 }}
        hash="sha256:0530ef8"
        isFirst
        isLast
        message="Correct canonical PRD title and summary slots"
        nodeCount={1}
        parentCount={1}
        parentHash="sha256:parent"
        projectId="proj_test"
        returnTo="/project/proj_test/history?branch=main"
      />
    );

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/project/proj_test/diff?base=sha256%3Aparent&target=sha256%3A0530ef8&returnTo=%2Fproject%2Fproj_test%2Fhistory%3Fbranch%3Dmain'
    );
  });

  it('focuses a root commit on Canvas instead of opening the retired detail route', () => {
    render(
      <CommitHistoryRow
        author={{ type: 'human', name: 'W' }}
        branch="main"
        committedAt="2026-07-29T08:00:00.000Z"
        hash="sha256:root"
        isFirst
        isLast
        message="Seed state"
        parentCount={0}
        projectId="proj_test"
        returnTo="/project/proj_test/history"
      />
    );

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/project/proj_test?view=canvas&commit=sha256%3Aroot&returnTo=%2Fproject%2Fproj_test%2Fhistory'
    );
  });
});
