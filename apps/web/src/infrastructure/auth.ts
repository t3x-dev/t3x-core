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

export interface PersonalModelPreferences {
  compose_default: string;
  fallback_model: string | null;
  quick_switcher: Array<{ model: string; visible: boolean; available: boolean }>;
}

export interface UpdatePersonalModelPreferences {
  compose_default: string;
  fallback_model: string | null;
  quick_switcher: Array<{ model: string; visible: boolean }>;
}

export interface ProfileSession {
  id: string;
  name: string;
  current: boolean;
  last_active: string | null;
}

export interface ProfileSettings {
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  timezone: string;
  sessions: ProfileSession[];
}

export interface UpdateProfileSettings {
  name: string;
  avatar_url?: string | null;
  timezone: string;
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

export async function getPersonalModelPreferences(): Promise<PersonalModelPreferences> {
  const res = await fetchWithTimeout(`${API_V1}/auth/me/model-preferences`);
  return handleResponse<PersonalModelPreferences>(res);
}

export async function updatePersonalModelPreferences(
  input: UpdatePersonalModelPreferences
): Promise<PersonalModelPreferences> {
  const res = await fetchWithTimeout(`${API_V1}/auth/me/model-preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<PersonalModelPreferences>(res);
}

export async function getProfileSettings(): Promise<ProfileSettings> {
  const res = await fetchWithTimeout(`${API_V1}/auth/me/profile-settings`);
  return handleResponse<ProfileSettings>(res);
}

export async function updateProfileSettings(
  input: UpdateProfileSettings
): Promise<ProfileSettings> {
  const res = await fetchWithTimeout(`${API_V1}/auth/me/profile-settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<ProfileSettings>(res);
}

export async function revokeProfileSession(id: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_V1}/auth/me/profile-settings/sessions/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  await handleResponse<{ revoked: true }>(res);
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
