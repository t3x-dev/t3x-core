'use client';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { legacyExploreLocation, safeExploreReturn } from '@/domain/project/exploreLocation';
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
  const exploreParams = new URLSearchParams({
    view: 'browse',
    type: 'schemas',
    studioTarget: projectId,
  });
  for (const key of ['workspace', 'branch'])
    if (params.get(key)) exploreParams.set(key, params.get(key)!);
  const exploreHref = safeExploreReturn(params.get('returnTo')) ?? `/explore?${exploreParams}`;
  return (
    <SchemaToolbarContext.Provider value={toolbarTarget}>
      <section
        className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--surface-card)] text-[var(--text-primary)]"
        aria-label="Schema experience"
      >
        <header className={headerStyles.header}>
          <nav aria-label="Project schemas" className="flex shrink-0 items-center gap-4 text-xs">
            <Link
              href={tabHref('studio')}
              onClick={() => rememberView('studio')}
              aria-current={!active ? 'page' : undefined}
              className={!active ? 'font-semibold' : 'text-[var(--text-secondary)]'}
            >
              Studio
            </Link>
            <Link
              href={tabHref('active')}
              onClick={() => rememberView('active')}
              aria-current={active ? 'page' : undefined}
              className={active ? 'font-semibold' : 'text-[var(--text-secondary)]'}
            >
              Bindings
            </Link>
            <Link
              href={exploreHref}
              className="flex items-center gap-1 text-[var(--accent-commit)]"
            >
              Explore <ArrowUpRight size={13} />
            </Link>
          </nav>
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
