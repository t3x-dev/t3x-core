// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { InferenceAvailabilityNotice } from '@/components/generation/InferenceAvailabilityNotice';

const mocks = vi.hoisted(() => ({
  operator: false,
  mode: 'local',
  status: 'ready',
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/team/repo/workspaces',
  useSearchParams: () => new URLSearchParams('workspace=w'),
}));
vi.mock('@/components/deployment/DeploymentCapabilitiesProvider', () => ({
  useDeploymentCapabilities: () => ({
    capabilities: { inference: { mode: mocks.mode } },
    status: mocks.status,
    administrationStatus: mocks.status,
    canAdministerProviderCredentials: mocks.operator,
    refresh: mocks.refresh,
  }),
}));
beforeEach(() => {
  mocks.operator = false;
  mocks.mode = 'local';
  mocks.status = 'ready';
});
const props = { loading: false, ready: false, error: null, onRetry: vi.fn() };
it('directs ordinary users to an administrator and keeps material functionality explained', () => {
  render(<InferenceAvailabilityNotice {...props} />);
  expect(screen.getByRole('status')).toHaveTextContent('Contact your deployment administrator');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it('gives operators a global settings link with the original location', () => {
  mocks.operator = true;
  render(<InferenceAvailabilityNotice {...props} />);
  expect(screen.getByRole('link')).toHaveAttribute(
    'href',
    '/settings/provider-credentials?returnTo=%2Fteam%2Frepo%2Fworkspaces%3Fworkspace%3Dw'
  );
});
it('does not ask managed inference users for local keys', () => {
  mocks.mode = 'managed';
  render(<InferenceAvailabilityNotice {...props} />);
  expect(screen.getByRole('status')).toHaveTextContent('Managed AI');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it('shows a retryable discovery error instead of asserting missing credentials', () => {
  render(<InferenceAvailabilityNotice {...props} error="api_unavailable" />);
  expect(screen.getByRole('alert')).toHaveTextContent('could not be checked');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(props.onRetry).toHaveBeenCalled();
});
