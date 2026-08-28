import { useCallback } from 'react';
import { createPersonalNamespace } from '@/commands/namespaces/createPersonalNamespace';

export function usePersonalNamespace() {
  const create = useCallback((slug: string) => createPersonalNamespace(slug), []);
  return { create };
}
