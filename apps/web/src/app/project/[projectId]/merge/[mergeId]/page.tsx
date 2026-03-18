'use client';

/**
 * Merge Workspace Page
 *
 * Full-screen merge workspace for resolving merge conflicts
 * with Git-style diff visualization and source tracing.
 */

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { MergeWorkspace } from '@/components/merge/MergeWorkspace';
import { useMicrocopy } from '@/lib/microcopy';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';

export default function MergeWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const mergeId = params.mergeId as string;

  const mc = useMicrocopy();
  const { loadDraft, loading, error, reset } = useMergeWorkspaceStore();

  useEffect(() => {
    if (mergeId) {
      loadDraft(mergeId).catch(() => {
        // Error is already set in store
      });
    }

    return () => {
      // Don't reset on unmount to preserve state for back navigation
    };
  }, [mergeId, loadDraft]);

  // Note: redirect after merge commit is handled by MergeWorkspace's
  // celebration timeout → onClose → handleClose → router.push.
  // An auto-redirect here would kill the celebration overlay.

  const handleClose = () => {
    reset();
    router.push(`/project/${projectId}`);
  };

  const handleMergeCommitted = (commitHash: string) => {
    reset();
    router.push(`/project/${projectId}/commit/${encodeURIComponent(commitHash)}`);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading merge workspace...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-[var(--space-group)]">:(</div>
          <h1 className="text-xl font-semibold mb-[var(--space-item)]">Failed to load merge</h1>
          <p className="text-muted-foreground mb-[var(--space-group)]">{error}</p>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            {mc('backToCanvas')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <MergeWorkspace
      projectId={projectId}
      onClose={handleClose}
      onMergeCommitted={handleMergeCommitted}
    />
  );
}
