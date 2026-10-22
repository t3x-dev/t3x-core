'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { ProjectDetailPageContent } from '@/app/project/[projectId]/page';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { NewRepositoryPage } from '@/components/project/NewRepositoryPage';
import { OrganizationSettingsPage } from '@/components/project/OrganizationSettingsPage';
import { ProjectDirectoryPage } from '@/components/project/ProjectDirectoryPage';
import { parseProjectTab } from '@/components/project/projectTabModel';
import { RepositoryNestedPage } from '@/components/project/RepositoryNestedPage';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import {
  isSupportedRepositorySuffix,
  repositoryLocation,
} from '@/domain/project/repositoryLocation';
import { useRepositoryAddress } from '@/hooks/projects/useRepositoryAddress';

function OwnerRepoProjectPageContent() {
  const params = useParams<{ owner: string; repoPath?: string[] }>();
  const pathname = usePathname();
  const owner = params.owner;
  const segments = params.repoPath ?? [];
  const name = segments[0] ?? '';
  // Preserve the URL's encoded suffix verbatim. Catch-all params can already
  // contain escapes; encoding them again causes a replace loop (%3A -> %253A).
  // Repeated decoding would also corrupt IDs containing literal escapes.
  const suffix = segments.length > 1 ? `/${pathname.split('/').slice(3).join('/')}` : '';
  const directory = !name;
  const creating = name.toLowerCase() === 'new' && segments.length === 1;
  const organizationSettings =
    owner.toLowerCase() === 't3x-dev' && name.toLowerCase() === 'settings' && segments.length === 1;
  const special = directory || creating || organizationSettings;
  const router = useRouter();
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
  if (!current) return <LoadingSpinner message="Loading repository..." />;
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
  const view = segments[1] ?? 'state';
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
