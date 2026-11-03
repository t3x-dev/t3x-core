'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { legacyExploreLocation } from '@/domain/project/exploreLocation';
import { workspaceReviewHref } from '@/domain/workspaces/reviewNavigation';
import headerStyles from './SchemaCatalogHeader.module.css';
import { SchemaStudioExperience } from './SchemaStudioExperience';
import { SchemaToolbarContext } from './SchemaToolbarSlot';

export function SchemaCatalogExperience({
  projectId,
  children,
  tab = 'schemas',
}: {
  projectId: string;
  children: ReactNode;
  tab?: 'schemas' | 'discover' | 'browse';
}) {
  if (tab !== 'schemas') return <LegacyCatalogRedirect projectId={projectId} tab={tab} />;
  return <ProjectSchemas projectId={projectId}>{children}</ProjectSchemas>;
}
function LegacyCatalogRedirect({
  projectId,
  tab,
}: {
  projectId: string;
  tab: 'discover' | 'browse';
}) {
  const search = useSearchParams();
  const router = useRouter();
  const href = legacyExploreLocation(projectId, tab, search.toString());
  useEffect(() => router.replace(href), [router, href]);
  return (
    <p className="p-6 text-sm">
      Opening <Link href={href}>Explore</Link>…
    </p>
  );
}
function ProjectSchemas({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const params = useSearchParams();
  if (params.get('schemaView') === 'review')
    return <LegacySchemaReviewRedirect projectId={projectId} />;
  return (
    <SchemaToolbarContext.Provider value={toolbarTarget}>
      <section
        className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--surface-card)] text-[var(--text-primary)]"
        aria-label="Schema experience"
      >
        <header className={headerStyles.header}>
          <div className={headerStyles.slot} ref={setToolbarTarget} />
        </header>
        <SchemaStudioExperience key={projectId} projectId={projectId} navigation={null}>
          {children}
        </SchemaStudioExperience>
      </section>
    </SchemaToolbarContext.Provider>
  );
}

function LegacySchemaReviewRedirect({ projectId }: { projectId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const workspace = params.get('workspace');
  const href = workspace
    ? workspaceReviewHref(projectId, workspace, {
        snapshotId: params.get('reviewSnapshot') ?? undefined,
        branch: params.get('branch') ?? undefined,
        pane: params.get('reviewPane'),
      }) + (params.get('schemaDiagnostics') === '1' ? '&schemaDiagnostics=1' : '')
    : null;
  useEffect(() => {
    if (href) router.replace(href);
  }, [href, router]);
  return href ? (
    <p className="p-6">
      Opening <Link href={href}>Workspace Review</Link>…
    </p>
  ) : (
    <p role="alert" className="p-6">
      Select a Workspace in the Schema editor before opening Review.
    </p>
  );
}
