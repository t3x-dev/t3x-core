// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { StateExportButton } from '@/components/shared/StateExportButton';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), download: vi.fn() }));
vi.mock('@/infrastructure/stateExport', () => ({
  fetchStateExport: mocks.fetch,
  downloadStateExport: mocks.download,
}));
const digest = `sha256:${'a'.repeat(64)}`;
beforeEach(() => vi.clearAllMocks());

it('downloads the displayed exact revision without creating an output', async () => {
  const artifact = { content: 'service: app' };
  mocks.fetch.mockResolvedValue(artifact);
  render(<StateExportButton projectId="project" commitDigest={digest} />);
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  expect(screen.getByText(digest)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'JSON' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download' }));
  await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(artifact));
  expect(mocks.fetch).toHaveBeenCalledWith('project', digest, 'json');
  expect(screen.getByText('Download started.')).toBeInTheDocument();
});

it('shows download failures and permits retry', async () => {
  mocks.fetch.mockRejectedValue(new Error('Export integrity check failed'));
  render(<StateExportButton projectId="project" commitDigest={digest} />);
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Export integrity check failed');
  expect(mocks.download).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
});

it('suppresses repeated requests while a download is being prepared', async () => {
  mocks.fetch.mockReturnValue(new Promise(() => {}));
  render(<StateExportButton projectId="project" commitDigest={digest} />);
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download' }));
  expect(screen.getByRole('button', { name: 'Preparing…' })).toBeDisabled();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
