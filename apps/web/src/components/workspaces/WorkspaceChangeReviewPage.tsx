'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { getCanonicalRepositoryPath } from '@/domain/project/repoPath';
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
  const repositoryPath = getCanonicalRepositoryPath(usePathname());
  const [path, reviewQuery] = workspaceReviewHref(
    decodeReviewRouteSegment(projectId),
    decodeReviewRouteSegment(workspaceId),
    {
      snapshotId: decodeReviewRouteSegment(snapshotId),
      branch: params.get('branch') ?? undefined,
      pane: params.get('reviewPane'),
      repositoryPath,
    }
  ).split('?');
  const query = new URLSearchParams(params.toString());
  query.delete('tab');
  for (const [key, value] of new URLSearchParams(reviewQuery)) query.set(key, value);
  const href = `${path}?${query}`;
  useEffect(() => {
    router.replace(`${href}${window.location.hash}`);
  }, [href, router]);
  return (
    <p className="p-6 text-sm">
      Opening Workspace Review… <Link href={href}>Continue to Review</Link>
    </p>
  );
}
