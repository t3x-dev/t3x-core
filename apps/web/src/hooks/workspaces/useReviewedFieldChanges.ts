import { useEffect, useState } from 'react';
import { type FieldChangeGroup, fieldChangeGroups } from '@/domain/workspaces/changeFields';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';

/**
 * Field-level changes for a reviewed authoring Draft. Groups are returned only
 * while the Workspace is still at the reviewed revision, so they describe
 * exactly the snapshot's Effect; otherwise callers fall back to the immutable
 * operations.
 */
export function useReviewedFieldChanges(
  projectId: string,
  workspaceId: string,
  reviewedRevision: number | undefined
): FieldChangeGroup[] | null {
  const [groups, setGroups] = useState<FieldChangeGroup[] | null>(null);

  useEffect(() => {
    setGroups(null);
    if (reviewedRevision === undefined) return;
    let cancelled = false;
    getSharedApiClient()
      .workspaces.authoring.read(projectId, workspaceId, { limit: 1 })
      .then((view) => {
        if (cancelled) return;
        setGroups(
          view.workspaceRevision === reviewedRevision
            ? fieldChangeGroups(view.base, view.current)
            : null
        );
      })
      .catch(() => {
        if (!cancelled) setGroups(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, workspaceId, reviewedRevision]);

  return groups;
}
