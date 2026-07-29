'use client';

import { useCallback } from 'react';
import { useQuery } from '@/hooks/shared/useQuery';
import { fetchSkillArtifact } from '@/queries/skillArtifact';
import type { SkillArtifact } from '@/types/api';

export function useSkillArtifact(
  projectId: string,
  commitHash: string | null,
  enabled: boolean
): {
  artifact: SkillArtifact | null;
  error: Error | null;
  loading: boolean;
} {
  const queryFn = useCallback(() => {
    if (!commitHash) throw new Error('A commit is required to compile a Skill artifact.');
    return fetchSkillArtifact(projectId, commitHash);
  }, [commitHash, projectId]);
  const query = useQuery({
    enabled: enabled && Boolean(commitHash),
    queryFn,
    queryKey: ['skill-artifact', projectId, commitHash],
    staleTime: 60_000,
  });
  const currentArtifact = query.data?.commit_hash === commitHash ? query.data : null;

  return {
    artifact: currentArtifact,
    error: query.error,
    loading: query.isLoading,
  };
}
