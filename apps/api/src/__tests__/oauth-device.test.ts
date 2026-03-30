import type { AnyDB } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { oauthDeviceRoutes } from '../routes/oauth-device.openapi';

describe('OAuth Device Flow', () => {
  let cleanup: () => Promise<void>;
  const app = new Hono();
  app.route('/', oauthDeviceRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('POST /v1/oauth/device/code returns device_code and user_code', async () => {
    const res = await app.request('/v1/oauth/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'mcp' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.device_code).toBeTruthy();
    expect(body.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(body.verification_uri).toBeTruthy();
    expect(body.expires_in).toBe(900);
    expect(body.interval).toBe(5);
  });

  it('POST /v1/oauth/device/token returns authorization_pending before approval', async () => {
    const codeRes = await app.request('/v1/oauth/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'mcp' }),
    });
    const { device_code } = await codeRes.json();

    const tokenRes = await app.request('/v1/oauth/device/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    expect(tokenRes.status).toBe(400);
    const body = await tokenRes.json();
    expect(body.error).toBe('authorization_pending');
  });

  it('POST /v1/oauth/device/token returns access_token after approval', async () => {
    const codeRes = await app.request('/v1/oauth/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'mcp' }),
    });
    const { device_code, user_code } = await codeRes.json();

    // Simulate user authorization directly via storage
    const {
      findDeviceCodeByUserCode,
      authorizeDeviceCode,
      createLocalUser,
    } = await import('@t3x-dev/storage');
    const user = await createLocalUser(mockDB, {
      username: `test_${Date.now()}`,
      passwordHash: 'unused',
    });
    const dc = await findDeviceCodeByUserCode(mockDB, user_code);
    expect(dc).toBeTruthy();
    await authorizeDeviceCode(mockDB, dc!.id, user.id);

    // Now poll should succeed
    const tokenRes = await app.request('/v1/oauth/device/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    expect(tokenRes.status).toBe(200);
    const body = await tokenRes.json();
    expect(body.access_token).toBeTruthy();
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBeGreaterThan(0);
  });

  it('returns expired_token for expired device code', async () => {
    const { insertDeviceCode } = await import('@t3x-dev/storage');
    // Insert already-expired code
    const row = await insertDeviceCode(mockDB, { clientId: 'mcp', expiresInSeconds: -1 });

    const tokenRes = await app.request('/v1/oauth/device/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_code: row.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    expect(tokenRes.status).toBe(400);
    const body = await tokenRes.json();
    expect(body.error).toBe('expired_token');
  });
});
