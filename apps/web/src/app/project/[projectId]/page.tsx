'use client';

import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasWorkspace } from '@/components/canvas';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { ProjectDemoTourOverlay } from '@/components/onboarding/ProjectDemoTourOverlay';
import { ProjectCommunityTab } from '@/components/project/ProjectCommunityTab';
import { ProjectOutputsTab } from '@/components/project/ProjectOutputsTab';
import { ProjectReviewsTab } from '@/components/project/ProjectReviewsTab';
import { ProjectSchemasTab } from '@/components/project/ProjectSchemasTab';
import { ProjectSettingsTab } from '@/components/project/ProjectSettingsTab';
import { ProjectShell } from '@/components/project/ProjectShell';
import { ProjectStateTab } from '@/components/project/ProjectStateTab';
import { ProjectWorkspacesTab } from '@/components/project/ProjectWorkspacesTab';
import {
  getProjectTabSegment,
  type ProjectTabId,
  parseProjectTab,
} from '@/components/project/projectTabModel';
import { getProjectRepoPath } from '@/domain/project/repoPath';
import { toYSchemaValidationSummary } from '@/domain/project/yschemaValidation';
import {
  getProjectDefaultSchemaBinding,
  mergeProjectWorkspaceSchemaBindings,
} from '@/domain/workspaces/schemaBindings';
import { useCanvasDeletionWiring } from '@/hooks/canvas/useCanvasDeletionWiring';
import { useCanvasNodeActions } from '@/hooks/canvas/useCanvasNodeActions';
import {
  COMMIT_CREATED_EVENT,
  COMMITS_BROADCAST_CHANNEL,
  isCommitCreatedForProject,
} from '@/hooks/commits/commitEvents';
import {
  applyIntroDemoCommitToCanvasGraph,
  readIntroDemoLocalCommit,
} from '@/hooks/onboarding/introDemoLocalCommit';
import { useIntroDemoCompletion } from '@/hooks/onboarding/useIntroDemoCompletion';
import { usePinsCrud } from '@/hooks/pins/usePinsCrud';
import { useProjectCrud } from '@/hooks/projects/useProjectCrud';
import { fetchProject } from '@/queries/project';
import { fetchLatestYSchemaValidation, runYSchemaValidation } from '@/queries/yschemaValidation';
import { useCanvasStore } from '@/store/canvasStore';
import { apiProjectToSummary, type ProjectSummary, useProjectStore } from '@/store/projectStore';
import { useProjectWorkspaceSchemaBindingsStore } from '@/store/projectWorkspaceSchemaBindingsStore';
import { isIntroDemoQueryEnabled } from '@/utils/introDemo';
import { recordRecentProjectOpen } from '@/utils/recentProjects';

export default function ProjectDetailPage() {
  return (
    <Suspense>
      <ProjectIdCanonicalRedirect />
    </Suspense>
  );
}

interface ProjectDetailPageContentProps {
  initialTabOverride?: ProjectTabId;
  projectIdOverride?: string;
  surface?: 'canvas' | 'repository';
}

function isNotFoundError(error: Error | null): boolean {
  if (!error) return false;
  const normalized = error.message.toLowerCase();
  return normalized.includes('404') || normalized.includes('not found');
}

