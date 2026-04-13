'use client';

/**
 * Draft Workspace Page
 *
 * Full-screen draft editing workspace for composing knowledge
 * before committing to the semantic version control system.
 */

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { DraftWorkspace } from '@/components/draft/DraftWorkspace';
import { useDraftWorkspaceActions } from '@/hooks/useDraftWorkspaceActions';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';

export default function DraftPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const draftId = params.draftId as string;

  const { loading, error, reset } = useDraftWorkspaceStore();
  const { load: loadDraft } = useDraftWorkspaceActions();

  useEffect(() => {
    if (draftId) {
      loadDraft(draftId);
    }
  }, [draftId, loadDraft]);

  // Reset store on unmount so stale draft state is not carried over if the
  // user navigates to a different draft or back to the canvas.
  useEffect(() => {
    return () => {
      useDraftWorkspaceStore.getState().reset();
    };
  }, []);

  const handleClose = () => {
    reset();
    router.push(`/project/${projectId}`);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading draft workspace...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-[var(--space-group)]">:(</div>
          <h1 className="text-xl font-semibold mb-[var(--space-item)]">Failed to load draft</h1>
          <p className="text-muted-foreground mb-[var(--space-group)]">{error}</p>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Back to Canvas
          </button>
        </div>
      </div>
    );
  }

  return <DraftWorkspace projectId={projectId} onClose={handleClose} />;
}
