'use client';

import type { ReactNode } from 'react';
import {
  ProjectDetailContext,
  useRepositoryProjectDetail,
} from '@/hooks/projects/useProjectDetail';

export { useRepositoryProjectDetail } from '@/hooks/projects/useProjectDetail';

export function ProjectDetailProvider({
  projectId,
  children,
}: {
  projectId: string | null;
  children: ReactNode;
}) {
  const detail = useRepositoryProjectDetail(projectId);
  return (
    <ProjectDetailContext.Provider value={{ projectId, detail }}>
      {children}
    </ProjectDetailContext.Provider>
  );
}
