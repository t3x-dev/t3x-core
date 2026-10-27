// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceChangeReviewPage } from '@/components/workspaces/WorkspaceChangeReviewPage';

const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams('branch=feature%2Fx&reviewPane=yaml'),
}));

describe('legacy Changes entry', () => {
  it.each([
    'workspace_branch%3Amain',
    'workspace_branch:main',
  ])('opens the exact snapshot in unified Review for %s', (workspaceId) => {
    render(
      <WorkspaceChangeReviewPage
        projectId="proj_1"
        workspaceId={workspaceId}
        snapshotId="rvs_saved"
      />
    );
    const href =
      '/project/proj_1?tab=workspaces&workspace=workspace_branch%3Amain&workspaceMode=review&branch=feature%2Fx&reviewSnapshot=rvs_saved&reviewPane=yaml';
    expect(replace).toHaveBeenCalledWith(href);
    expect(screen.getByRole('link', { name: 'Continue to Review' })).toHaveAttribute('href', href);
  });
});
