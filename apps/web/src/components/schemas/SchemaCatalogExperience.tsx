'use client';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { legacyExploreLocation } from '@/domain/project/exploreLocation';
import { schemaBrowseHref } from '@/domain/schemas/schemaNavigation';
import { useViewPreference } from '@/hooks/shared/useViewPreference';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { ActiveSchemaBindings } from './ActiveSchemaBindings';
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
const SCHEMA_VIEWS = ['studio', 'active'] as const;

function ProjectSchemas({ projectId, children }: { projectId: string; children: ReactNode }) {
  const search = useSearchParams();
  const pathname = usePathname();
  const params = new URLSearchParams(search.toString());
  const [preferredView, rememberView] = useViewPreference(
    `t3x.schemas-view:${projectId}`,
    SCHEMA_VIEWS,
    'studio'
  );
  const requestedView = params.get('schemaView');
  const active = (requestedView ?? preferredView) === 'active';
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const workspaces = useProjectWorkspaces(projectId);
  function tabHref(view: string) {
    const next = new URLSearchParams(params);
    next.set('schemaView', view);
    return `${pathname}?${next}`;
  }
  const exploreHref = schemaBrowseHref(
    projectId,
    params.get('workspace') ?? undefined,
    params.get('branch') ?? undefined
  );
  return (
    <SchemaToolbarContext.Provider value={toolbarTarget}>
      <section
        className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--surface-card)] text-[var(--text-primary)]"
        aria-label="Schema experience"
      >
        <header className={headerStyles.header} data-view={active ? 'bindings' : 'studio'}>
          <nav aria-label="Project schemas" className={headerStyles.navigation}>
            <Link
              href={tabHref('studio')}
              onClick={() => rememberView('studio')}
              aria-current={!active ? 'page' : undefined}
            >
              Studio
            </Link>
            <Link
              href={tabHref('active')}
              onClick={() => rememberView('active')}
              aria-current={active ? 'page' : undefined}
            >
              Bindings
            </Link>
          </nav>
          {active ? (
            <>
              <span className={headerStyles.scopeLabel}>All workspaces</span>
              <Link href={exploreHref} className={headerStyles.browse}>
                Browse schemas <ArrowUpRight size={14} />
              </Link>
            </>
          ) : null}
          <div className={headerStyles.slot} hidden={active} ref={setToolbarTarget} />
        </header>
        {active ? (
          <ActiveSchemaBindings
            projectId={projectId}
            workspaces={workspaces.workspaces}
            refresh={workspaces.refresh}
            error={workspaces.error}
          />
        ) : (
          <SchemaStudioExperience key={projectId} projectId={projectId} navigation={null}>
            {children}
          </SchemaStudioExperience>
        )}
      </section>
    </SchemaToolbarContext.Provider>
  );
}
