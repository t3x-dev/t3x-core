// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceChangeReviewPage } from '@/components/workspaces/WorkspaceChangeReviewPage';

const replace = vi.hoisted(() => vi.fn());
const route = vi.hoisted(() => ({
  path: '/project/proj_1/changes/legacy/rvs_saved',
  query: 'branch=feature%2Fx&reviewPane=yaml',
}));
vi.mock('next/navigation', () => ({
  usePathname: () => route.path,
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(route.query),
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
    const href = screen.getByRole('link', { name: 'Continue to Review' }).getAttribute('href')!;
    const url = new URL(href, 'http://localhost');
    expect(url.pathname).toBe('/project/proj_1');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tab: 'workspaces',
      workspace: 'workspace_branch:main',
      workspaceMode: 'review',
      branch: 'feature/x',
      reviewSnapshot: 'rvs_saved',
      reviewPane: 'yaml',
    });
    expect(replace).toHaveBeenCalledWith(href);
  });
  it('preserves context and the fragment on the canonical route without allowing query overrides', () => {
    route.path = '/owner/repo/changes/legacy/rvs_saved';
    route.query += '&reviewSnapshot=wrong&workspace=wrong&schemaDiagnostics=1';
    window.location.hash = '#evidence';
    try {
      render(
        <WorkspaceChangeReviewPage
          projectId="proj_1"
          workspaceId="ws:main"
          snapshotId="rvs_saved"
        />
      );
      const href = screen.getByRole('link', { name: 'Continue to Review' }).getAttribute('href')!;
      const url = new URL(href, 'http://localhost');
      expect(url.pathname).toBe('/owner/repo/workspaces');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        workspace: 'ws:main',
        workspaceMode: 'review',
        branch: 'feature/x',
        reviewSnapshot: 'rvs_saved',
        reviewPane: 'yaml',
        schemaDiagnostics: '1',
      });
      expect(replace).toHaveBeenLastCalledWith(href + '#evidence');
    } finally {
      window.location.hash = '';
    }
  });
});
