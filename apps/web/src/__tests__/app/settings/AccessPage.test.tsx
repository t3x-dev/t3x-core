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
      screen.getByText('Configure the shared local API URL and key used by WebUI, CLI, and MCP.')
    ).toBeInTheDocument();
    expect(screen.getByText('Mock Access Settings Panel')).toBeInTheDocument();
  });
});
