'use client';

import { useCallback, useEffect, useState } from 'react';

/** Persist presentation choices only; never restore an entity, draft, or decision from storage. */
export function useViewPreference<T extends string>(
  key: string,
  choices: readonly T[],
  fallback: T
) {
  const [saved, setSaved] = useState<{ key: string; value: T; stored: boolean } | null>(null);
  useEffect(() => {
    let value = fallback;
    let storedChoice = false;
    try {
      const stored = window.localStorage.getItem(key);
      if (choices.includes(stored as T)) {
        value = stored as T;
        storedChoice = true;
      }
    } catch {
      // Storage restrictions must not prevent navigation.
    }
    setSaved({ key, value, stored: storedChoice });
  }, [key, choices, fallback]);

  const remember = useCallback(
    (value: T) => {
      setSaved({ key, value, stored: true });
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // The current session still keeps the selected view.
      }
    },
    [key]
  );

  return [
    saved?.key === key ? saved.value : fallback,
    remember,
    saved?.key === key,
    saved?.key === key && saved.stored,
  ] as const;
}
