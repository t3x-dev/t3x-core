// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { OutputTargetsTab } from '@/components/workspaces/OutputTargetsTab';
import type { WorkspaceCandidate } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  prepare: vi.fn(),
  deploy: vi.fn(),
  rollback: vi.fn(),
}));
vi.mock('@/infrastructure/workspaceDelivery', () => ({
  getWorkspaceDeliveries: mocks.get,
  prepareWorkspaceDelivery: mocks.prepare,
  deployWorkspaceArtifact: mocks.deploy,
  rollbackWorkspaceArtifact: mocks.rollback,
}));
const digest = `sha256:${'a'.repeat(64)}`;
const candidate = { id: 'ws', projectId: 'project', revision: 1 } as WorkspaceCandidate;
const listing = {
  workspaceRevision: 1,
  commitDigest: digest,
  receipts: [],
  deployments: [],
  currentDeployment: null,
  targets: [
    {
      id: 't3x:committed-state',
      title: 'Committed State',
      mode: 'download',
      format: 'yaml',
      configurable: true,
      reason: null,
    },
    {
      id: 't3x:portable-artifact',
      title: 'Portable artifact',
      mode: 'download',
      format: 'bundle',
      configurable: false,
      reason: null,
    },
    {
      id: 'legacy',
      title: 'Review brief',
      mode: 'legacy',
      format: 'markdown',
      configurable: false,
      reason: 'Generation is unavailable.',
    },
  ],
};
const receipt = {
  id: 'receipt',
  projectId: 'project',
  workspaceId: 'ws',
  commitDigest: digest,
  targetId: 't3x:committed-state',
  format: 'yaml',
  adapter: 't3x.download/v1',
  artifactDigest: digest,
  idempotencyKey: 'receipt-key',
  attempt: 1,
  status: 'prepared',
};
const deployment = {
  id: 'deployment',
  projectId: 'project',
  workspaceId: 'ws',
  environment: 'preview',
  deliveryId: 'receipt',
  actualArtifactDigest: digest,
  desiredArtifactDigest: digest,
  artifactDigest: digest,
  previousArtifactDigest: null,
  adapter: 't3x.fixed-slot/v1',
  kind: 'deploy',
  idempotencyKey: 'deployment-key',
};
beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue(listing);
  mocks.prepare.mockReset().mockResolvedValue(receipt);
  mocks.deploy.mockReset().mockResolvedValue(deployment);
  mocks.rollback.mockReset().mockResolvedValue({ ...deployment, kind: 'rollback' });
});
it('loads without executing; legacy selection cannot generate a Leaf', async () => {
  render(<OutputTargetsTab candidate={candidate} />);
  fireEvent.click(await screen.findByRole('button', { name: /Review brief/ }));
  expect(screen.getByText(/Generation is unavailable/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Download State' })).not.toBeInTheDocument();
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(screen.queryByText('Create Leaf')).not.toBeInTheDocument();
});
it('downloads the explicit exact commit and shows honest receipt status', async () => {
  render(<OutputTargetsTab candidate={candidate} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Download State' }));
  await screen.findByText('File prepared');
  expect(mocks.prepare).toHaveBeenCalledWith(
    'project',
    'ws',
    expect.objectContaining({
      commitDigest: digest,
      targetId: 't3x:committed-state',
      workspaceRevision: 1,
      format: 'yaml',
    })
  );
  expect(screen.getByText(/Browser save completion is not observable/)).toBeVisible();
});
it('prepares the fixed portable bundle without a format choice', async () => {
  mocks.prepare.mockResolvedValueOnce({
    ...receipt,
    targetId: 't3x:portable-artifact',
    adapter: 't3x.portable/v1',
    format: 'bundle',
  });
  render(<OutputTargetsTab candidate={candidate} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Portable artifact' }));
  expect(screen.queryByLabelText('Delivery format')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Download artifact' }));
  await waitFor(() =>
    expect(mocks.prepare).toHaveBeenCalledWith(
      'project',
      'ws',
      expect.objectContaining({
        commitDigest: digest,
        targetId: 't3x:portable-artifact',
        workspaceRevision: 1,
        format: 'bundle',
      })
    )
  );
});
it('deploys a prepared portable artifact by receipt, not by branch', async () => {
  mocks.get.mockResolvedValueOnce({
    ...listing,
    receipts: [
      {
        ...receipt,
        targetId: 't3x:portable-artifact',
        adapter: 't3x.portable/v1',
        format: 'bundle',
      },
    ],
  });
  render(<OutputTargetsTab candidate={candidate} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Deploy' }));
  await waitFor(() =>
    expect(mocks.deploy).toHaveBeenCalledWith(
      'project',
      'ws',
      expect.objectContaining({ deliveryId: 'receipt', environment: 'preview' })
    )
  );
  expect(await screen.findByText(/Current:/)).toHaveTextContent(digest);
});
it('reuses idempotency after unknown transport outcome and prevents duplicate clicks', async () => {
  mocks.prepare.mockRejectedValueOnce(new Error('Network interrupted'));
  render(<OutputTargetsTab candidate={candidate} />);
  const button = await screen.findByRole('button', { name: 'Download State' });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByRole('alert');
  expect(mocks.prepare).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Download State' }));
  await screen.findByText('File prepared');
  expect(mocks.prepare.mock.calls[0][2].idempotencyKey).toBe(
    mocks.prepare.mock.calls[1][2].idempotencyKey
  );
});
it('refresh recovers a failed target load', async () => {
  mocks.get.mockRejectedValueOnce(new Error('Offline'));
  render(<OutputTargetsTab candidate={candidate} />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download State' })).toBeEnabled());
});
