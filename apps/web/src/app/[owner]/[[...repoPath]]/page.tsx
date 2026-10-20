'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { ProjectDetailPageContent } from '@/app/project/[projectId]/page';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { NewRepositoryPage } from '@/components/project/NewRepositoryPage';
import { OrganizationSettingsPage } from '@/components/project/OrganizationSettingsPage';
import { ProjectDirectoryPage } from '@/components/project/ProjectDirectoryPage';
import { ProjectShell } from '@/components/project/ProjectShell';
import { parseProjectTab, resolveProjectRouteTab } from '@/components/project/projectTabModel';
import { RepositoryNestedPage } from '@/components/project/RepositoryNestedPage';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import {
  isSupportedRepositorySuffix,
  repositoryLocation,
} from '@/domain/project/repositoryLocation';
import { useRepositoryAddress } from '@/hooks/projects/useRepositoryAddress';
import { useProjectStore } from '@/store/projectStore';

function OwnerRepoProjectPageContent() {
  const params = useParams<{ owner: string; repoPath?: string[] }>();
  const owner = params.owner;
  const segments = params.repoPath ?? [];
  const name = segments[0] ?? '';
  const directory = !name;
  const creating = name.toLowerCase() === 'new' && segments.length === 1;
  const organizationSettings =
    owner.toLowerCase() === 't3x-dev' && name.toLowerCase() === 'settings' && segments.length === 1;
  const special = directory || creating || organizationSettings;
  const router = useRouter();
  const pathname = usePathname();
  // Preserve the URL's encoded suffix: encoding route params again can turn
  // %3A into %253A on every canonical redirect and prevent the route from settling.
  const suffixSegments = pathname.split('/').slice(3);
  const suffix = suffixSegments.length ? `/${suffixSegments.join('/')}` : '';
  const repositoryPath = pathname.split('/').slice(0, 3).join('/');
  const knownProject = useProjectStore(
    (state) =>
      Object.values(state.details).find((project) => project.canonical_path === repositoryPath) ??
      state.projects.find((project) => project.canonical_path === repositoryPath)
  );
  const view = segments[1] ?? 'state';
  const query = useSearchParams().toString();
  const { current, retry } = useRepositoryAddress(owner, name, !special);
  const address = current?.address;
  const supported = isSupportedRepositorySuffix(suffix);
  useEffect(() => {
    if (!address || !supported) return;
    const target = repositoryLocation(
      address.canonical_path ?? getProjectIdRepoPath(address.project_id),
      suffix,
      query,
      window.location.hash
    );
    const here = `${pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    if (target !== here) router.replace(target, { scroll: false });
  }, [address, supported, suffix, pathname, query, router]);

  if (directory) return <ProjectDirectoryPage ownerSlug={owner} />;
  if (creating) return <NewRepositoryPage />;
  if (organizationSettings) return <OrganizationSettingsPage ownerSlug={owner} />;
  if (!current) {
    const loading = <LoadingSpinner message="Loading repository..." />;
    // Keep only the known header during navigation; repository content still
    // waits for a fresh address lookup and its access checks.
    return knownProject ? (
      <ProjectShell
        activeTab={resolveProjectRouteTab(segments[1] ?? null, new URLSearchParams(query))}
        branch={new URLSearchParams(query).get('branch')}
        settingsReturnTo={`${pathname}${query ? `?${query}` : ''}`}
        project={knownProject}
      >
        {loading}
      </ProjectShell>
    ) : (
      loading
    );
  }
  if (current.error) return <ErrorMessage error={current.error} onRetry={retry} />;
  if (!address) return null;
  if (!supported)
    return (
      <div className="p-8">
        <p>Repository view not found</p>
        <Link href={address.canonical_path ?? getProjectIdRepoPath(address.project_id)}>
          Back to repository
        </Link>
      </div>
    );
  if (!address.canonical_path)
    return <LoadingSpinner message="Opening repository by ID; its name needs migration." />;
  if (
    [
      'settings',
      'diff',
      'merge',
      'changes',
      'leaf',
      'history',
      'knowledge-graph',
      'sources',
    ].includes(view)
  )
    return (
      <RepositoryNestedPage
        key={address.project_id}
        projectId={address.project_id}
        segments={segments.slice(1)}
      />
    );
  return (
    <ProjectDetailPageContent
      key={address.project_id}
      initialTabOverride={parseProjectTab(view)}
      ownerSlugOverride={address.namespace ?? undefined}
      projectIdOverride={address.project_id}
    />
  );
}

export default function OwnerRepoProjectPage() {
  return (
    <Suspense fallback={null}>
      <OwnerRepoProjectPageContent />
    </Suspense>
  );
}
