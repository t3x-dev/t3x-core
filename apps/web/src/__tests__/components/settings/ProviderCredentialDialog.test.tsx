// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderCredentialDialog } from '@/components/settings/ProviderCredentialDialog';
import { toLocalProviderId } from '@/infrastructure/misc';

describe('ProviderCredentialDialog', () => {
  const onDelete = vi.fn();
  const onOpenChange = vi.fn();
  const onSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits api key and preferred model without echoing the raw key back into the page', async () => {
    onSave.mockResolvedValue(undefined);

    render(
      <ProviderCredentialDialog
        availableModels={['gpt-4o', 'gpt-4o-mini']}
        error={null}
        onDelete={onDelete}
        onOpenChange={onOpenChange}
        onSave={onSave}
        open
        providerId="openai"
        providerName="OpenAI"
        status={{
          configured: false,
          defaultModel: null,
          lastTestError: null,
          lastTestStatus: null,
        }}
        statusLoading={false}
      />
    );

    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'sk-local-openai' },
    });
    fireEvent.change(screen.getByLabelText('Preferred model (optional)'), {
      target: { value: 'gpt-4o-mini' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save provider' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        api_key: 'sk-local-openai',
        default_model: 'gpt-4o-mini',
      });
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    expect(screen.queryByDisplayValue('sk-local-openai')).toBeNull();
    expect(document.body.textContent).not.toContain('sk-local-openai');
  });

  it('normalizes local provider aliases to the local provider family ids', () => {
    expect(toLocalProviderId('claude')).toBe('anthropic');
    expect(toLocalProviderId('gpt')).toBe('openai');
    expect(toLocalProviderId('gemini')).toBe('google');
    expect(toLocalProviderId('google-ai')).toBe('google');
  });
});
