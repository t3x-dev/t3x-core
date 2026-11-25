'use client';

import { type ReactNode, useEffect } from 'react';
import {
  ProjectDetailContext,
  useRepositoryProjectDetail,
} from '@/hooks/projects/useProjectDetail';
import { markNavigationTiming } from '@/utils/navigationTiming';

export { useRepositoryProjectDetail } from '@/hooks/projects/useProjectDetail';

export function ProjectDetailProvider({
  projectId,
  children,
  settings = false,
}: {
  projectId: string | null;
  children: ReactNode;
  settings?: boolean;
}) {
  const detail = useRepositoryProjectDetail(projectId, settings);
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
