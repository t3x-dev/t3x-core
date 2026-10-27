'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import {
  decodeReviewRouteSegment,
  workspaceReviewHref,
} from '@/domain/workspaces/reviewNavigation';

/** Compatibility entry: the immutable review now belongs to Workspace Review. */
export function WorkspaceChangeReviewPage({
  projectId,
  workspaceId,
  snapshotId,
}: {
  projectId: string;
  workspaceId: string;
  snapshotId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const href = workspaceReviewHref(
    decodeReviewRouteSegment(projectId),
    decodeReviewRouteSegment(workspaceId),
    {
      snapshotId: decodeReviewRouteSegment(snapshotId),
      branch: params.get('branch') ?? undefined,
      pane: params.get('reviewPane'),
    }
  );
  useEffect(() => {
    router.replace(href);
  }, [href, router]);
  return (
    <p className="p-6 text-sm">
      Opening Workspace Review… <Link href={href}>Continue to Review</Link>
    </p>
  );
}
