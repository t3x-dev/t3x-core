/**
 * MCP Device Flow Authentication
 *
 * Handles OAuth Device Flow to get an API key from the t3x server.
 * Stores the token in a local file for reuse across sessions.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const TOKEN_DIR = join(homedir(), '.t3x');
const TOKEN_FILE = join(TOKEN_DIR, 'mcp-token.json');

interface StoredToken {
  access_token: string;
  server_url: string;
}

export function getStoredToken(serverUrl: string): string | null {
  try {
    const data = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8')) as StoredToken;
    if (data.server_url === serverUrl && data.access_token) {
      return data.access_token;
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return null;
}

function saveToken(serverUrl: string, accessToken: string): void {
  mkdirSync(TOKEN_DIR, { recursive: true });
  writeFileSync(
    TOKEN_FILE,
    JSON.stringify({ access_token: accessToken, server_url: serverUrl } satisfies StoredToken),
    'utf-8'
  );
}

/**
 * Run the OAuth Device Flow to obtain an access token.
 * Returns the token and the user-facing message with verification URI + code.
 */
export async function deviceFlowAuth(
  baseUrl: string
): Promise<{ token: string; message: string }> {
  // Phase 1: Request device code
  const codeRes = await fetch(`${baseUrl}/v1/oauth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'mcp' }),
  });

  if (!codeRes.ok) {
    throw new Error(`Device code request failed: ${codeRes.status}`);
  }

  const codeData = await codeRes.json() as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };

  const message =
    `To authorize, visit: ${codeData.verification_uri}\n` +
    `Enter code: ${codeData.user_code}\n` +
    `(Expires in ${Math.floor(codeData.expires_in / 60)} minutes)`;

  // Phase 2: Poll for token
  const deadline = Date.now() + codeData.expires_in * 1000;
  const interval = codeData.interval * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));

    const tokenRes = await fetch(`${baseUrl}/v1/oauth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_code: codeData.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    if (tokenRes.ok) {
      const tokenData = await tokenRes.json() as { access_token: string };
      saveToken(baseUrl, tokenData.access_token);
      return { token: tokenData.access_token, message };
    }

    const errData = await tokenRes.json() as { error: string };
    if (errData.error === 'authorization_pending') {
      continue;
    }
    if (errData.error === 'slow_down') {
      await new Promise((r) => setTimeout(r, interval));
      continue;
    }
    throw new Error(`Device flow failed: ${errData.error}`);
  }

  throw new Error('Device flow timed out');
}

/**
 * Ensure we have a valid token.
 * Priority: 1. T3X_API_KEY env var, 2. Stored token from file, 3. null (no auth)
 */
export function ensureAuth(baseUrl: string): string | null {
  const envKey = process.env.T3X_API_KEY;
  if (envKey) return envKey;

  const stored = getStoredToken(baseUrl);
  if (stored) return stored;

  return null;
}
