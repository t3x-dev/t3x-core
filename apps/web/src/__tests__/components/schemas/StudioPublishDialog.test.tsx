// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { StudioPreview } from '@t3x-dev/api-client';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { StudioPublishDialog } from '@/components/schemas/StudioPublishDialog';

const mocks = vi.hoisted(() => ({ publish: vi.fn(), close: vi.fn() }));
vi.mock('@/hooks/schemas/usePublishStudioSchema', () => ({
  usePublishStudioSchema: () => mocks.publish,
}));
const hash = `sha256:${'a'.repeat(64)}`;
const artifactHash = `sha256:${'b'.repeat(64)}`;
const preview = {
  reviewHash: hash,
  schemaHash: hash,
  report: { valid: true },
  adoption: { allowed: true },
  impact: { canPublish: true },
  workspace: { id: 'w', revision: 3 },
  freshness: { candidateId: 'edit', candidateRevision: 2 },
} as StudioPreview;
const props = {
  projectId: 'p',
  workspaceId: 'w',
  preview,
  candidateIds: ['base'],
  currentReviewHash: hash,
  onOpenChange: mocks.close,
};
const receipt = {
  source: {
    projectId: 'p',
    canonicalName: 'projects/p/custom',
    version: '1.0.0',
    artifactVersionId: 'release-v1',
    hash: artifactHash,
  },
  schemaHash: hash,
  kind: 'schema',
  visibility: 'private',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.publish.mockResolvedValue(receipt);
});

it('publishes only on explicit submit, pins the checked revision and opens the exact Browse release', async () => {
  render(<StudioPublishDialog {...props} />);
  expect(mocks.publish).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Canonical name'), {
    target: { value: receipt.source.canonicalName },
  });
  const button = screen.getByRole('button', { name: 'Publish private version' });
  fireEvent.submit(button.closest('form')!);
  fireEvent.submit(button.closest('form')!);
  await waitFor(() =>
    expect(screen.getByRole('link', { name: 'Open exact release in Browse' })).toBeInTheDocument()
  );
  expect(mocks.publish).toHaveBeenCalledTimes(1);
  expect(mocks.publish).toHaveBeenCalledWith({
    candidateIds: ['base'],
    schemaEditCandidate: { candidateId: 'edit', revision: 2 },
    ifRevision: 3,
    reviewHash: hash,
    canonicalName: receipt.source.canonicalName,
    version: '1.0.0',
    title: 'My Schema',
    description: '',
    releaseNotes: '',
    tags: [],
  });
  const url = new URL(screen.getByRole('link').getAttribute('href')!, 'http://localhost');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    tab: 'browse',
    schemaView: 'release',
    catalogName: receipt.source.canonicalName,
    catalogVersion: '1.0.0',
    catalogHash: artifactHash,
  });
});
it('disables stale or blocked previews without attempting a write', () => {
  const { rerender } = render(<StudioPublishDialog {...props} currentReviewHash={undefined} />);
  expect(screen.getByRole('button', { name: 'Publish private version' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('stale');
  rerender(
    <StudioPublishDialog
      {...props}
      preview={{ ...preview, impact: { ...preview.impact!, canPublish: false } }}
    />
  );
  fireEvent.submit(
    screen.getByRole('button', { name: 'Publish private version' }).closest('form')!
  );
  expect(mocks.publish).not.toHaveBeenCalled();
});
it('keeps metadata after conflicts and retries only when the user asks', async () => {
  mocks.publish.mockRejectedValueOnce(new Error('Immutable version conflict'));
  render(<StudioPublishDialog {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Publish private version' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Immutable version conflict')
  );
  expect(screen.getByLabelText('Version')).toHaveValue('1.0.0');
  expect(mocks.publish).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Version'), { target: { value: '1.1.0' } });
  mocks.publish.mockResolvedValue({ ...receipt, source: { ...receipt.source, version: '1.1.0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish private version' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('@1.1.0'));
});
it('validates metadata and ignores a response after the dialog is unmounted', async () => {
  let finish!: (value: unknown) => void;
  mocks.publish.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { unmount } = render(<StudioPublishDialog {...props} />);
  fireEvent.change(screen.getByLabelText('Version'), { target: { value: 'not-semver' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish private version' }));
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(mocks.publish).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Version'), { target: { value: '1.0.0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish private version' }));
  expect(screen.getByRole('button', { name: 'Publishing…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  unmount();
  await act(async () => finish(receipt));
  expect(mocks.close).not.toHaveBeenCalled();
});
