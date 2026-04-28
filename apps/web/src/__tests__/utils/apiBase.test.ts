import { afterEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

async function loadApiBaseModule() {
  vi.resetModules();
  return import('@/utils/apiBase');
}

describe('utils/apiBase', () => {
  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }
  });

  it('defaults to the local API in development when NEXT_PUBLIC_API_URL is unset', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_API_URL;

    const module = await loadApiBaseModule();

    expect(module.API_BASE).toBe('http://localhost:8000');
    expect(module.resolveApiBase(process.env, process.env.NODE_ENV)).toBe('http://localhost:8000');
  });

  it('defaults to the local API when NODE_ENV is unset', async () => {
    delete process.env.NODE_ENV;
    delete process.env.NEXT_PUBLIC_API_URL;

    const module = await loadApiBaseModule();

    expect(module.API_BASE).toBe('http://localhost:8000');
    expect(module.resolveApiBase(process.env, process.env.NODE_ENV)).toBe('http://localhost:8000');
  });

  it('prefers an explicit NEXT_PUBLIC_API_URL when provided', async () => {
    process.env.NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';

    const module = await loadApiBaseModule();

    expect(module.API_BASE).toBe('https://api.example.com');
  });

  it('stays same-origin in production when NEXT_PUBLIC_API_URL is unset', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_API_URL;

    const module = await loadApiBaseModule();

    expect(module.API_BASE).toBe('');
  });

  it('derives a websocket base from the API base', async () => {
    const module = await loadApiBaseModule();

    expect(module.resolveWebSocketBase('http://localhost:8000')).toBe('ws://localhost:8000');
    expect(module.resolveWebSocketBase('https://api.example.com')).toBe('wss://api.example.com');
  });

  it('uses browser origin for websocket base when API base is same-origin', async () => {
    const module = await loadApiBaseModule();

    expect(module.resolveWebSocketBase('', { protocol: 'https:', host: 'app.example.com' })).toBe(
      'wss://app.example.com'
    );
  });
});
