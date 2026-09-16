// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WebhooksPage from '@/app/settings/webhooks/page';

const listWebhooks = vi.fn();
const createWebhook = vi.fn();
const updateWebhook = vi.fn();
const deleteWebhook = vi.fn();
const testWebhook = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('project=proj_test'),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/hooks/webhooks/useWebhookCommands', () => ({
  useWebhookCommands: () => ({
    listWebhooks,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
  }),
}));

describe('WebhooksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listWebhooks.mockResolvedValue([]);
  });

  it('renders the automation page structure and its empty live-data state', async () => {
    render(<WebhooksPage />);

    expect(screen.getByRole('heading', { name: 'Webhooks', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent deliveries' })).toBeInTheDocument();
    expect(screen.getByText('Automations')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('No webhooks configured for this project.')).toBeInTheDocument();
    });
  });

  it('opens the integrated creation drawer with the reference defaults', async () => {
    render(<WebhooksPage />);
    await waitFor(() => expect(listWebhooks).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'New webhook' }));

    expect(screen.getByRole('complementary', { name: 'New webhook' })).toBeInTheDocument();
    expect(screen.getByLabelText('Endpoint URL')).toHaveAttribute(
      'placeholder',
      'https://example.com/webhook'
    );
    expect(screen.getByRole('checkbox', { name: 'Commit Created' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Merge Completed' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Leaf Created' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Create Webhook' })).toBeDisabled();
  });

  it('creates a project-scoped webhook using the real supported event names', async () => {
    createWebhook.mockResolvedValue({
      webhook_id: 'wh_1',
      project_id: 'proj_test',
      url: 'https://example.com/webhook',
      events: ['commit.created', 'merge.completed'],
      secret: null,
      active: true,
      created_at: '2026-09-16T00:00:00.000Z',
      updated_at: '2026-09-16T00:00:00.000Z',
    });

    render(<WebhooksPage />);
    await waitFor(() => expect(listWebhooks).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'New webhook' }));
    fireEvent.change(screen.getByLabelText('Endpoint URL'), {
      target: { value: 'https://example.com/webhook' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Webhook' }));

    await waitFor(() => {
      expect(createWebhook).toHaveBeenCalledWith({
        url: 'https://example.com/webhook',
        events: ['commit.created', 'merge.completed'],
        secret: undefined,
        project_id: 'proj_test',
        active: true,
      });
    });
  });
});
