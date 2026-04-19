/**
 * Auth API client functions
 */

import { API_V1, fetchWithTimeout, handleResponse } from './core';

export interface AuthMeData {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface UpdateAuthMeInput {
  name?: string | null;
  avatar_url?: string | null;
}

/**
 * Fetch the current authenticated user's profile.
 */
export async function getAuthMe(): Promise<AuthMeData> {
  const res = await fetchWithTimeout(`${API_V1}/auth/me`);
  return handleResponse<AuthMeData>(res);
}

/**
 * Update editable profile fields for the current authenticated user.
 */
export async function updateAuthMe(input: UpdateAuthMeInput): Promise<AuthMeData> {
  const body = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const res = await fetchWithTimeout(`${API_V1}/auth/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return handleResponse<AuthMeData>(res);
}
