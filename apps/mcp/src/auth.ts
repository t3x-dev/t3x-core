/**
 * MCP Browser-Based Authentication
 *
 * Opens the t3x WebUI login page in the user's browser.
 * Receives the API key via local HTTP callback after login.
 * Stores the token in a local file for reuse across sessions.
 */

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TOKEN_DIR = join(homedir(), '.t3x');
const TOKEN_FILE = join(TOKEN_DIR, 'mcp-token.json');
const AUTH_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

interface StoredToken {
  access_token: string;
  server_url: string;
}

// ── Token persistence ──────────────────────────────────────────────────────

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

export function clearStoredToken(): void {
  try {
    unlinkSync(TOKEN_FILE);
  } catch {
    // File doesn't exist, that's fine
  }
}

// ── Browser auth flow ──────────────────────────────────────────────────────

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>T3X Auth</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}
.card{text-align:center;padding:2rem}.check{font-size:3rem;margin-bottom:1rem}</style>
</head><body><div class="card"><div class="check">&#10003;</div>
<h2>Authentication successful</h2><p>You can close this page.</p></div></body></html>`;

const ERROR_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>T3X Auth</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}
.card{text-align:center;padding:2rem}.icon{font-size:3rem;margin-bottom:1rem;color:#ef4444}</style>
</head><body><div class="card"><div class="icon">&#10007;</div>
<h2>Authentication failed</h2><p>State mismatch. Please retry.</p></div></body></html>`;

/** In-flight auth promise to prevent multiple browser popups */
let pendingAuth: Promise<string> | null = null;

/**
 * Open the browser to the WebUI login page and wait for the callback.
 * Returns the API key token.
 */
export async function browserAuth(baseUrl: string): Promise<string> {
  // Prevent concurrent auth attempts
  if (pendingAuth) return pendingAuth;

  pendingAuth = doBrowserAuth(baseUrl).finally(() => {
    pendingAuth = null;
  });
  return pendingAuth;
}

async function doBrowserAuth(baseUrl: string): Promise<string> {
  const state = randomBytes(32).toString('hex');
  const webUrl = getWebUrl();

  return new Promise<string>((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const token = url.searchParams.get('token');
      const returnedState = url.searchParams.get('state');

      if (returnedState !== state || !token) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(ERROR_HTML);
        cleanup();
        reject(new Error('Authentication failed: state mismatch'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SUCCESS_HTML);

      saveToken(baseUrl, token);
      cleanup();
      resolve(token);
    });

    // Listen on random port, loopback only
    server.listen(0, '127.0.0.1', async () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        cleanup();
        reject(new Error('Failed to start callback server'));
        return;
      }

      const callbackUrl = `http://127.0.0.1:${addr.port}/callback`;
      const loginUrl = `${webUrl}/login?mcp_callback=${encodeURIComponent(callbackUrl)}&state=${state}`;

      try {
        const openModule = await import('open');
        await openModule.default(loginUrl);
      } catch {
        cleanup();
        reject(
          new Error(
            `Cannot open browser. Set T3X_API_KEY environment variable instead.\nLogin URL: ${loginUrl}`
          )
        );
      }
    });

    // Timeout after 3 minutes
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Authentication timed out (3 minutes). Please retry.'));
    }, AUTH_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      server.close();
    }
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

export function getWebUrl(): string {
  return process.env.T3X_WEB_URL || 'http://localhost:3000';
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
