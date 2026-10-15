'use client';

import type { RepositoryAddress } from '@t3x-dev/api-client';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
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
import { resolveRepository } from '@/queries/projects';

function OwnerRepoProjectPageContent() {
  const params = useParams<{ owner: string; repoPath?: string[] }>();
  const owner = params.owner;
  const segments = params.repoPath ?? [];
  const name = segments[0] ?? '';
  const suffix =
    segments.length > 1 ? `/${segments.slice(1).map(encodeURIComponent).join('/')}` : '';
  const directory = !name;
  const creating = name.toLowerCase() === 'new' && segments.length === 1;
  const organizationSettings =
    owner.toLowerCase() === 't3x-dev' && name.toLowerCase() === 'settings' && segments.length === 1;
  const special = directory || creating || organizationSettings;
  const key = JSON.stringify([owner, name]);
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState<{
    key: string;
    address?: RepositoryAddress;
    error?: Error;
  } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => {
    if (special) return;
    let cancelled = false;
    setLookup(null);
    void resolveRepository(owner, name)
      .then((address) => {
        if (!cancelled) setLookup({ key, address });
      })
      .catch((error) => {
        if (!cancelled)
          setLookup({ key, error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, owner, name, special, attempt]);
  const current = lookup?.key === key ? lookup : null;
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
  if (current.error)
    return <ErrorMessage error={current.error} onRetry={() => setAttempt((v) => v + 1)} />;
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
