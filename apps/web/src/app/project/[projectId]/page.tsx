'use client';

import { Activity, Badge as BadgeIcon, Clock, Cpu, Search, Zap } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorMessage, LoadingSpinner } from '@/components/ApiStatus';
import { CanvasWorkspace } from '@/components/canvas';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { usePinsStore } from '@/store/pinsStore';
import { useProjectStore } from '@/store/projectStore';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const project = useProjectStore((state) => state.projects.find((item) => item.id === projectId));
  const projectsInitialized = useProjectStore((state) => state.initialized);
  const projectsLoading = useProjectStore((state) => state.loading);
  const [mode, setMode] = useState<'editor' | 'execution'>('editor');

  // Canvas store for loading project data
  const canvasLoading = useCanvasStore((state) => state.loading);
  const canvasError = useCanvasStore((state) => state.loadError);
  const loadedProjectId = useCanvasStore((state) => state.projectId);

  // Load project data when entering the page
  useEffect(() => {
    if (projectId && projectId !== loadedProjectId) {
      useCanvasStore.getState().loadProjectData(projectId);
    }
  }, [projectId, loadedProjectId]);

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

  return (
    <div className="flex h-full flex-col">
      {mode === 'editor' ? (
        <CanvasWorkspace projectName={project.name} mode={mode} onModeChange={setMode} />
      ) : (
        <div className="relative flex h-full flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
            <h2 className="text-base font-semibold">{project.name}</h2>
          </header>

          {/* Mode Switch - positioned at topbar/canvas boundary */}
          <div className="absolute left-1/2 top-12 z-10 -translate-x-1/2 -translate-y-1/2">
            <div className="relative flex h-8 rounded-full border bg-muted/80 p-0.5 shadow-sm backdrop-blur-sm">
              <div
                className="absolute inset-y-0.5 w-[calc(50%-2px)] rounded-full bg-background shadow-sm transition-transform duration-200"
                style={{ transform: 'translateX(calc(100% + 2px))' }}
              />
              <button
                className={cn(
                  'relative z-10 rounded-full px-3 text-xs font-medium transition-colors',
                  'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setMode('editor')}
              >
                Editor
              </button>
              <button
                className={cn(
                  'relative z-10 rounded-full px-3 text-xs font-medium transition-colors',
                  'text-foreground'
                )}
                onClick={() => setMode('execution')}
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

                <div className="space-y-3 opacity-60">
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <Activity className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-sm">Agent started</span>
                    <Badge
                      variant="outline"
                      className="border-green-500/30 bg-green-500/10 text-green-600"
                    >
                      running
                    </Badge>
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
