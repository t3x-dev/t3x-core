// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AccessPage from '@/app/settings/access/page';

vi.mock('@/components/settings/AccessSettingsPanel', () => ({
  AccessSettingsPanel: () => <div>Mock Access Settings Panel</div>,
}));

describe('Access settings page', () => {
  it('renders the access page shell around the shared panel', () => {
    render(<AccessPage />);

    expect(screen.getByRole('heading', { name: 'API Access' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Manage T3X API keys plus the local API URL/key used by WebUI, CLI, and MCP.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Environment variables override the shared file, so this page shows the effective state before you save.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Mock Access Settings Panel')).toBeInTheDocument();
  });
});
