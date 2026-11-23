'use client';

import { createContext, type ReactNode, useContext } from 'react';
import { useProjectDetail } from '@/hooks/projects/useProjectDetail';

export function useRepositoryProjectDetail(projectId: string | null) {
  const shared = useContext(ProjectDetailContext);
  const detail = shared && shared.projectId === projectId ? shared.detail : undefined;
  const local = useProjectDetail(detail ? null : projectId);
  return detail ?? local;
}

const ProjectDetailContext = createContext<{
  projectId: string | null;
  detail: ReturnType<typeof useProjectDetail>;
} | null>(null);

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
