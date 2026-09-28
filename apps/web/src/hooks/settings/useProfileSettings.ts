'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getProfileSettings,
  type ProfileSettings,
  revokeProfileSession,
  type UpdateProfileSettings,
  updateProfileSettings,
} from '@/infrastructure/auth';

export type { ProfileSession, ProfileSettings } from '@/infrastructure/auth';

export function useProfileSettings(enabled = true) {
  const [data, setData] = useState<ProfileSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await getProfileSettings());
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => void load(), [load]);

  const save = useCallback(async (input: UpdateProfileSettings) => {
    setSaving(true);
    setError(null);
    try {
      const next = await updateProfileSettings(input);
      setData(next);
      return next;
    } finally {
      setSaving(false);
    }
  }, []);

  const revoke = useCallback(async (id: string) => {
    await revokeProfileSession(id);
    setData((current) =>
      current
        ? { ...current, sessions: current.sessions.filter((session) => session.id !== id) }
        : current
    );
  }, []);

  return { data, loading, saving, error, retry: load, save, revoke };
}
