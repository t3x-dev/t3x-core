'use client';

import { useParams } from 'next/navigation';
import { WorkspaceChangeReviewPage } from '@/components/workspaces/WorkspaceChangeReviewPage';

export default function WorkspaceChangeReviewRoute() {
  const params = useParams();

  return (
    <WorkspaceChangeReviewPage
      projectId={String(params.projectId)}
      snapshotId={String(params.snapshotId)}
      workspaceId={String(params.workspaceId)}
    />
  );
}
