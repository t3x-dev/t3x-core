// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  normalizeNamespace,
  PersonalNamespaceOnboarding,
  validateNamespace,
} from '@/components/onboarding/PersonalNamespaceOnboarding';

describe('PersonalNamespaceOnboarding', () => {
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
