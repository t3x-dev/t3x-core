import { describe, expect, it, vi } from 'vitest';

async function loadApiBaseModule() {
  vi.resetModules();
  return import('@/utils/apiBase');
}

describe('utils/apiBase', () => {
  it('keeps browser WebSockets same-origin even when an API URL is configured', async () => {
    const module = await loadApiBaseModule();

    expect(
      module.resolveWebSocketBase('https://api.example.com', {
        protocol: 'https:',
        host: 'app.example.com',
      })
    ).toBe('wss://app.example.com');
  });

  it('uses browser origin for websocket base when API base is same-origin', async () => {
    const module = await loadApiBaseModule();

    expect(module.resolveWebSocketBase('', { protocol: 'https:', host: 'app.example.com' })).toBe(
      'wss://app.example.com'
    );
  });

  it('defaults server rendering to the local Web origin', async () => {
    const module = await loadApiBaseModule();
    expect(module.resolveWebSocketBase('')).toBe('ws://localhost:3000');
  });
});
