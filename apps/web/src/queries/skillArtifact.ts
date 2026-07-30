import { getSkillArtifact } from '@/infrastructure/projects';
import type { SkillArtifact } from '@/types/api';

export function fetchSkillArtifact(projectId: string, commitHash: string): Promise<SkillArtifact> {
  return getSkillArtifact(projectId, commitHash);
}
