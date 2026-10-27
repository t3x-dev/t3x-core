// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SettingsReturnLink } from '@/components/settings/SettingsReturnLink';

const mocks = vi.hoisted(() => ({ value: '', refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ returnTo: mocks.value }),
}));
vi.mock('@/components/deployment/DeploymentCapabilitiesProvider', () => ({
  useDeploymentCapabilities: () => ({ refresh: mocks.refresh }),
}));
beforeEach(() => vi.clearAllMocks());
it.each([
  'https://outside.example',
  '//outside.example',
  '/\\outside.example',
])('rejects external return target %s', (target) => {
  mocks.value = target;
  render(<SettingsReturnLink />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it('returns to the original workspace and refreshes availability without invoking generation', () => {
  mocks.value = '/team/repo/workspaces?workspace=workspace_branch%3Amain&conversation=c';
  const refresh = vi.fn();
  window.addEventListener('t3x:provider-configuration-changed', refresh);
  render(<SettingsReturnLink />);
  const link = screen.getByRole('link', { name: 'Return to Workspace' });
  expect(link).toHaveAttribute('href', mocks.value);
  fireEvent.click(link);
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledOnce();
  window.removeEventListener('t3x:provider-configuration-changed', refresh);
});
