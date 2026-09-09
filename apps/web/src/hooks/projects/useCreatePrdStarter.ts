import { useCallback } from 'react';
import { createProject } from '@/commands/projects';

export function useCreatePrdStarter() {
  return useCallback(
    (name: string, namespace?: string) => createProject(name, undefined, namespace, 'prd-v1'),
    []
  );
}
