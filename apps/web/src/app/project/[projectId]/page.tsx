'use client';

import { Activity, Cpu, Search, Settings, Zap } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { CanvasWorkspace } from '@/components/canvas';
import { TimelineView } from '@/components/project/TimelineView';
import { ViewSwitcher } from '@/components/project/ViewSwitcher';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { usePinsStore } from '@/store/pinsStore';
import { useProjectStore } from '@/store/projectStore';
import { useSettingsStore, type ViewMode } from '@/store/settingsStore';

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
  const [mode, setMode] = useState<'editor' | 'execution'>(() => {
    const urlMode = searchParams.get('mode');
    return urlMode === 'execution' ? 'execution' : 'editor';
  });

  const defaultView = useSettingsStore((s) => s.defaultView);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const urlView = searchParams.get('view');
    if (urlView === 'canvas' || urlView === 'timeline') return urlView;
    return defaultView;
  });

  // Canvas store for loading project data
  const canvasLoading = useCanvasStore((state) => state.loading);
  const canvasError = useCanvasStore((state) => state.loadError);
  const loadedProjectId = useCanvasStore((state) => state.projectId);
  const nodes = useCanvasStore((state) => state.nodes);

  // Detect node types for QuickStart checklist
  const _nodeTypes = useMemo(() => {
    const types = new Set(nodes.map((n) => n.type));
    return {
      hasConversation: types.has('conversation'),
      hasCommit: types.has('commit') || types.has('pending'),
      hasBranch: nodes.some((n) => n.data?.branch && n.data.branch !== 'main'),
      hasLeaf: types.has('leaf'),
      hasMerge: nodes.some((n) => n.data?.isMergeCommit),
    };
  }, [nodes]);

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

  // Sync mode → URL
  const handleModeChange = useCallback(
    (newMode: 'editor' | 'execution') => {
      setMode(newMode);
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (newMode === 'execution') {
        params.set('mode', 'execution');
      } else {
        params.delete('mode');
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  // Fetch projects list if not initialized (handles direct URL access)
  useEffect(() => {
    if (!projectsInitialized && !projectsLoading) {
      useProjectStore.getState().fetchProjects();
    }
  }, [projectsInitialized, projectsLoading]);

  // Load project data when entering the page
  useEffect(() => {
    if (projectId && projectId !== loadedProjectId) {
      useCanvasStore.getState().loadProjectData(projectId);
    }
  }, [projectId, loadedProjectId]);

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
        useCanvasStore.getState().loadProjectData(projectId, { merge: true });
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

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(interval);
    };
  }, [projectId]);

  // Initialize pins store for the project
  useEffect(() => {
    if (projectId) {
      usePinsStore.getState().fetchPins(projectId);
    }
  }, [projectId]);

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
            onClick={() => router.push('/')}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            type="button"
          >
            Go to Projects
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
        <ErrorMessage
          error={canvasError}
          onRetry={() => projectId && useCanvasStore.getState().loadProjectData(projectId)}
        />
      </div>
    );
  }

  const _canvasReady = !canvasLoading && !canvasError && !!project;

  return (
    <div className="flex h-full flex-col">
      {mode === 'editor' && viewMode === 'canvas' ? (
        <CanvasWorkspace
          projectName={project.name}
          mode={mode}
          onModeChange={handleModeChange}
          initialViewport={initialViewport}
          onViewportChange={handleViewportChange}
          viewSwitcher={<ViewSwitcher value={viewMode} onChange={setViewMode} />}
        />
      ) : mode === 'editor' && viewMode === 'timeline' ? (
        <div className="flex h-full flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{project.name}</h2>
            <div className="flex items-center gap-2">
              <ViewSwitcher value={viewMode} onChange={setViewMode} />
              <Link
                href={`/project/${projectId}/settings`}
                title="Project Settings"
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </header>
          <TimelineView projectId={projectId} />
        </div>
      ) : (
        <div className="relative flex h-full flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
            <h2 className="text-base font-semibold">{project.name}</h2>
          </header>

          {/* Mode Switch - positioned at topbar/canvas boundary */}
          <div className="absolute left-1/2 top-12 z-10 -translate-x-1/2 -translate-y-1/2">
            <div className="relative flex h-8 rounded-full border bg-muted/80 p-0.5 shadow-sm backdrop-blur-sm">
              <div
                className="absolute inset-y-0.5 w-[calc(50%-2px)] rounded-full bg-background shadow-sm transition-transform duration-[var(--duration-normal)]"
                style={{ transform: 'translateX(calc(100% + 2px))' }}
              />
              <button
                type="button"
                className={cn(
                  'relative z-10 rounded-full px-3 text-xs font-medium transition-colors',
                  'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => handleModeChange('editor')}
              >
                Editor
              </button>
              <button
                type="button"
                className={cn(
                  'relative z-10 rounded-full px-3 text-xs font-medium transition-colors',
                  'text-foreground'
                )}
                onClick={() => handleModeChange('execution')}
              >
                Execution
              </button>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center bg-muted/30 p-8">
            <Card className="w-full max-w-lg">
              <CardContent className="p-6">
                <div className="mb-4 text-center">
                  <h3 className="text-lg font-semibold">Execution Monitor</h3>
                  <p className="text-sm text-muted-foreground">Coming in v2.0</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <Activity className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-sm">Agent started</span>
                    <StatusBadge status="running" />
                  </div>
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <Cpu className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-sm">LLM call: gpt-4</span>
                    <Badge variant="secondary">500 tokens</Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <Search className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-sm">Tool: search_docs</span>
                    <Badge variant="outline">1.2s</Badge>
                  </div>
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <Zap className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-sm">Response generated</span>
                    <Badge>completed</Badge>
                  </div>
                </div>

                <p className="mt-4 text-center text-xs text-muted-foreground">
                  Live trace &middot; Token usage &middot; Latency metrics &middot; Step replay
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
