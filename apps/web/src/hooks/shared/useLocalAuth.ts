'use client';

import { useCallback } from 'react';
import {
  type AuthSessionResponse,
  postLogin,
  postRegister,
  type RegisterCredentials,
} from '@/infrastructure/auth';
import { ApiError } from '@/infrastructure/core';
import { useSession } from './useSession';

export type LocalAuthMode = 'login' | 'register';

interface LocalAuthInput {
  mode: LocalAuthMode;
  username: string;
  password: string;
  name?: string;
}

export function useLocalAuth() {
  const { setKey, setUser } = useSession();

  const authenticate = useCallback(async (input: LocalAuthInput): Promise<AuthSessionResponse> => {
    if (input.mode === 'login') {
      return postLogin({ username: input.username, password: input.password });
    }

    const credentials: RegisterCredentials = {
      username: input.username,
      password: input.password,
      ...(input.name ? { name: input.name } : {}),
    };
    return postRegister(credentials);
  }, []);

  const persistSession = useCallback(
    (session: AuthSessionResponse) => {
      setKey(session.api_key);
      setUser({
        id: session.id,
        name: session.name ?? null,
        username: session.username ?? null,
      });
    },
    [setKey, setUser]
  );

  const getErrorMessage = useCallback((error: unknown) => {
    if (error instanceof ApiError) return error.message || 'Something went wrong';
    return 'Failed to connect to server';
  }, []);

  return { authenticate, persistSession, getErrorMessage };
}
