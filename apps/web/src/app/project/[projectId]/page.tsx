'use client';

import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasWorkspace } from '@/components/canvas';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { ProjectDemoTourOverlay } from '@/components/onboarding/ProjectDemoTourOverlay';
import { ProjectCommunityTab } from '@/components/project/ProjectCommunityTab';
import { ProjectEmptyState } from '@/components/project/ProjectEmptyState';
import { ProjectOutputsTab } from '@/components/project/ProjectOutputsTab';
import { ProjectReviewsTab } from '@/components/project/ProjectReviewsTab';
import { ProjectSchemasTab } from '@/components/project/ProjectSchemasTab';
import { ProjectSettingsTab } from '@/components/project/ProjectSettingsTab';
import { ProjectShell } from '@/components/project/ProjectShell';
import { ProjectStateTab } from '@/components/project/ProjectStateTab';
import { ProjectWorkspacesTab } from '@/components/project/ProjectWorkspacesTab';
import { type ProjectTabId, parseProjectTab } from '@/components/project/projectTabModel';
import { getProjectRepoPath } from '@/domain/project/repoPath';
import { useCanvasDeletionWiring } from '@/hooks/canvas/useCanvasDeletionWiring';
import { useCanvasNodeActions } from '@/hooks/canvas/useCanvasNodeActions';
import {
  applyIntroDemoCommitToCanvasGraph,
  readIntroDemoLocalCommit,
} from '@/hooks/onboarding/introDemoLocalCommit';
import { useIntroDemoCompletion } from '@/hooks/onboarding/useIntroDemoCompletion';
import { usePinsCrud } from '@/hooks/pins/usePinsCrud';
import { useProjectCrud } from '@/hooks/projects/useProjectCrud';
import { fetchProject } from '@/queries/project';
import { useCanvasStore } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { apiProjectToSummary, type ProjectSummary, useProjectStore } from '@/store/projectStore';
import { isIntroDemoQueryEnabled } from '@/utils/introDemo';

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
  showChatSidebarToggle?: boolean;
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
  return tab === 'state' ? basePath : `${basePath}/${tab}`;
}

function getProjectCanonicalPath(project: { id?: string; name: string }, searchParams: URLSearchParams) {
  return withCurrentQuery(getProjectTabPath(project, parseProjectTab(searchParams.get('tab'))), searchParams);
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
      router.replace(getProjectCanonicalPath(project, new URLSearchParams(searchParams.toString())));
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
  showChatSidebarToggle = false,
}: ProjectDetailPageContentProps = {}) {
  const params = useParams<{ projectId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const routeProjectId = typeof params.projectId === 'string' ? params.projectId : '';
  const projectId = projectIdOverride ?? routeProjectId;

  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ProjectTabId>(() =>
    initialTabOverride ?? parseProjectTab(searchParams.get('tab'))
  );
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
  const project = projectFromStore ?? fetchedProject;
  const { list: fetchProjects } = useProjectCrud();
  const { fetch: fetchPins } = usePinsCrud();
  const { load: loadCanvas } = useCanvasNodeActions();
  useCanvasDeletionWiring();

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
    if (selectedFromUrl.current && !canvasLoading && !canvasError) {
      useCanvasStore.getState().openNodeModal(selectedFromUrl.current, 'commit');
      selectedFromUrl.current = null;
    }
  }, [canvasLoading, canvasError]);
  useEffect(() => {
    if (!showIntroDemo) return;
    selectedFromUrl.current = null;
    closeNodeModal();
  }, [closeNodeModal, showIntroDemo]);

  useEffect(() => {
    if (!hasProjectUiQuery(searchParams)) return;
    if (searchParams.has('tab') && !project) return;

    const nextPath =
      project && searchParams.has('tab')
        ? getProjectCanonicalPath(project, new URLSearchParams(searchParams.toString()))
        : withCurrentQuery(pathname, searchParams);
    router.replace(nextPath, { scroll: false });
  }, [pathname, project, router, searchParams]);

  const handleProjectTabChange = useCallback(
    (nextTab: ProjectTabId) => {
      setActiveTab(nextTab);
      if (project) router.push(getProjectTabPath(project, nextTab), { scroll: false });
    },
    [project, router]
  );

  const handleViewportChange = useCallback((_viewport: { x: number; y: number; zoom: number }) => {
    // Viewport state is intentionally local to keep owner/repo URLs clean.
  }, []);

  const goToProjectChat = useCallback(() => {
    useChatStore.getState().setActiveConversation(null, projectId);
    router.push(`/chat/new?projectId=${encodeURIComponent(projectId)}`);
  }, [projectId, router]);

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

  // Load fresh project data whenever this page is entered. The canvas store
  // persists across routes, so returning from Chat after a commit must not
  // reuse a stale draft/staging view for the same project.
  useEffect(() => {
    if (projectId) {
      void loadCanvas(projectId);
    }
  }, [projectId, loadCanvas]);

  useEffect(() => {
    if (!showIntroDemo || canvasLoading || canvasError || loadedProjectId !== projectId) return;
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
  }, [canvasError, canvasLoading, canvasNodeCount, loadedProjectId, projectId, showIntroDemo]);

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

  const renderStateTab = () => {
    if (canvasLoading) {
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

    const isEmptyAfterLoad = loadedProjectId === projectId && canvasNodeCount === 0;
    if (isEmptyAfterLoad) {
      const hasConversations = (project.drafts ?? 0) > 0;
      return (
        <ProjectEmptyState
          description={
            hasConversations
              ? 'Review existing sources in a workspace, then commit structured state.'
              : 'Create a workspace from sources, then commit it to populate State.'
          }
          onAddSource={goToProjectChat}
          onCreateWorkspace={() => handleProjectTabChange('workspaces')}
          title="No committed state yet"
        />
      );
    }

    return (
      <ProjectStateTab>
        <CanvasWorkspace
          key={projectId}
          projectName={project.name}
          showChatSidebarToggle={showChatSidebarToggle}
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
      </ProjectStateTab>
    );
  };

  const activeContent = (() => {
    switch (activeTab) {
      case 'schemas':
        return <ProjectSchemasTab projectId={projectId} />;
      case 'workspaces':
        return <ProjectWorkspacesTab projectId={projectId} />;
      case 'reviews':
        return <ProjectReviewsTab />;
      case 'outputs':
        return <ProjectOutputsTab />;
      case 'community':
        return <ProjectCommunityTab />;
      case 'settings':
        return <ProjectSettingsTab />;
      default:
        return renderStateTab();
    }
  })();

  return (
    <ProjectShell activeTab={activeTab} onTabChange={handleProjectTabChange} project={project}>
      {activeContent}
    </ProjectShell>
  );
}
