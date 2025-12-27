'use client';

import { useEffect, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { LoadingSpinner, ErrorMessage } from '@/components/ApiStatus';
import { useCanvasStore } from '@/store/canvasStore';
import { useProjectStore } from '@/store/projectStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function SemanticLedgerPage() {
  const router = useRouter();
  const resetCanvas = useCanvasStore((state) => state.resetToSingleConversation);
  const { projects, loading, error, initialized, fetchProjects, addProject, deleteProject } =
    useProjectStore();

  // Fetch projects on mount
  useEffect(() => {
    if (!initialized) {
      fetchProjects();
    }
  }, [initialized, fetchProjects]);

  const handleCreateProject = async () => {
    const name = window.prompt('Name this project', `Project ${projects.length + 1}`);
    if (name === null) {
      return;
    }
    const project = await addProject(name);
    resetCanvas();
    router.push(`/project/${project.id}`);
  };

  const handleDeleteProject = async (event: MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();

    const project = projects.find((p) => p.id === id);
    const projectName = project?.name || 'this project';

    // Confirm deletion
    const confirmed = window.confirm(
      `Are you sure you want to delete "${projectName}"?\n\nThis will permanently delete all associated conversations, turns, commits, and other data.`
    );

    if (!confirmed) {
      return;
    }

    await deleteProject(id);
  };

  if (loading && !initialized) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <LoadingSpinner message="Loading projects..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <ErrorMessage error={error} onRetry={fetchProjects} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <Button onClick={handleCreateProject}>
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </header>

      <div className="flex flex-col gap-3">
        {projects.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-lg font-medium text-muted-foreground">No projects yet.</p>
              <p className="text-sm text-muted-foreground">
                Create one to start mapping conversations and drafts.
              </p>
            </CardContent>
          </Card>
        )}
        {projects.map((project) => (
          <Link key={project.id} href={`/project/${project.id}`} className="group">
            <Card className="transition-all hover:border-primary/50 hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{project.name}</h3>
                  <p className="text-sm text-muted-foreground truncate">{project.description}</p>
                </div>

                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="hidden sm:inline">
                    {project.nodes} turns · {project.drafts} conversations
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      project.status === 'active' && 'border-green-500/30 bg-green-500/10 text-green-600',
                      project.status === 'draft' && 'border-amber-500/30 bg-amber-500/10 text-amber-600',
                      project.status === 'paused' && 'border-gray-500/30 bg-gray-500/10 text-gray-600'
                    )}
                  >
                    {project.status}
                  </Badge>
                  <span className="hidden md:inline text-xs">{project.updatedAt}</span>
                </div>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={(event) => handleDeleteProject(event, project.id)}
                  aria-label={`Delete ${project.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
