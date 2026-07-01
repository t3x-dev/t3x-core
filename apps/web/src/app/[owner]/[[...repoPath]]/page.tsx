'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useEffect, useMemo } from 'react';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { ProjectDetailPageContent } from '@/app/project/[projectId]/page';
import { NewRepositoryPage } from '@/components/project/NewRepositoryPage';
import { ProjectDirectoryPage } from '@/components/project/ProjectDirectoryPage';
import { parseProjectTab } from '@/components/project/projectTabModel';
import { DEFAULT_OWNER_SLUG, toRepoSlug } from '@/domain/project/repoPath';
import { useProjectCrud } from '@/hooks/projects/useProjectCrud';
import { useProjectStore } from '@/store/projectStore';

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function OwnerRepoProjectPageContent() {
  const params = useParams<{ owner?: string | string[]; repoPath?: string[] }>();
  const ownerSlug = firstParam(params.owner).toLowerCase();
  const repoSegments = params.repoPath ?? [];
  const repoSlug = (repoSegments[0] ?? '').toLowerCase();
  const initialTab = parseProjectTab(repoSegments[1] ?? null);
  const isDefaultOwner = ownerSlug === DEFAULT_OWNER_SLUG;
  const isOrganizationDirectory = isDefaultOwner && repoSegments.length === 0;
  const isNewRepositoryPage = isDefaultOwner && repoSlug === 'new' && repoSegments.length === 1;
  const projects = useProjectStore((state) => state.projects);
  const initialized = useProjectStore((state) => state.initialized);
  const loading = useProjectStore((state) => state.loading);
  const error = useProjectStore((state) => state.error);
  const { list: fetchProjects } = useProjectCrud();

  useEffect(() => {
    if (isOrganizationDirectory || isNewRepositoryPage) return;
    if (!initialized && !loading) void fetchProjects();
  }, [fetchProjects, initialized, isNewRepositoryPage, isOrganizationDirectory, loading]);

  const project = useMemo(() => {
    if (ownerSlug !== DEFAULT_OWNER_SLUG || !repoSlug) return undefined;
    return projects.find((item) => toRepoSlug(item.name, item.id) === repoSlug);
  }, [ownerSlug, projects, repoSlug]);

  if (isOrganizationDirectory) {
    return <ProjectDirectoryPage />;
  }

  if (isNewRepositoryPage) {
    return <NewRepositoryPage />;
  }

  if (!initialized || loading) {
    return (
      <div className="flex h-full flex-col">
        <LoadingSpinner message="Loading repository..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <ErrorMessage error={error} onRetry={() => void fetchProjects()} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="rounded-2xl bg-muted/50 p-8 text-center backdrop-blur-sm">
          <p className="text-lg font-semibold text-foreground">Repository not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The repository{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              /{ownerSlug || DEFAULT_OWNER_SLUG}/{repoSlug || 'repo'}
            </code>{' '}
            does not exist or was deleted.
          </p>
          <Link
            className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            href="/"
          >
            Back to {DEFAULT_OWNER_SLUG}
          </Link>
        </div>
      </div>
    );
  }

  return <ProjectDetailPageContent initialTabOverride={initialTab} projectIdOverride={project.id} />;
}

export default function OwnerRepoProjectPage() {
  return (
    <Suspense fallback={null}>
      <OwnerRepoProjectPageContent />
    </Suspense>
  );
}
