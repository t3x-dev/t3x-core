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
        projectId="proj_test"
        returnTo="/project/proj_test/history?branch=main"
      />
    );

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/project/proj_test/commit/sha256%3A0530ef8?view=diff&returnTo=%2Fproject%2Fproj_test%2Fhistory%3Fbranch%3Dmain'
    );
  });
});
