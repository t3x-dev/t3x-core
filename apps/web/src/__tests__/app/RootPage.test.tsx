// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/infrastructure/core';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  getCurrentPersonalNamespace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('@/infrastructure/namespaces', () => ({
  getCurrentPersonalNamespace: mocks.getCurrentPersonalNamespace,
}));
vi.mock('@/components/project/ProjectDirectoryPage', () => ({
  ProjectDirectoryPage: () => <div>t3x-dev repositories</div>,
}));

import RootPage from '@/app/page';

describe('RootPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.getCurrentPersonalNamespace.mockResolvedValue({ slug: 'test-b3' });
  });

  it('opens t3x-dev directly only when auth is disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');

    render(<RootPage />);

    expect(screen.getByText('t3x-dev repositories')).toBeInTheDocument();
    expect(mocks.getCurrentPersonalNamespace).not.toHaveBeenCalled();
  });

  it('redirects authenticated users to their personal namespace', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'false');

    render(<RootPage />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/test-b3'));
  });

  it('sends authenticated users without a namespace to onboarding', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'false');
    mocks.getCurrentPersonalNamespace.mockResolvedValue(null);

    render(<RootPage />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/onboarding/namespace'));
  });

  it('sends an expired browser session back to login', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'false');
    mocks.getCurrentPersonalNamespace.mockRejectedValue(
      new ApiError('UNAUTHORIZED', 'Authentication required')
    );

    render(<RootPage />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?callbackUrl=%2F'));
  });
});
