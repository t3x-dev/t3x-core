// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { StudioSchemaEditCandidate } from '@t3x-dev/api-client';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkspacePendingSchemaReview } from '@/components/workspaces/WorkspacePendingSchemaReview';

const requests = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/hooks/workspaces/useWorkspaceSchemaEditingRequests', () => ({
  useWorkspaceSchemaEditingRequests: () => requests,
}));
vi.mock('@/components/workspaces/WorkspaceReviewCodeView', () => ({
  WorkspaceReviewCodeView: ({ yamlText }: { yamlText: string }) => <pre>{yamlText}</pre>,
}));
const candidate = { candidateId: 'edit-1', revision: 2 } as StudioSchemaEditCandidate;
const props = {
  projectId: 'p',
  workspaceId: 'w',
  revision: 8,
  candidate,
  branch: 'main',
  pane: 'changes' as const,
};
const result = {
  workspace: { revision: 8 },
  edit: candidate,
  unapplied: true,
  preview: {
    schema: { nodes: { aaa: { description: 'Saved description' } } },
    workspace: {
      changes: [{ kind: 'ADD', path: 'nodes.aaa.description', summary: 'Saved description' }],
    },
  },
};
beforeEach(() => requests.read.mockReset().mockResolvedValue(result));

it('shows the saved candidate changes, YAML and definition without preparing it', async () => {
  const { rerender } = render(<WorkspacePendingSchemaReview {...props} />);
  expect(await screen.findByText('nodes.aaa.description')).toBeVisible();
  rerender(<WorkspacePendingSchemaReview {...props} pane="yaml" />);
  expect(screen.getByText(/description: Saved description/)).toBeVisible();
  rerender(<WorkspacePendingSchemaReview {...props} pane="rendered" />);
  expect(screen.getByText('aaa')).toBeVisible();
  expect(requests.read).toHaveBeenCalledTimes(1);
});

it.each([
  { workspace: { revision: 9 } },
  { edit: { ...candidate, revision: 3 } },
  { unapplied: false },
])('rejects a preview that no longer matches the displayed candidate: %j', async (changed) => {
  requests.read.mockResolvedValue({ ...result, ...changed });
  render(<WorkspacePendingSchemaReview {...props} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('The Draft or saved Schema changed');
  expect(screen.queryByText('nodes.aaa.description')).not.toBeInTheDocument();
});

it('offers retry after a read failure', async () => {
  requests.read.mockRejectedValueOnce(new Error('Source unavailable'));
  render(<WorkspacePendingSchemaReview {...props} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Source unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
  expect(await screen.findByText('nodes.aaa.description')).toBeVisible();
});

it('keeps the inspected definition visible when a newer candidate preview arrives', async () => {
  requests.read.mockResolvedValue({ ...result, workspace: { revision: 9 } });
  render(
    <WorkspacePendingSchemaReview
      {...props}
      inspectedSchema={<p>Inspected r8 definition</p>}
    />
  );
  expect(screen.getByText('Inspected r8 definition')).toBeVisible();
  expect(await screen.findByRole('alert')).toHaveTextContent('The Draft or saved Schema changed');
  expect(screen.getByText('Inspected r8 definition')).toBeVisible();
  expect(screen.queryByText(/Saved Schema candidate r2/)).not.toBeInTheDocument();
});

it('hides old data and ignores an old response after the candidate changes', async () => {
  let resolve!: (value: unknown) => void;
  requests.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const { rerender } = render(<WorkspacePendingSchemaReview {...props} />);
  requests.read.mockResolvedValue({
    ...result,
    edit: { ...candidate, revision: 3 },
    preview: {
      ...result.preview,
      workspace: { changes: [{ kind: 'ADD', path: 'nodes.new', summary: 'New revision' }] },
    },
  });
  rerender(<WorkspacePendingSchemaReview {...props} candidate={{ ...candidate, revision: 3 }} />);
  expect(await screen.findByText('nodes.new')).toBeVisible();
  await act(async () => resolve(result));
  expect(screen.queryByText('nodes.aaa.description')).not.toBeInTheDocument();
  expect(screen.getByText('nodes.new')).toBeVisible();
});
