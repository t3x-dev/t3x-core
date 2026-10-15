'use client';

import { WorkspaceChangeReviewPage } from '@/components/workspaces/WorkspaceChangeReviewPage';
import { useRepositoryRouteParams as useParams } from '@/hooks/projects/repositoryRouteContext';

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
