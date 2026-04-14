'use client';

/**
 * useClipboard — clipboard copy wrapper over
 * @/infrastructure/export/core so components don't import infra.
 */

import { useCallback } from 'react';
import { copyToClipboard } from '@/infrastructure/export/core';

export function useClipboard() {
  const copy = useCallback((text: string): Promise<boolean> => copyToClipboard(text), []);
  return { copy };
}
