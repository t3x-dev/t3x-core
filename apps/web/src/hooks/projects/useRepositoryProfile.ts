import { type RepositoryProfilePatch, RepositoryProfilePatchSchema } from '@t3x-dev/api-client';
import { useCallback } from 'react';
import { updateProject } from '@/commands/projects/updateProject';
import { useProjectStore } from '@/store/projectStore';

export function useRepositoryProfile(projectId: string) {
  return useCallback(
    async (patch: RepositoryProfilePatch) => {
      const profile = RepositoryProfilePatchSchema.parse(patch);
      const updated = await updateProject(projectId, { repository_profile: profile });
      if (!updated.repository_profile)
        throw new Error('The server did not return saved repository information.');
      const store = useProjectStore.getState();
      const current = store.details[projectId] ?? store.getProject(projectId);
      // A later response for README must not roll back a Tags save in this tab.
      store.updateProject(projectId, {
        repositoryProfile: {
          ...(current?.repositoryProfile ?? { readme: '', tags: [] }),
          ...(profile.readme !== undefined ? { readme: updated.repository_profile.readme } : {}),
          ...(profile.tags !== undefined ? { tags: updated.repository_profile.tags } : {}),
        },
      });
    },
    [projectId]
  );
}
