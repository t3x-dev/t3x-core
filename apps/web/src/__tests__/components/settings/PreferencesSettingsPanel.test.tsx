// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setTheme = vi.fn();

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

import { PreferencesSettingsPanel } from '@/components/settings/PreferencesSettingsPanel';
import { useSettingsStore } from '@/store/settingsStore';

describe('PreferencesSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useSettingsStore.setState({
        density: 'comfortable',
        accentColor: 'blue',
        reducedMotion: false,
      });
    });
  });

  it('renders the four appearance setting groups', () => {
    render(<PreferencesSettingsPanel />);
    expect(screen.getByRole('heading', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Density' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Accent color' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reduced motion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves theme, density, accent color, and reduced motion together', () => {
    render(<PreferencesSettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));
    fireEvent.click(screen.getByRole('button', { name: 'Purple' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Reduced motion' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(useSettingsStore.getState()).toMatchObject({
      density: 'compact',
      accentColor: 'purple',
      reducedMotion: true,
    });
  });
});
