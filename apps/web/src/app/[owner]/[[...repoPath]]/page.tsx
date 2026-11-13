'use client';

import Link from 'next/link';
import { notFound, useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { ProjectDetailPageContent } from '@/app/project/[projectId]/page';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { NewRepositoryPage } from '@/components/project/NewRepositoryPage';
import { OrganizationSettingsPage } from '@/components/project/OrganizationSettingsPage';
import { ProjectDirectoryPage } from '@/components/project/ProjectDirectoryPage';
import { ProjectShell } from '@/components/project/ProjectShell';
import { Button } from '@/components/ui/button';
import { parseProjectTab, resolveProjectRouteTab } from '@/components/project/projectTabModel';
import { RepositoryNestedPage } from '@/components/project/RepositoryNestedPage';
import { numberedRepositoryObject, repositoryObjectHref } from '@/domain/project/objectLocation';
import { getProjectIdRepoPath, workspaceBranchFromSuffix } from '@/domain/project/repoPath';
import {
  isRetiredRepositoryLocation,
  isSupportedRepositorySuffix,
  repositoryLocation,
} from '@/domain/project/repositoryLocation';
import { useRepositoryAddress } from '@/hooks/projects/useRepositoryAddress';
import { useRepositoryObjectAddress } from '@/hooks/projects/useRepositoryObjectAddress';
import { useProjectStore } from '@/store/projectStore';
import { carryRepositorySettingsReturn } from '@/utils/repositorySettingsReturn';

function OwnerRepoProjectPageContent() {
  const params = useParams<{ owner: string; repoPath?: string[] }>();
  const pathname = usePathname();
  const owner = params.owner;
  const segments = params.repoPath ?? [];
  const name = segments[0] ?? '';
  const directory = !name;
  const creating = name.toLowerCase() === 'new' && segments.length === 1;
  const organizationSettings =
    owner.toLowerCase() === 't3x-dev' && name.toLowerCase() === 'settings' && segments.length === 1;
  const special = directory || creating || organizationSettings;
  const router = useRouter();
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
  const workspaceBranch = workspaceBranchFromSuffix(suffix);
  const numbered = numberedRepositoryObject(suffix);
  const view =
    workspaceBranch || numbered?.section === 'reviews'
      ? 'workspaces'
      : numbered?.section === 'commits'
        ? 'state'
        : (segments[1] ?? 'state');
  const query = useSearchParams().toString();
  const { current, retry } = useRepositoryAddress(owner, name, !special);
  const address = current?.address;
  const supported = isSupportedRepositorySuffix(suffix);
  const search = new URLSearchParams(query);
  const legacyView = segments[1] ? view : (search.get('tab') ?? view);
  const legacySnapshot =
    legacyView === 'workspaces' && search.get('reviewPane') !== 'checks'
      ? search.get('reviewSnapshot')
      : null;
  const legacyCommit =
    legacyView === 'state' || legacyView === 'history' ? search.get('commit') : null;
  const exactSnapshot =
    legacySnapshot && /^rvs_[0-9a-f]{32}$/.test(legacySnapshot) ? legacySnapshot : undefined;
  const exactCommit =
    legacyCommit && /^sha256:[0-9a-f]{64}$/.test(legacyCommit) ? legacyCommit : undefined;
  const object = useRepositoryObjectAddress(
    supported && address?.canonical_path ? address.project_id : undefined,
    numbered?.kind ?? (exactSnapshot ? 'review' : 'commit'),
    numbered?.number ?? exactSnapshot ?? exactCommit
  );
  let target =
    address && supported
      ? repositoryLocation(
          address.canonical_path ?? getProjectIdRepoPath(address.project_id),
          suffix,
          query,
          '',
          repositoryPath
        )
      : null;
  if (target && address?.canonical_path && !numbered && object.data) {
    if (exactSnapshot && object.data.workspaceId === search.get('workspace')) {
      target = repositoryObjectHref(address.canonical_path, 'reviews', object.data.number, search);
    } else if (exactCommit) {
      target = repositoryObjectHref(
        address.canonical_path,
        legacyView === 'history' ? 'history' : 'commits',
        object.data.number,
        search
      );
    }
  }
  const canonicalizing = target !== null && target !== `${pathname}${query ? `?${query}` : ''}`;
  useEffect(() => {
    if (!canonicalizing || !target) return;
    if (address && suffix === '/settings') {
      carryRepositorySettingsReturn(address.project_id, target.split('?')[0], repositoryPath);
    }
    router.replace(`${target}${window.location.hash}`, { scroll: false });
  }, [address, canonicalizing, repositoryPath, router, suffix, target]);

  if (!special && isRetiredRepositoryLocation(suffix, new URLSearchParams(query))) notFound();
  if (directory) return <ProjectDirectoryPage ownerSlug={owner} />;
  if (creating) return <NewRepositoryPage />;
  if (organizationSettings) return <OrganizationSettingsPage ownerSlug={owner} />;
  if (!current || canonicalizing) {
    const loading = <LoadingSpinner message="Loading repository..." />;
    // Keep only the known header during navigation; repository content still
    // waits for a fresh address lookup and its access checks.
    return knownProject ? (
      <ProjectShell
        activeTab={resolveProjectRouteTab(
          workspaceBranch ? view : (segments[1] ?? null),
          new URLSearchParams(query)
        )}
        branch={workspaceBranch ?? new URLSearchParams(query).get('branch')}
        pageTitle={null}
        project={knownProject}
      >
        {loading}
      </ProjectShell>
    ) : (
      loading
    );
  }
  if (current.error) {
    const code = 'code' in current.error ? current.error.code : undefined;
    if (code === 'NOT_FOUND' || code === 'FORBIDDEN') {
      return (
        <div className="flex flex-col items-center gap-4 p-8 text-center">
          <h1 className="font-medium">Repository unavailable</h1>
          <p className="text-sm text-muted-foreground">
            This repository may have moved, or you may not have access.
          </p>
          <Button asChild variant="outline">
            <Link href="/repositories">Back to repositories</Link>
          </Button>
        </div>
      );
    }
    return <ErrorMessage error={current.error} onRetry={retry} />;
  }
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
  if (numbered && object.isLoading)
    return <LoadingSpinner message="Loading repository object..." />;
  if (numbered && (!object.data || (numbered.kind === 'review' && !object.data.workspaceId)))
    return (
      <ErrorMessage
        error={object.error ?? new Error('Repository object not found.')}
        onRetry={object.refetch}
      />
    );
  if (
    [
      'settings',
      'diff',
      'merge',
      'changes',
      'checks',
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
        commitHash={numbered?.kind === 'commit' ? object.data?.id : undefined}
      />
    );
  return (
    <ProjectDetailPageContent
      key={address.project_id}
      initialTabOverride={parseProjectTab(view)}
      ownerSlugOverride={address.namespace ?? undefined}
      projectIdOverride={address.project_id}
      workspaceBranch={workspaceBranch}
      commitAddress={numbered?.kind === 'commit' && object.data ? object.data : undefined}
      fixedReview={
        numbered?.kind === 'review' && object.data?.workspaceId
          ? {
              workspaceId: object.data.workspaceId,
              snapshotId: object.data.id,
              number: numbered.number,
            }
          : undefined
      }
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
