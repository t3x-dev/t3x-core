'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { checksHref } from '@/domain/project/checks';

/** Resolve legacy bookmarks without mounting the authoring workbench. */
export function WorkspaceChecksRedirect({
  projectId,
  workspaceId,
}: {
  projectId: string;
  workspaceId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = new URLSearchParams(useSearchParams().toString());
  params.delete('reviewPane');
  params.set('workspaceMode', 'review');
  const snapshotId = params.get('reviewSnapshot');
  const href = checksHref(projectId, {
    recordId: snapshotId ? `review:${snapshotId}` : undefined,
    workspace: workspaceId ?? params.get('workspace') ?? undefined,
    returnTo: `${pathname}?${params}`,
  });
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
  return (
    <p className="p-6 text-sm">
      Opening repository Run… <Link href={href}>Continue to Run</Link>
    </p>
  );
}
