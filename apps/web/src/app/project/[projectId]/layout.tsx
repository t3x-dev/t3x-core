'use client';

import { usePathname } from 'next/navigation';
import { use, useEffect } from 'react';
import { ProjectDetailProvider } from '@/components/project/ProjectDetailContext';
import { ProjectRouteShell } from '@/components/project/ProjectRouteShell';
import { ensureSettingsNavigationTiming } from '@/utils/navigationTiming';

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const pathname = usePathname();
  const settings = /^\/project\/[^/]+\/settings\/?$/.test(pathname);
  useEffect(() => {
    if (settings) ensureSettingsNavigationTiming();
  }, [settings]);
  return (
    <ProjectDetailProvider projectId={projectId} settings={settings}>
      <ProjectRouteShell projectId={projectId}>{children}</ProjectRouteShell>
    </ProjectDetailProvider>
  );
}
