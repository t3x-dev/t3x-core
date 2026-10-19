// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { WorkspaceSchemaPendingNotice } from '@/components/workspaces/WorkspaceSchemaPendingNotice';

const mocks = vi.hoisted(() => ({
  status: 'pending_preparation',
  reason: null as string | null,
  composition: false,
}));
vi.mock('@/hooks/schemas/useWorkspaceSchemaPending', () => ({
  useWorkspaceSchemaPending: () => ({
    data: {
      status: mocks.status,
      reason: mocks.reason,
      pending: mocks.composition ? { source: { kind: 'composition' } } : null,
    },
    loading: false,
  }),
}));
it('offers recovery in the same Workspace and keeps stale intent visible', () => {
  const { rerender } = render(
    <WorkspaceSchemaPendingNotice
      projectId="p"
      workspaceId="w"
      branch="feature/test"
      revision={8}
    />
  );
  expect(screen.getByText('Schema change awaiting preparation')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Review saved candidate' })).toHaveAttribute(
    'href',
    '/project/p?tab=schemas&schemaView=studio&workspace=w&branch=feature%2Ftest'
  );
  expect(screen.getByText(/Current Schema and content are unchanged/)).toBeVisible();
  mocks.status = 'stale';
  mocks.reason = 'The Workspace changed. Review it again.';
  rerender(
    <WorkspaceSchemaPendingNotice
      projectId="p"
      workspaceId="w"
      branch="feature/test"
      revision={9}
    />
  );
  expect(screen.getByText('Schema candidate needs a new preview')).toBeVisible();
  expect(screen.getByText(mocks.reason)).toBeVisible();
  mocks.status = 'none';
  rerender(
    <WorkspaceSchemaPendingNotice
      projectId="p"
      workspaceId="w"
      branch="feature/test"
      revision={10}
    />
  );
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});
it('recovers a legacy Composition in the embedded workbench', () => {
  mocks.status = 'pending_preparation';
  mocks.reason = null;
  mocks.composition = true;
  render(<WorkspaceSchemaPendingNotice projectId="p" workspaceId="w" branch="main" revision={8} />);
  expect(screen.getByRole('link', { name: 'Review saved candidate' })).toHaveAttribute(
    'href',
    '/project/p?tab=schemas&schemaView=studio&workspace=w&branch=main&mode=compose'
  );
});
