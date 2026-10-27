// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceSchemaPendingNotice } from '@/components/workspaces/WorkspaceSchemaPendingNotice';

const mocks = vi.hoisted(() => ({
  status: 'pending_preparation',
  reason: null as string | null,
  composition: false,
  error: undefined as string | undefined,
  refresh: vi.fn(),
}));
vi.mock('@/hooks/schemas/useWorkspaceSchemaPending', () => ({
  useWorkspaceSchemaPending: () => ({
    data: {
      status: mocks.status,
      reason: mocks.reason,
      pending: mocks.composition ? { source: { kind: 'composition' } } : null,
    },
    loading: false,
    error: mocks.error,
    refresh: mocks.refresh,
  }),
}));
beforeEach(() => {
  mocks.status = 'pending_preparation';
  mocks.reason = null;
  mocks.composition = false;
  mocks.error = undefined;
  mocks.refresh.mockClear();
});
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
  expect(screen.getByRole('button', { name: 'Prepare content' })).toBeEnabled();
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
  expect(screen.getByRole('complementary')).toHaveTextContent(mocks.reason);
  expect(screen.queryByRole('button', { name: 'Prepare content' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review saved candidate' })).toBeVisible();
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
it('offers a retry when status loading fails without claiming the candidate is stale', () => {
  mocks.error = 'Schema preparation task unavailable.';
  render(<WorkspaceSchemaPendingNotice projectId="p" workspaceId="w" branch="main" revision={8} />);
  expect(screen.getByText('Schema preparation status unavailable')).toBeVisible();
  expect(screen.getByText(mocks.error)).toBeVisible();
  expect(screen.queryByText('Schema candidate needs a new preview')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Prepare content' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(mocks.refresh).toHaveBeenCalledOnce();
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
