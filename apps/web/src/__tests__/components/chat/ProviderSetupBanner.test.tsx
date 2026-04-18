import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProviderSetupBanner } from '@/components/chat/ProviderSetupBanner';

describe('ProviderSetupBanner', () => {
  it('links users to provider settings', () => {
    const html = renderToStaticMarkup(<ProviderSetupBanner />);

    expect(html).toContain('href="/settings/providers"');
    expect(html).toContain('Set up a generation provider');
    expect(html).toContain('Connect a provider in Settings to pick a model and start chatting.');
  });
});
