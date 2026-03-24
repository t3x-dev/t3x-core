import { createClient, type T3xClient } from '@t3x-dev/api-client';

let client: T3xClient | null = null;

export function getClient(): T3xClient {
  if (client) return client;

  const baseUrl = process.env.T3X_API_URL || 'http://localhost:8000/api';
  const apiKey = process.env.T3X_API_KEY;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  client = createClient({ baseUrl, headers });
  return client;
}
