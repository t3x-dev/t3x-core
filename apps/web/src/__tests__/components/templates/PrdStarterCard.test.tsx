// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrdStarterCard } from '@/components/templates/PrdStarterCard';

const { push, create, context } = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  context: {
    isLoading: false,
    error: null,
    activeAccount: {
      namespace: { slug: 'our-team', display_name: 'Our team' },
      authorized_actions: ['project:create'],
    },
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/hooks/accounts/useNamespaceAccounts', () => ({ useNamespaceAccounts: () => context }));
vi.mock('@/hooks/projects/useCreatePrdStarter', () => ({ useCreatePrdStarter: () => create }));

describe('PRD starter gallery entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'false');
    context.isLoading = false;
    context.activeAccount.authorized_actions = ['project:create'];
    create.mockResolvedValue({ project_id: 'proj_created' });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('names the private destination and opens the canonical State reader', async () => {
    render(<PrdStarterCard />);
    expect(screen.getByText(/Private · Our team · No AI credits used/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: ' Team brief ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start a private PRD' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/project/proj_created?tab=state'));
    expect(create).toHaveBeenCalledExactlyOnceWith('Team brief', 'our-team');
  });

  it('disables submission while authority loads or creation is not permitted', () => {
    context.isLoading = true;
    const { rerender } = render(<PrdStarterCard />);
    expect(screen.getByRole('button')).toBeDisabled();
    context.isLoading = false;
    context.activeAccount.authorized_actions = [];
    rerender(<PrdStarterCard />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(create).not.toHaveBeenCalled();
  });

  it('prevents duplicate submits and displays capacity errors without navigating', async () => {
    let reject!: (error: Error) => void;
    create.mockReturnValueOnce(
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise;
      })
    );
    render(<PrdStarterCard />);
    const form = screen.getByLabelText('Project name').closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(create).toHaveBeenCalledTimes(1);
    reject(new Error('Private project capacity reached'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Private project capacity reached');
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('retains local OSS creation without a hosted account', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');
    context.activeAccount.authorized_actions = [];
    render(<PrdStarterCard />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(create).toHaveBeenCalledExactlyOnceWith('My product brief', undefined)
    );
  });
});
