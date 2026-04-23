import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';

describe('Local Config Routes', () => {
  const originalConfigPath = process.env.T3X_CONFIG_PATH;
  const originalApiUrl = process.env.T3X_API_URL;
  const originalApiKey = process.env.T3X_API_KEY;

  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 't3x-local-config-'));
    configPath = path.join(tempDir, 'config.json');
    process.env.T3X_CONFIG_PATH = configPath;
    delete process.env.T3X_API_URL;
    delete process.env.T3X_API_KEY;
  });

  afterEach(() => {
    if (originalConfigPath === undefined) delete process.env.T3X_CONFIG_PATH;
    else process.env.T3X_CONFIG_PATH = originalConfigPath;

    if (originalApiUrl === undefined) delete process.env.T3X_API_URL;
    else process.env.T3X_API_URL = originalApiUrl;

    if (originalApiKey === undefined) delete process.env.T3X_API_KEY;
    else process.env.T3X_API_KEY = originalApiKey;

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns default local config state when no env or file config exists', async () => {
    const { app } = createApp({ enableLocalConfigRoutes: true });
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
    const { app } = createApp({ enableLocalConfigRoutes: true });
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
    };
    expect(raw).toEqual({
      api_url: 'http://127.0.0.1:8100/api',
      api_key: 't3xk_local_test_key',
    });
  });

  it('reports env values as the effective source over file config', async () => {
    const { app } = createApp({ enableLocalConfigRoutes: true });
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

  it('is reachable without an Authorization header', async () => {
    const { app } = createApp({ enableLocalConfigRoutes: true });
    const res = await app.request('/api/v1/local-config');

    expect(res.status).toBe(200);
  });

  it('is not mounted by default on generic createApp consumers', async () => {
    const { app } = createApp();
    const res = await app.request('/api/v1/local-config');

    expect(res.status).toBe(404);
  });
});
