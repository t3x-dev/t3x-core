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
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';

export default function MergeWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const mergeId = params.mergeId as string;

  const { loadDraft, loading, error, status, reset } = useMergeWorkspaceStore();

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

  // Redirect to canvas if merge is committed
  useEffect(() => {
    if (status === 'committed') {
      router.push(`/project/${projectId}`);
    }
  }, [status, projectId, router]);

  const handleClose = () => {
    reset();
    router.push(`/project/${projectId}`);
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
          <div className="text-4xl mb-4">:(</div>
          <h1 className="text-xl font-semibold mb-2">Failed to load merge</h1>
          <p className="text-muted-foreground mb-4">{error}</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Back to Canvas
          </button>
        </div>
      </div>
    );
  }

  return <MergeWorkspace projectId={projectId} onClose={handleClose} />;
}
