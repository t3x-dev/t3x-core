'use client';

import { type ReactNode, useEffect } from 'react';
import {
  ProjectDetailContext,
  useRepositoryProjectDetail,
} from '@/hooks/projects/useProjectDetail';
import type { ProjectSummary } from '@/store/projectStore';
import { markNavigationTiming } from '@/utils/navigationTiming';

export { useRepositoryProjectDetail } from '@/hooks/projects/useProjectDetail';

export function ProjectDetailProvider({
  projectId,
  children,
  settings = false,
  initialProject,
}: {
  projectId: string | null;
  children: ReactNode;
  settings?: boolean;
  initialProject?: ProjectSummary;
}) {
  const detail = useRepositoryProjectDetail(projectId, settings, initialProject);
  const general = detail.detail;
  useEffect(() => {
    if (settings && general) markNavigationTiming('settings', 'data');
  }, [general, settings]);
  return (
    <ProjectDetailContext.Provider value={{ projectId, detail }}>
      {children}
    </ProjectDetailContext.Provider>
  );
}
