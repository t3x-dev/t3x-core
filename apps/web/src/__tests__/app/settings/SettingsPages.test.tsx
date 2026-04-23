// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AccessPage from '@/app/settings/access/page';
import PreferencesPage from '@/app/settings/preferences/page';
import ProvidersPage from '@/app/settings/providers/page';

vi.mock('@/components/settings/AccessSettingsPanel', () => ({
  AccessSettingsPanel: () => <div>Mock Access Settings Panel</div>,
}));

vi.mock('@/components/settings/PreferencesSettingsPanel', () => ({
  PreferencesSettingsPanel: () => <div>Mock Preferences Settings Panel</div>,
}));

vi.mock('@/components/settings/ProvidersSettingsPanel', () => ({
  ProvidersSettingsPanel: () => <div>Mock Providers Settings Panel</div>,
}));

describe('settings pages', () => {
  it('renders the access page shell around the shared panel', () => {
    render(<AccessPage />);

    expect(screen.getByRole('heading', { name: 'API Access' })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Configure the standalone API host's local API URL and key. In a one-machine setup, WebUI, CLI, and MCP can share the same file."
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Mock Access Settings Panel')).toBeInTheDocument();
  });

  it('renders the preferences page shell around the shared panel', () => {
    render(<PreferencesPage />);

    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument();
    expect(
      screen.getByText('Customize your T3X experience. Changes are saved automatically.')
    ).toBeInTheDocument();
    expect(screen.getByText('Mock Preferences Settings Panel')).toBeInTheDocument();
  });

  it('renders the providers page shell around the shared panel', () => {
    render(<ProvidersPage />);

    expect(screen.getByRole('heading', { name: 'Providers' })).toBeInTheDocument();
    expect(
      screen.getByText('Configure LLM, embedding, and NLP providers for T3X features.')
    ).toBeInTheDocument();
    expect(screen.getByText('Mock Providers Settings Panel')).toBeInTheDocument();
  });
});