function withCurrentQuery(path: string, searchParams: { toString: () => string }) {
  const params = new URLSearchParams(searchParams.toString());
  params.delete('tab');
  params.delete('zoom');
  params.delete('x');
  params.delete('y');
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function getProjectTabPath(project: { id?: string; name: string }, tab: ProjectTabId) {
  const basePath = getProjectRepoPath(project);
  return tab === 'state' ? basePath : `${basePath}/${getProjectTabSegment(tab)}`;
}

function getProjectCanonicalPath(
  project: { id?: string; name: string },
  searchParams: URLSearchParams
) {
  return withCurrentQuery(
    getProjectTabPath(project, parseProjectTab(searchParams.get('tab'))),
    searchParams
  );
}

function hasProjectUiQuery(searchParams: { has: (key: string) => boolean }) {
  return (
    searchParams.has('tab') ||
    searchParams.has('zoom') ||
    searchParams.has('x') ||
    searchParams.has('y')
  );
}

function ProjectIdCanonicalRedirect() {
  const params = useParams<{ projectId?: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = typeof params.projectId === 'string' ? params.projectId : '';
  const projectFromStore = useProjectStore((state) =>
    state.projects.find((item) => item.id === projectId)
  );
  const [lookupError, setLookupError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const replaceWithProject = (project: ProjectSummary) => {
      router.replace(
        getProjectCanonicalPath(project, new URLSearchParams(searchParams.toString()))
      );
    };

    if (projectFromStore) {
      replaceWithProject(projectFromStore);
      return;
    }

    let cancelled = false;
    setLookupError(null);
    fetchProject(projectId)
      .then((detail) => {
        if (!cancelled) replaceWithProject(apiProjectToSummary(detail));
      })
      .catch((err) => {
        if (!cancelled) setLookupError(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      cancelled = true;
    };
  }, [projectFromStore, projectId, router, searchParams]);

  if (lookupError) {
    return (
      <div className="flex h-full flex-col">
        <ErrorMessage error={lookupError} onRetry={() => setLookupError(null)} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <LoadingSpinner message="Opening repository..." />
    </div>
  );
}

export function ProjectDetailPageContent({
  initialTabOverride,
  projectIdOverride,
  surface = 'repository',
}: ProjectDetailPageContentProps = {}) {
  const params = useParams<{ projectId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const routeProjectId = typeof params.projectId === 'string' ? params.projectId : '';
  const projectId = projectIdOverride ?? routeProjectId;

  const searchParams = useSearchParams();
  const isCanvasSurface = surface === 'canvas';
  const activeTab = initialTabOverride ?? parseProjectTab(searchParams.get('tab'));
  const isEmbeddedCanvasSurface =
    !isCanvasSurface && activeTab === 'state' && searchParams.get('view') === 'canvas';
  const isCanvasActive = isCanvasSurface || isEmbeddedCanvasSurface;
  const showIntroDemo = isIntroDemoQueryEnabled(searchParams);
  const introDemoStage = searchParams.get('introDemoStage');
  const projectTourStage = introDemoStage === 'leaf' ? 'leaf' : 'details';
  const [projectTourOpen, setProjectTourOpen] = useState(showIntroDemo);
  const { completeIntroDemo } = useIntroDemoCompletion(projectId);

  useEffect(() => {
    if (showIntroDemo) setProjectTourOpen(true);
  }, [showIntroDemo]);

  const projectFromStore = useProjectStore((state) =>
    state.projects.find((item) => item.id === projectId)
  );
  const projectsInitialized = useProjectStore((state) => state.initialized);
  const projectsLoading = useProjectStore((state) => state.loading);
  const [fetchedProject, setFetchedProject] = useState<ProjectSummary | null>(null);
  const [projectLookupLoading, setProjectLookupLoading] = useState(false);
  const [projectLookupError, setProjectLookupError] = useState<Error | null>(null);
  const [yschemaValidation, setYschemaValidation] = useState(() =>
    toYSchemaValidationSummary(null)
  );
  const [yschemaValidationRunning, setYschemaValidationRunning] = useState(false);
  const [yschemaValidationError, setYschemaValidationError] = useState<string | null>(null);
  const projectBase = projectFromStore ?? fetchedProject;
  const liveSchemaBindings = useProjectWorkspaceSchemaBindingsStore(
    (state) => state.bindingsByProjectId[projectId]
  );
  const schemaBindings = useMemo(
    () =>
      mergeProjectWorkspaceSchemaBindings(
        {
          projectDefault: getProjectDefaultSchemaBinding(projectBase?.metadata),
          byWorkspaceId: {},
        },
        liveSchemaBindings
      ),
    [liveSchemaBindings, projectBase?.metadata]
  );
  const project = useMemo(
    () => (projectBase ? { ...projectBase, yschemaValidation } : null),
    [projectBase, yschemaValidation]
  );
  const { list: fetchProjects } = useProjectCrud();
  const { fetch: fetchPins } = usePinsCrud();
  const { load: loadCanvas } = useCanvasNodeActions();
  useCanvasDeletionWiring(isCanvasActive);

  useEffect(() => {
    if (project) {
      recordRecentProjectOpen(project.id);
    }
  }, [project?.id]);

  // Canvas store for loading project data
  const canvasLoading = useCanvasStore((state) => state.loading);
  const canvasError = useCanvasStore((state) => state.loadError);
  const loadedProjectId = useCanvasStore((state) => state.projectId);
  const canvasNodeCount = useCanvasStore((state) => state.nodes.length);
  const closeNodeModal = useCanvasStore((state) => state.closeNodeModal);

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
  const selectedFromUrl = useRef(showIntroDemo ? null : searchParams.get('selected'));
  useEffect(() => {
    if (isCanvasActive && selectedFromUrl.current && !canvasLoading && !canvasError) {
      useCanvasStore.getState().openNodeModal(selectedFromUrl.current, 'commit');
      selectedFromUrl.current = null;
    }
  }, [canvasLoading, canvasError, isCanvasActive]);
  useEffect(() => {
    if (!isCanvasActive || !showIntroDemo) return;
    selectedFromUrl.current = null;
    closeNodeModal();
  }, [closeNodeModal, isCanvasActive, showIntroDemo]);

  useEffect(() => {
    if (isCanvasSurface || !hasProjectUiQuery(searchParams)) return;
    if (searchParams.has('tab') && !project) return;

    const nextPath =
      project && searchParams.has('tab')
        ? getProjectCanonicalPath(project, new URLSearchParams(searchParams.toString()))
        : withCurrentQuery(pathname, searchParams);
    router.replace(nextPath, { scroll: false });
  }, [isCanvasSurface, pathname, project, router, searchParams]);

  const handleViewportChange = useCallback((_viewport: { x: number; y: number; zoom: number }) => {
    // Viewport state is intentionally local to keep owner/repo URLs clean.
  }, []);

  // Fetch projects list if not initialized (handles direct URL access)
  useEffect(() => {
    if (!projectsInitialized && !projectsLoading) {
      void fetchProjects();
    }
  }, [projectsInitialized, projectsLoading, fetchProjects]);

  useEffect(() => {
    if (!projectsInitialized || projectsLoading || !projectId) return;
    if (projectFromStore) {
      setFetchedProject(null);
      setProjectLookupError(null);
      setProjectLookupLoading(false);
      return;
    }

    let cancelled = false;
    setProjectLookupLoading(true);
    setProjectLookupError(null);

    fetchProject(projectId)
      .then((detail) => {
        if (cancelled) return;
        setFetchedProject(apiProjectToSummary(detail));
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchedProject(null);
        setProjectLookupError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setProjectLookupLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, projectFromStore, projectsInitialized, projectsLoading]);

  useEffect(() => {
    if (isCanvasSurface || !projectBase?.id) {
      setYschemaValidation(null);
      return;
    }

    let cancelled = false;
    setYschemaValidation(null);

    fetchLatestYSchemaValidation(projectBase.id)
      .then((run) => {
        if (!cancelled) setYschemaValidation(toYSchemaValidationSummary(run));
      })
      .catch(() => {
        if (!cancelled) setYschemaValidation(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isCanvasSurface, projectBase?.id]);

  const handleRunYSchemaValidation = useCallback(
    async (commitHash: string, schemaName: string) => {
      if (!projectBase?.id) return;
      setYschemaValidationRunning(true);
      setYschemaValidationError(null);

      try {
        const run = await runYSchemaValidation(projectBase.id, {
          commit_hash: commitHash,
          schema_name: schemaName,
        });
        setYschemaValidation(toYSchemaValidationSummary(run));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Validation run failed';
        setYschemaValidationError(message);
      } finally {
        setYschemaValidationRunning(false);
      }
    },
    [projectBase?.id]
  );

  // Load fresh project data whenever this page is entered. The canvas store
  // persists across routes, so returning from Chat after a commit must not
  // reuse a stale draft/staging view for the same project.
  useEffect(() => {
    if (isCanvasActive && projectId) {
      void loadCanvas(projectId);
    }
  }, [isCanvasActive, projectId, loadCanvas]);

  useEffect(() => {
    if (
      !isCanvasActive ||
      !showIntroDemo ||
      canvasLoading ||
      canvasError ||
      loadedProjectId !== projectId
    )
      return;
    const localCommit = readIntroDemoLocalCommit(projectId);
    if (!localCommit) return;

    useCanvasStore.setState((state) => {
      if (state.projectId !== projectId) return {};
      const patched = applyIntroDemoCommitToCanvasGraph({
        nodes: state.nodes,
        edges: state.edges,
        commit: localCommit,
      });
      if (!patched) return {};
      return {
        nodes: patched.nodes,
        edges: patched.edges,
        hasMainCommit: true,
        latestMainCommitId:
          localCommit.branch === 'main' ? localCommit.hash : state.latestMainCommitId,
      };
    });
  }, [
    canvasError,
    canvasLoading,
    canvasNodeCount,
    isCanvasActive,
    loadedProjectId,
    projectId,
    showIntroDemo,
  ]);

  // Refresh project data when page becomes visible OR on a 30s polling interval.
  // This ensures canvas stays up-to-date when commits are created from Chat.
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    if (!isCanvasActive || !projectId) return;

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

    const refreshForCommit = (payload: unknown) => {
      if (!isCommitCreatedForProject(payload, projectId)) return;
      lastRefreshRef.current = 0; // bypass throttle for explicit commit signals
      refreshIfStale();
    };

    const onCommitCreated = (event: Event) => {
      refreshForCommit((event as CustomEvent<unknown>).detail);
    };
    window.addEventListener(COMMIT_CREATED_EVENT, onCommitCreated);

    // Poll every 30s while page is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refreshIfStale();
    }, 30_000);

    // Listen for commit broadcasts from chat page — refresh immediately
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(COMMITS_BROADCAST_CHANNEL);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        refreshForCommit(event.data);
      };
    } catch {
      // BroadcastChannel not supported
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener(COMMIT_CREATED_EVENT, onCommitCreated);
      clearInterval(interval);
      channel?.close();
    };
  }, [isCanvasActive, projectId, loadCanvas]);

  // Initialize pins store for the project
  useEffect(() => {
    if (isCanvasActive && projectId) {
      void fetchPins(projectId);
    }
  }, [isCanvasActive, projectId, fetchPins]);

  // Show loading while projects list is still loading, or while confirming a
  // direct/new project URL that is not present in the list cache yet.
  const projectLookupPending =
    projectsInitialized &&
    !projectsLoading &&
    !projectFromStore &&
    !fetchedProject &&
    !projectLookupError;

  if (!projectsInitialized || projectsLoading || projectLookupLoading || projectLookupPending) {
    return (
      <div className="flex h-full flex-col">
        <LoadingSpinner message="Loading project..." />
      </div>
    );
  }

  if (projectLookupError && !isNotFoundError(projectLookupError)) {
    return (
      <div className="flex h-full flex-col">
        <ErrorMessage
          error={projectLookupError}
          onRetry={() => {
            setProjectLookupLoading(true);
            setProjectLookupError(null);
            setFetchedProject(null);
            void fetchProject(projectId)
              .then((detail) => setFetchedProject(apiProjectToSummary(detail)))
              .catch((err) =>
                setProjectLookupError(err instanceof Error ? err : new Error(String(err)))
              )
              .finally(() => setProjectLookupLoading(false));
          }}
        />
      </div>
    );
  }

  // Show not-found page only when a single-project lookup confirms it.
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
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  if (isCanvasSurface) {
    if (canvasLoading || loadedProjectId !== projectId) {
      return (
        <div className="flex h-full flex-col">
          <LoadingSpinner message="Loading project data..." />
        </div>
      );
    }

    if (canvasError) {
      return (
        <div className="flex h-full flex-col">
          <ErrorMessage
            error={canvasError}
            onRetry={() => projectId && void loadCanvas(projectId)}
          />
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col">
        <CanvasWorkspace
          key={projectId}
          projectName={project.name}
          stateHref={getProjectRepoPath(project)}
          initialViewport={initialViewport}
          onViewportChange={handleViewportChange}
        />
        <ProjectDemoTourOverlay
          open={projectTourOpen}
          onClose={() => setProjectTourOpen(false)}
          onDone={() => setProjectTourOpen(false)}
          onSkip={() => void completeIntroDemo()}
          interactionMode="guided"
          stage={projectTourStage}
        />
      </div>
    );
  }

  const renderStateTab = () => {
    return (
      <ProjectStateTab
        key={projectId}
        onRunValidation={handleRunYSchemaValidation}
        projectId={projectId}
        projectName={project.name}
        validation={project.yschemaValidation}
        validationError={yschemaValidationError}
        validationRunning={yschemaValidationRunning}
      />
    );
  };

  const activeContent = (() => {
    switch (activeTab) {
      case 'schemas':
        return (
          <ProjectSchemasTab
            projectId={projectId}
            projectMetadata={projectBase?.metadata}
            schemaBindings={schemaBindings}
          />
        );
      case 'workspaces':
        return <ProjectWorkspacesTab projectId={projectId} schemaBindings={schemaBindings} />;
      case 'reviews':
        return <ProjectReviewsTab projectId={projectId} />;
      case 'outputs':
        return <ProjectOutputsTab key={projectId} projectId={projectId} />;
      case 'community':
        return <ProjectCommunityTab />;
      case 'settings':
        return <ProjectSettingsTab project={project} />;
      default:
        return renderStateTab();
    }
  })();

  return (
    <>
      <ProjectShell activeTab={activeTab} project={project}>
        {activeContent}
      </ProjectShell>
      {isEmbeddedCanvasSurface ? (
        <ProjectDemoTourOverlay
          interactionMode="guided"
          onClose={() => setProjectTourOpen(false)}
          onDone={() => setProjectTourOpen(false)}
          onSkip={() => void completeIntroDemo()}
          open={projectTourOpen}
          stage={projectTourStage}
        />
      ) : null}
    </>
  );
}
