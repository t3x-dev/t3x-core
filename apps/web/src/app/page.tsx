'use client';

import { motion } from 'framer-motion';
import { FolderOpen, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type MouseEvent, useEffect } from 'react';
import { ErrorMessage } from '@/components/ApiStatus';
import { Badge } from '@/components/ui/badge';
import { AnimatedButton } from '@/components/ui/button';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { Card, CardContent } from '@/components/ui/card';
import { SkeletonProject } from '@/components/ui/skeleton';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { staggerContainer, staggerItem, springConfig, reducedMotion, noHover, noTap } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { useProjectStore } from '@/store/projectStore';

export default function SemanticLedgerPage() {
  const router = useRouter();
  const resetCanvas = useCanvasStore((state) => state.resetToSingleConversation);
  const { projects, loading, error, initialized, fetchProjects, addProject, deleteProject } =
    useProjectStore();
  const prefersReducedMotion = useReducedMotion();

  // Select animation variants based on user preference
  const containerVariants = prefersReducedMotion ? reducedMotion.staggerContainer : staggerContainer;
  const itemVariants = prefersReducedMotion ? reducedMotion.staggerItem : staggerItem;
  const hoverAnimation = prefersReducedMotion ? noHover : { scale: 1.01, transition: springConfig.smooth };
  const tapAnimation = prefersReducedMotion ? noTap : { scale: 0.995 };

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
      <div className="flex h-full flex-col gap-6 overflow-auto p-6">
        <header className="flex items-center justify-between">
          <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
        </header>
        <motion.div
          className="flex flex-col gap-3"
          variants={containerVariants}
          initial="initial"
          animate="animate"
        >
          {[1, 2, 3].map((i) => (
            <motion.div key={i} variants={itemVariants}>
              <SkeletonProject />
            </motion.div>
          ))}
        </motion.div>
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
      <motion.header
        className="flex items-center justify-between"
        initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3, ease: [0, 0, 0.2, 1] }}
      >
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <ShimmerButton
          onClick={handleCreateProject}
          background="linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)"
          shimmerColor="#ffffff"
          className="gap-2 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          New Project
        </ShimmerButton>
      </motion.header>

      <motion.div
        className="flex flex-col gap-3"
        variants={containerVariants}
        initial="initial"
        animate="animate"
      >
        {projects.length === 0 && (
          <motion.div variants={itemVariants}>
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <FolderOpen className="h-6 w-6 text-primary" />
                </div>
                <p className="text-base font-medium text-foreground">No projects yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create one to start mapping conversations and drafts
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
        {projects.map((project) => (
          <motion.div key={project.id} variants={itemVariants}>
            <Link href={`/project/${project.id}`} className="group block">
              <motion.div
                whileHover={hoverAnimation}
                whileTap={tapAnimation}
              >
                <Card className="transition-colors hover:border-primary/50">
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
                          project.status === 'active' &&
                            'border-green-500/30 bg-green-500/10 text-green-600',
                          project.status === 'draft' &&
                            'border-amber-500/30 bg-amber-500/10 text-amber-600',
                          project.status === 'paused' &&
                            'border-gray-500/30 bg-gray-500/10 text-gray-600'
                        )}
                      >
                        {project.status}
                      </Badge>
                      <span className="hidden md:inline text-xs">{project.updatedAt}</span>
                    </div>

                    <AnimatedButton
                      variant="ghost"
                      size="icon-sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={(event) => handleDeleteProject(event as unknown as MouseEvent, project.id)}
                      aria-label={`Delete ${project.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </AnimatedButton>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
