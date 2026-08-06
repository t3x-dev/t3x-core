import { createClient, type T3xClient } from '@t3x-dev/api-client';
import { API_BASE, DEFAULT_TIMEOUT, fetchWithTimeout } from './core';

let sharedClient: T3xClient | undefined;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

const sharedClientFetch: typeof fetch = (input, init) =>
  fetchWithTimeout(requestUrl(input), init, DEFAULT_TIMEOUT, init?.signal ?? undefined);

function sharedClientBaseUrl(): string {
  const origin =
    API_BASE || (typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin);
  return `${origin.replace(/\/$/, '')}/api`;
}

/** Shared endpoint/type client with the Web transport's auth, timeout, retry, and abort behavior. */
export function getSharedApiClient(): T3xClient {
  sharedClient ??= createClient({ baseUrl: sharedClientBaseUrl(), fetch: sharedClientFetch });
  return sharedClient;
}
