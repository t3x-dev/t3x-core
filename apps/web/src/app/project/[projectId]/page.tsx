'use client';

import { redirect, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorMessage, LoadingSpinner } from '@/components/ApiStatus';
import { CanvasWorkspace } from '@/components/canvas';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { useProjectStore } from '@/store/projectStore';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const project = useProjectStore((state) => state.projects.find((item) => item.id === projectId));
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

  if (!project) {
    redirect('/');
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

          <div className="flex flex-1 items-center justify-center bg-muted/30 text-muted-foreground">
            <p>Execution log will surface here once the project runs.</p>
          </div>
        </div>
      )}
    </div>
  );
}
