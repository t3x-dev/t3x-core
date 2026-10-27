'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { WorkspaceSnapshotReview } from '@/components/workspaces/WorkspaceSnapshotReview';
import { WorkspaceStageNavigation } from '@/components/workspaces/WorkspaceStageNavigation';
import { legacyExploreLocation } from '@/domain/project/exploreLocation';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
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
  const router = useRouter();
  if (params.get('schemaView') === 'review') {
    const workspaceId = params.get('workspace');
    const snapshotId = params.get('reviewSnapshot');
    if (!workspaceId)
      return (
        <p role="alert" className="p-6">
          A Workspace and review snapshot are required. Return to the Schema editor to prepare a
          review.
        </p>
      );
    if (!snapshotId) {
      const composeHref = `${getProjectIdRepoPath(projectId)}?${new URLSearchParams({
        tab: 'schemas',
        schemaView: 'studio',
        workspace: workspaceId,
        ...(params.get('branch') ? { branch: params.get('branch')! } : {}),
      })}`;
      return (
        <main className="flex h-full flex-col gap-4 p-4">
          <WorkspaceStageNavigation
            label="Schema workflow"
            mode="review"
            onModeChange={(mode) => {
              if (mode === 'compose') router.push(composeHref);
            }}
          />
          <p>No Review has been prepared for this Workspace.</p>
          <p>
            Save your edits in Compose, then choose Review changes to verify the complete Draft.
          </p>
          <Link href={composeHref} className="underline">
            Back to Compose
          </Link>
        </main>
      );
    }
    return (
      <WorkspaceSnapshotReview
        key={`${projectId}:${workspaceId}:${snapshotId}`}
        projectId={projectId}
        workspaceId={workspaceId}
        snapshotId={snapshotId}
        context="schema"
      />
    );
  }
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
