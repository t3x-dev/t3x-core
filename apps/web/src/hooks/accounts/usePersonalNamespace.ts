'use client';

import { useEffect, useState } from 'react';
import { getCurrentPersonalNamespace, type NamespaceProfile } from '@/infrastructure/namespaces';

export function usePersonalNamespace(): NamespaceProfile | null {
  const [namespace, setNamespace] = useState<NamespaceProfile | null>(null);

  useEffect(() => {
    let active = true;
    getCurrentPersonalNamespace()
      .then((current) => {
        if (active) setNamespace(current);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return namespace;
}
