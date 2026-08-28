// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeNamespace,
  PersonalNamespaceOnboarding,
  validateNamespace,
} from '@/components/onboarding/PersonalNamespaceOnboarding';

const routerPush = vi.fn();
const createPersonalNamespace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/hooks/namespaces/usePersonalNamespace', () => ({
  usePersonalNamespace: () => ({ create: createPersonalNamespace }),
}));

describe('PersonalNamespaceOnboarding', () => {
  beforeEach(() => {
    routerPush.mockReset();
    createPersonalNamespace.mockReset();
    createPersonalNamespace.mockResolvedValue({ slug: 'lqw905' });
    window.localStorage.clear();
  });

  it('renders a valid suggested namespace', () => {
    render(<PersonalNamespaceOnboarding suggestedNamespace="LQW905" />);

    expect(screen.getByRole('heading', { name: 'Choose your namespace' })).toBeInTheDocument();
    expect(screen.getByLabelText('Personal namespace')).toHaveValue('lqw905');
    expect(screen.getByRole('button', { name: 'Use @lqw905' })).toBeInTheDocument();
    expect(screen.getByText('This namespace looks available.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('rejects reserved and malformed namespaces', () => {
    render(<PersonalNamespaceOnboarding suggestedNamespace="lqw905" />);
    const input = screen.getByLabelText('Personal namespace');

    fireEvent.change(input, { target: { value: 'settings' } });
    expect(screen.getByText('“settings” is reserved by T3X.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    fireEvent.change(input, { target: { value: '-bad--name' } });
    expect(
      screen.getByText('A namespace cannot begin, end, or repeat a hyphen.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('restores the GitHub suggestion after editing', () => {
    render(<PersonalNamespaceOnboarding suggestedNamespace="lqw905" />);
    const input = screen.getByLabelText('Personal namespace');

    fireEvent.change(input, { target: { value: 'another-name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use @lqw905' }));

    expect(input).toHaveValue('lqw905');
  });

  it('persists before continuing to the selected namespace homepage', async () => {
    render(<PersonalNamespaceOnboarding suggestedNamespace="lqw905" />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(createPersonalNamespace).toHaveBeenCalledWith('lqw905');
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/lqw905'));
  });
});

describe('namespace validation', () => {
  it('normalizes provider-style handles', () => {
    expect(normalizeNamespace(' @Example-User ')).toBe('example-user');
  });

  it('accepts a valid namespace and rejects reserved routes', () => {
    expect(validateNamespace('example-user').valid).toBe(true);
    expect(validateNamespace('api').valid).toBe(false);
  });
});
