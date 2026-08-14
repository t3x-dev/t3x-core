import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';

const testApiKey = (suffix: string) => `t3xk_${suffix}`;

describe('Local Config Routes', () => {
  const originalConfigPath = process.env.T3X_CONFIG_PATH;
  const originalApiUrl = process.env.T3X_API_URL;
  const originalApiKey = process.env.T3X_API_KEY;
  const originalAuthDisabled = process.env.AUTH_DISABLED;

  let tempDir: string;
  let configPath: string;

  function createLocalConfigApp() {
    return createApp({ enableLocalConfigRoutes: true, skipBuiltinAuth: true });
  }

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 't3x-local-config-'));
    configPath = path.join(tempDir, 'config.json');
    process.env.T3X_CONFIG_PATH = configPath;
    delete process.env.T3X_API_URL;
    delete process.env.T3X_API_KEY;
    process.env.AUTH_DISABLED = 'true';
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    if (originalConfigPath === undefined) delete process.env.T3X_CONFIG_PATH;
    else process.env.T3X_CONFIG_PATH = originalConfigPath;

    if (originalApiUrl === undefined) delete process.env.T3X_API_URL;
    else process.env.T3X_API_URL = originalApiUrl;

    if (originalApiKey === undefined) delete process.env.T3X_API_KEY;
    else process.env.T3X_API_KEY = originalApiKey;

    if (originalAuthDisabled === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = originalAuthDisabled;

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns default local config state when no env or file config exists', async () => {
    const { app } = createLocalConfigApp();
    const res = await app.request('/api/v1/local-config');

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        api_url: string;
        api_url_source: string;
        api_key_present: boolean;
        api_key_source: string;
        api_key_preview: string | null;
        config_path: string;
      };
    };

    expect(json.success).toBe(true);
    expect(json.data.api_url).toBe('http://localhost:8000/api');
    expect(json.data.api_url_source).toBe('default');
    expect(json.data.api_key_present).toBe(false);
    expect(json.data.api_key_source).toBe('none');
    expect(json.data.api_key_preview).toBeNull();
    expect(json.data.config_path).toBe(configPath);
  });

  it('writes api url and api key to the shared config file', async () => {
    const { app } = createLocalConfigApp();
    const res = await app.request('/api/v1/local-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_url: 'http://127.0.0.1:8100/api',
        api_key: 't3xk_local_test_key',
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        api_url: string;
        api_url_source: string;
        api_key_present: boolean;
        api_key_source: string;
        api_key_preview: string | null;
      };
    };

    expect(json.success).toBe(true);
    expect(json.data.api_url).toBe('http://127.0.0.1:8100/api');
    expect(json.data.api_url_source).toBe('file');
    expect(json.data.api_key_present).toBe(true);
    expect(json.data.api_key_source).toBe('file');
    expect(json.data.api_key_preview).toBe('t3xk_loc...');

    const raw = JSON.parse(readFileSync(configPath, 'utf8')) as {
      api_url: string;
      api_key: string;
      api_key_origin: string;
    };
    expect(raw).toEqual({
      api_url: 'http://127.0.0.1:8100/api',
      api_key: 't3xk_local_test_key',
      api_key_origin: 'http://127.0.0.1:8100',
    });
  });

  it('reports env values as the effective source over file config', async () => {
    const { app } = createLocalConfigApp();
    await app.request('/api/v1/local-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_url: 'http://127.0.0.1:8100/api',
        api_key: 't3xk_file_key',
      }),
    });

    process.env.T3X_API_URL = 'http://env.example/api';
    process.env.T3X_API_KEY = 't3xk_env_override_key';

    const res = await app.request('/api/v1/local-config');
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      success: boolean;
      data: {
        api_url: string;
        api_url_source: string;
        api_key_present: boolean;
        api_key_source: string;
        api_key_preview: string | null;
      };
    };

    expect(json.success).toBe(true);
    expect(json.data.api_url).toBe('http://env.example/api');
    expect(json.data.api_url_source).toBe('env');
    expect(json.data.api_key_present).toBe(true);
    expect(json.data.api_key_source).toBe('env');
    expect(json.data.api_key_preview).toBe('t3xk_env...');
  });

  it('is reachable when builtin auth is explicitly skipped', async () => {
    const { app } = createLocalConfigApp();
    const res = await app.request('/api/v1/local-config');

    expect(res.status).toBe(200);
  });

  it('requires authentication when builtin auth is enabled', async () => {
    delete process.env.AUTH_DISABLED;
    const { app } = createApp({ enableLocalConfigRoutes: true });
    const res = await app.request('/api/v1/local-config');

    expect(res.status).toBe(401);
  });

  it('reports open-access deployments without requiring a key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { app } = createLocalConfigApp();
    const res = await app.request('/api/v1/local-config/check', { method: 'POST' });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        ok: boolean;
        code: string;
        auth_mode: string;
        message: string;
      };
    };

    expect(json.success).toBe(true);
    expect(json.data.ok).toBe(true);
    expect(json.data.code).toBe('AUTH_NOT_REQUIRED');
    expect(json.data.auth_mode).toBe('open');
    expect(json.data.message).toContain('does not currently require a key');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/status',
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it('blocks private and metadata targets before making a request', async () => {
    const { app } = createLocalConfigApp();
    await app.request('/api/v1/local-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_url: 'http://169.254.169.254/latest/meta-data' }),
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request('/api/v1/local-config/check', { method: 'POST' });
    const json = (await res.json()) as { data: { code: string; status_code: number | null } };

    expect(json.data).toMatchObject({ code: 'UNSAFE_API_URL', status_code: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not allow loopback probing on a port other than the current API port', async () => {
    const { app } = createLocalConfigApp();
    await app.request('/api/v1/local-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_url: 'http://127.0.0.1:5432' }),
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request('/api/v1/local-config/check', { method: 'POST' });
    const json = (await res.json()) as { data: { code: string } };

    expect(json.data.code).toBe('UNSAFE_API_URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a missing key when the target api requires auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const { app } = createLocalConfigApp();
    const res = await app.request('/api/v1/local-config/check', { method: 'POST' });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        ok: boolean;
        code: string;
        auth_mode: string;
      };
    };

    expect(json.success).toBe(true);
    expect(json.data.ok).toBe(false);
    expect(json.data.code).toBe('MISSING_API_KEY');
    expect(json.data.auth_mode).toBe('protected');
  });

  it('reports an invalid key when auth is required and the bearer check is rejected', async () => {
    process.env.T3X_API_KEY = testApiKey('invalid_key');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const { app } = createLocalConfigApp();
    const res = await app.request('/api/v1/local-config/check', { method: 'POST' });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        ok: boolean;
        code: string;
        auth_mode: string;
      };
    };

    expect(json.success).toBe(true);
    expect(json.data.ok).toBe(false);
    expect(json.data.code).toBe('INVALID_API_KEY');
    expect(json.data.auth_mode).toBe('protected');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('never sends an environment key to a file-configured attacker origin', async () => {
    process.env.T3X_API_KEY = testApiKey('server_secret_sentinel');
    const { app } = createLocalConfigApp();
    await app.request('/api/v1/local-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_url: 'https://93.184.216.34/api' }),
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request('/api/v1/local-config/check', { method: 'POST' });
    const json = (await res.json()) as {
      data: { code: string; ok: boolean };
    };

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ ok: false, code: 'CREDENTIAL_ORIGIN_MISMATCH' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has('Authorization')).toBe(false);
  });

  it('does not move a stored key when only the file-configured API origin changes', async () => {
    const { app } = createLocalConfigApp();
    await app.request('/api/v1/local-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_url: 'https://93.184.216.34/api',
        api_key: testApiKey('stored_secret_sentinel'),
      }),
    });
    await app.request('/api/v1/local-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_url: 'https://1.1.1.1/api' }),
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request('/api/v1/local-config/check', { method: 'POST' });
    const json = (await res.json()) as { data: { code: string } };

    expect(json.data.code).toBe('CREDENTIAL_ORIGIN_MISMATCH');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has('Authorization')).toBe(false);
  });

  it('sends a stored key only to the origin it was saved for', async () => {
    const { app } = createLocalConfigApp();
    await app.request('/api/v1/local-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_url: 'https://93.184.216.34/api',
        api_key: testApiKey('stored_key'),
      }),
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request('/api/v1/local-config/check', { method: 'POST' });
    const json = (await res.json()) as { data: { code: string } };

    expect(json.data.code).toBe('ACCESS_OK');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe(
      `Bearer ${testApiKey('stored_key')}`
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('is not mounted by default on generic createApp consumers', async () => {
    const { app } = createApp({ skipBuiltinAuth: true });
    const res = await app.request('/api/v1/local-config');

    expect(res.status).toBe(404);
  });
});
