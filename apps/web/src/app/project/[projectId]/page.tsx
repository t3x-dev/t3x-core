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

  // Load project data when entering the page
  useEffect(() => {
    if (projectId && projectId !== loadedProjectId) {
      void loadCanvas(projectId);
    }
  }, [projectId, loadedProjectId, loadCanvas]);

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
