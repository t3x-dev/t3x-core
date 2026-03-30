import { createClient, type T3xClient } from '@t3x-dev/api-client';

let client: T3xClient | null = null;
let currentToken: string | null = null;

export function getBaseUrl(): string {
  return process.env.T3X_API_URL || 'http://localhost:8000/api';
}

export function getClient(token?: string | null): T3xClient {
  const resolvedToken = token ?? currentToken;

  // Reuse client if token hasn't changed
  if (client && resolvedToken === currentToken) return client;

  const baseUrl = getBaseUrl();
  const headers: Record<string, string> = {};
  if (resolvedToken) {
    headers.Authorization = `Bearer ${resolvedToken}`;
  }

  client = createClient({ baseUrl, headers });
  currentToken = resolvedToken ?? null;
  return client;
}

export function updateToken(token: string): void {
  currentToken = token;
  client = null; // Force re-creation with new token
}
