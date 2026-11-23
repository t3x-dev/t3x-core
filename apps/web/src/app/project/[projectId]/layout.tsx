'use client';

import { use } from 'react';
import { ProjectDetailProvider } from '@/components/project/ProjectDetailContext';
import { ProjectRouteShell } from '@/components/project/ProjectRouteShell';

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return (
    <ProjectDetailProvider projectId={projectId}>
      <ProjectRouteShell projectId={projectId}>{children}</ProjectRouteShell>
    </ProjectDetailProvider>
  );
}
