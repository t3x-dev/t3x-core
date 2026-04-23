/**
 * Auth API client functions
 */

import type { ExtractionStyleConfig } from '@t3x-dev/core';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export interface AuthMeData {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  avatar_url: string | null;
  default_provider?: string | null;
  default_model?: string | null;
  default_extraction_style?: ExtractionStyleConfig | null;
}

export interface UpdateAuthMeInput {
  name?: string;
  avatar_url?: string;
  default_provider?: string | null;
  default_model?: string | null;
  default_extraction_style?: ExtractionStyleConfig | null;
}

/**
 * Fetch the current authenticated user's profile.
 */
export async function getAuthMe(): Promise<AuthMeData> {
  const res = await fetchWithTimeout(`${API_V1}/auth/me`);
  return handleResponse<AuthMeData>(res);
}

/**
 * Update the current authenticated user's profile and preferences.
 */
export async function updateAuthMe(input: UpdateAuthMeInput): Promise<AuthMeData> {
  const res = await fetchWithTimeout(`${API_V1}/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<AuthMeData>(res);
}

// ── Login / register (pre-session) ──

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  name?: string;
}

export interface AuthSessionResponse {
  api_key: string;
  id: string;
  name: string | null;
  username: string | null;
}

/**
 * Exchange credentials for a session api_key. Pre-session, so
 * `injectAuthHeaders` is a no-op (no token to inject yet) — we still
 * route through `fetchWithTimeout` + `handleResponse` so timeouts,
 * backend error envelopes, and error translation are consistent with
 * the rest of the client.
 */
export async function postLogin(credentials: LoginCredentials): Promise<AuthSessionResponse> {
  const res = await fetchWithTimeout(`${API_V1}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  return handleResponse<AuthSessionResponse>(res);
}

export async function postRegister(credentials: RegisterCredentials): Promise<AuthSessionResponse> {
  const res = await fetchWithTimeout(`${API_V1}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  return handleResponse<AuthSessionResponse>(res);
}
