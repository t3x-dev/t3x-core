/**
 * OAuth Device Flow Routes
 *
 * Implements RFC 8628 (OAuth 2.0 Device Authorization Grant) for MCP clients.
 *
 * Endpoints:
 * - POST /v1/oauth/device/code  — Request device + user codes
 * - POST /v1/oauth/device/token — Poll for access token
 */

import { randomBytes } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import {
  authorizeDeviceCode,
  createApiKey,
  findDeviceCodeByDeviceCode,
  findDeviceCodeByUserCode,
  insertDeviceCode,
  markDeviceCodeUsed,
} from '@t3x-dev/storage';
import { z } from 'zod';
import { getDB } from '../lib/db';
import { zodErrorHook } from '../lib/errors';

export const oauthDeviceRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

const DEVICE_CODE_EXPIRES_IN = 900; // 15 minutes
const POLL_INTERVAL = 5; // seconds
const API_KEY_PREFIX = 't3xk_';

function getVerificationUri(): string {
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL || process.env.WEB_URL || 'http://localhost:3000';
  return `${webUrl}/device`;
}

function generateApiKeyValue(): string {
  return API_KEY_PREFIX + randomBytes(24).toString('base64url');
}

// ── POST /v1/oauth/device/code ──

const DeviceCodeRequestSchema = z.object({
  client_id: z.string().min(1),
});

oauthDeviceRoutes.post('/v1/oauth/device/code', async (c) => {
  const body = await c.req.json();
  const parsed = DeviceCodeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_request', error_description: 'client_id is required' }, 400);
  }

  const db = await getDB();
  const row = await insertDeviceCode(db, {
    clientId: parsed.data.client_id,
    expiresInSeconds: DEVICE_CODE_EXPIRES_IN,
  });

  return c.json({
    device_code: row.deviceCode,
    user_code: row.userCode,
    verification_uri: getVerificationUri(),
    expires_in: DEVICE_CODE_EXPIRES_IN,
    interval: POLL_INTERVAL,
  });
});

// ── POST /v1/oauth/device/token ──

const DeviceTokenRequestSchema = z.object({
  device_code: z.string().min(1),
  grant_type: z.literal('urn:ietf:params:oauth:grant-type:device_code'),
});

oauthDeviceRoutes.post('/v1/oauth/device/token', async (c) => {
  const body = await c.req.json();
  const parsed = DeviceTokenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_request', error_description: 'Invalid parameters' }, 400);
  }

  const db = await getDB();
  const dc = await findDeviceCodeByDeviceCode(db, parsed.data.device_code);

  if (!dc) {
    return c.json({ error: 'invalid_grant', error_description: 'Unknown device code' }, 400);
  }

  // Check expiration
  if (new Date() > dc.expiresAt) {
    return c.json({ error: 'expired_token', error_description: 'Device code has expired' }, 400);
  }

  // Check if already used
  if (dc.status === 'used') {
    return c.json({ error: 'invalid_grant', error_description: 'Device code already used' }, 400);
  }

  // Still pending user authorization
  if (dc.status === 'pending') {
    return c.json({ error: 'authorization_pending' }, 400);
  }

  // Authorized — issue API key as access token
  if (dc.status === 'authorized' && dc.userId) {
    const keyValue = generateApiKeyValue();
    const apiKey = await createApiKey(db, {
      name: `mcp:device:${dc.userCode}`,
      keyValue,
      userId: dc.userId,
    });

    await markDeviceCodeUsed(db, dc.id, apiKey.id);

    return c.json({
      access_token: keyValue,
      token_type: 'Bearer',
      expires_in: 365 * 24 * 3600, // 1 year
    });
  }

  return c.json({ error: 'server_error' }, 500);
});

// ── POST /v1/oauth/device/authorize ──
// Called by WebUI when user enters user_code and clicks "Authorize"
// This endpoint REQUIRES authentication (not in PUBLIC_PREFIXES)

const AuthorizeRequestSchema = z.object({
  user_code: z.string().min(1),
});

oauthDeviceRoutes.post('/v1/oauth/device/authorize', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: context typing
  const apiKey = (c as any).get('apiKey') as { user_id?: string } | undefined;
  const userId = apiKey?.user_id;
  if (!userId) {
    return c.json({ error: 'unauthorized', error_description: 'Login required' }, 401);
  }

  const body = await c.req.json();
  const parsed = AuthorizeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_request', error_description: 'user_code is required' }, 400);
  }

  const db = await getDB();
  const dc = await findDeviceCodeByUserCode(db, parsed.data.user_code);

  if (!dc) {
    return c.json({ error: 'invalid_code', error_description: 'Code not found or expired' }, 404);
  }

  const result = await authorizeDeviceCode(db, dc.id, userId);
  if (!result) {
    return c.json(
      { error: 'invalid_code', error_description: 'Code already used or expired' },
      400
    );
  }

  return c.json({ status: 'authorized' });
});
