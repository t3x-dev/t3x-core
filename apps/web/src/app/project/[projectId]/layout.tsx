'use client';

import { use } from 'react';
import { ProjectRouteShell } from '@/components/project/ProjectRouteShell';

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return <ProjectRouteShell projectId={projectId}>{children}</ProjectRouteShell>;
}
