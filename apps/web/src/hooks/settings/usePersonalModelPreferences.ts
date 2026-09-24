'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getPersonalModelPreferences,
  type PersonalModelPreferences,
  type UpdatePersonalModelPreferences,
  updatePersonalModelPreferences,
} from '@/infrastructure/auth';

export type { PersonalModelPreferences } from '@/infrastructure/auth';

export function usePersonalModelPreferences() {
  const [data, setData] = useState<PersonalModelPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getPersonalModelPreferences());
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const save = useCallback(async (input: UpdatePersonalModelPreferences) => {
    setSaving(true);
    setError(null);
    try {
      const next = await updatePersonalModelPreferences(input);
      setData(next);
      return next;
    } finally {
      setSaving(false);
    }
  }, []);

  return { data, loading, saving, error, retry: load, save };
}
