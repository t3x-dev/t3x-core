'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { CanvasWorkspace } from '@/components/canvas';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { useCanvasDeletionWiring } from '@/hooks/canvas/useCanvasDeletionWiring';
import { useCanvasNodeActions } from '@/hooks/canvas/useCanvasNodeActions';
import { usePinsCrud } from '@/hooks/pins/usePinsCrud';
import { useProjectCrud } from '@/hooks/projects/useProjectCrud';
import { useCanvasStore } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { useProjectStore } from '@/store/projectStore';

export default function ProjectDetailPage() {
  return (
    <Suspense>
      <ProjectDetailPageContent />
    </Suspense>
  );
}

function ProjectDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const searchParams = useSearchParams();

  const project = useProjectStore((state) => state.projects.find((item) => item.id === projectId));
  const projectsInitialized = useProjectStore((state) => state.initialized);
  const projectsLoading = useProjectStore((state) => state.loading);
  const { list: fetchProjects } = useProjectCrud();
  const { fetch: fetchPins } = usePinsCrud();
  const { load: loadCanvas } = useCanvasNodeActions();
  useCanvasDeletionWiring();

  // Canvas store for loading project data
  const canvasLoading = useCanvasStore((state) => state.loading);
  const canvasError = useCanvasStore((state) => state.loadError);
  const loadedProjectId = useCanvasStore((state) => state.projectId);
  const canvasNodeCount = useCanvasStore((state) => state.nodes.length);

  // Parse initial viewport from URL params
  const initialViewport = useMemo(() => {
    const zoom = searchParams.get('zoom');
    const x = searchParams.get('x');
    const y = searchParams.get('y');
    if (zoom !== null && x !== null && y !== null) {
      return { x: Number(x), y: Number(y), zoom: Number(zoom) };
    }
    return undefined;
  }, []); // intentionally empty — only read once on mount

  // Open selected node from URL on first load
  const selectedFromUrl = useRef(searchParams.get('selected'));
  useEffect(() => {
    if (selectedFromUrl.current && !canvasLoading && !canvasError) {
      useCanvasStore.getState().openNodeModal(selectedFromUrl.current, 'commit');
      selectedFromUrl.current = null;
    }
  }, [canvasLoading, canvasError]);

  // Keep a stable ref to searchParams so callbacks don't re-create on every URL change
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  // Debounced viewport → URL sync
  const viewportTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    return () => clearTimeout(viewportTimerRef.current);
  }, []);
  const handleViewportChange = useCallback(
    (viewport: { x: number; y: number; zoom: number }) => {
      clearTimeout(viewportTimerRef.current);
      viewportTimerRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParamsRef.current.toString());
        params.set('zoom', viewport.zoom.toFixed(2));
        params.set('x', Math.round(viewport.x).toString());
        params.set('y', Math.round(viewport.y).toString());
        router.replace(`?${params.toString()}`, { scroll: false });
      }, 500);
    },
    [router]
  );

  // Fetch projects list if not initialized (handles direct URL access)
  useEffect(() => {
    if (!projectsInitialized && !projectsLoading) {
      void fetchProjects();
    }
  }, [projectsInitialized, projectsLoading, fetchProjects]);

  // Load fresh project data whenever this page is entered. The canvas store
  // persists across routes, so returning from Chat after a commit must not
  // reuse a stale draft/staging view for the same project.
  useEffect(() => {
    if (projectId) {
      void loadCanvas(projectId);
    }
  }, [projectId, loadCanvas]);

  // Refresh project data when page becomes visible OR on a 30s polling interval.
  // This ensures canvas stays up-to-date when commits are created from Chat.
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    if (!projectId) return;

    const refreshIfStale = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current > 5000) {
        lastRefreshRef.current = now;
        // Use incremental merge to avoid clearing existing edges/positions
        void loadCanvas(projectId, { merge: true });
      }
    };

    // Refresh on tab re-focus
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfStale();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Poll every 30s while page is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refreshIfStale();
    }, 30_000);

    // Listen for commit broadcasts from chat page — refresh immediately
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('t3x-commits');
      channel.onmessage = () => {
        lastRefreshRef.current = 0; // bypass throttle
        refreshIfStale();
      };
    } catch {
      // BroadcastChannel not supported
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(interval);
      channel?.close();
    };
  }, [projectId, loadCanvas]);

  // Initialize pins store for the project
  useEffect(() => {
    if (projectId) {
      void fetchPins(projectId);
    }
  }, [projectId, fetchPins]);

  // Show loading while projects list is still loading
  if (!projectsInitialized || projectsLoading) {
    return (
      <div className="flex h-full flex-col">
        <LoadingSpinner message="Loading project..." />
      </div>
    );
  }

  // Show not-found page when projects loaded but this one doesn't exist
  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="rounded-2xl bg-muted/50 p-8 text-center backdrop-blur-sm">
          <p className="text-lg font-semibold text-foreground">Project not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The project <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{projectId}</code>{' '}
            does not exist or was deleted.
          </p>
          <button
            onClick={() => router.push('/chat')}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            type="button"
          >
            Go to Chats
          </button>
        </div>
      </div>
    );
  }

  // Show loading state
  if (canvasLoading) {
    return (
      <div className="flex h-full flex-col">
        <LoadingSpinner message="Loading project data..." />
      </div>
    );
  }

  // Show error state
  if (canvasError) {
    return (
      <div className="flex h-full flex-col">
        <ErrorMessage error={canvasError} onRetry={() => projectId && void loadCanvas(projectId)} />
      </div>
    );
  }

  // Empty-project redirect: chat is the producing layer. With no commits or
  // leaves there is nothing for the canvas to visualise; surfacing an
  // onboarding card here just duplicates the chat landing page. Hand the
  // user back to chat so the working bench is the only entry point until
  // they actually have committed meaning to view.
  //
  // Crucially we preserve the empty project as the *target* — both by
  // priming `chatStore.activeProjectId` and by encoding it in the URL —
  // so the user's first message in chat continues this project rather
  // than spawning a new one. Direct loads of /project/[id] (no Zustand
  // history) are exactly the case the URL param protects against.
  const isEmptyAfterLoad = loadedProjectId === projectId && canvasNodeCount === 0;
  if (isEmptyAfterLoad) {
    return (
      <div className="flex h-full flex-col">
        <RedirectToChat projectId={projectId} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <CanvasWorkspace
        key={projectId}
        projectName={project.name}
        initialViewport={initialViewport}
        onViewportChange={handleViewportChange}
      />
    </div>
  );
}

/**
 * Imperatively replaces the route with /chat/new, preserving the project
 * context two ways:
 *
 *   1. Primes `chatStore.activeProjectId` synchronously so the next mount
 *      of ChatWorkspace already knows which project this is — covers the
 *      same-tab navigation path.
 *   2. Encodes `?projectId=…` in the URL so a direct load / refresh / share
 *      of the chat page also picks the project up — covers the cold-start
 *      case where Zustand has no history yet.
 *
 * `router.replace` (not push) so the browser back button doesn't bring the
 * user back to the empty canvas they were just bounced out of.
 */
function RedirectToChat({ projectId }: { projectId: string }) {
  const router = useRouter();
  useEffect(() => {
    useChatStore.getState().setActiveConversation(null, projectId);
    router.replace(`/chat/new?projectId=${encodeURIComponent(projectId)}`);
  }, [router, projectId]);
  return <LoadingSpinner message="Opening chat workspace…" />;
}
