'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProjectDirectoryPage } from '@/components/project/ProjectDirectoryPage';
import { ApiError } from '@/infrastructure/core';
import { getCurrentPersonalNamespace } from '@/infrastructure/namespaces';

export default function RootPage() {
  const router = useRouter();
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (authDisabled) return;
    let active = true;
    getCurrentPersonalNamespace()
      .then((namespace) => {
        if (!active) return;
        router.replace(
          namespace ? `/${encodeURIComponent(namespace.slug)}` : '/onboarding/namespace'
        );
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
          router.replace('/login?callbackUrl=%2F');
          return;
        }
        setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [authDisabled, router]);

  if (authDisabled) return <ProjectDirectoryPage />;

  return (
    <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      {failed
        ? 'Could not open your repositories. Reload to try again.'
        : 'Opening your repositories…'}
    </main>
  );
}
