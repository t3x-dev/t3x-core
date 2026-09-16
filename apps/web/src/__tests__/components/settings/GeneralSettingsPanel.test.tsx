// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneralSettingsPanel } from '@/components/settings/GeneralSettingsPanel';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('GeneralSettingsPanel', () => {
  it('renders the organization settings and keeps the screenshot defaults', () => {
    render(<GeneralSettingsPanel />);

    expect(screen.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(screen.getByLabelText('Organization name')).toHaveValue('Orbit Labs');
    expect(screen.getByLabelText('Organization slug')).toHaveValue('orbit-labs');
    expect(screen.getByRole('button', { name: 'Private' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Project creation')).toHaveValue('members');
    expect(screen.getByLabelText('Canonical URL')).toHaveValue('https://t3x.ai/orbit-labs');
  });

  it('updates and saves organization settings through the visible controls', () => {
    render(<GeneralSettingsPanel />);

    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Organization name'), {
      target: { value: 'Orbit Systems' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    expect(save).toBeEnabled();
    fireEvent.click(save);

    expect(
      JSON.parse(window.localStorage.getItem('t3x-settings-organization-general') ?? '{}')
    ).toMatchObject({
      name: 'Orbit Systems',
      visibility: 'public',
    });
    expect(save).toBeDisabled();
  });
});
