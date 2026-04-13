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

/**
 * Fetch the current authenticated user's profile.
 */
export async function getAuthMe(): Promise<AuthMeData> {
  const res = await fetchWithTimeout(`${API_V1}/auth/me`);
  return handleResponse<AuthMeData>(res);
}
