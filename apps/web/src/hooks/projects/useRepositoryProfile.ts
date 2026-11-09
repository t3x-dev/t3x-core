import { type RepositoryProfilePatch, RepositoryProfilePatchSchema } from '@t3x-dev/api-client';
import { useCallback } from 'react';
import { updateProject } from '@/commands/projects/updateProject';
import { useProjectStore } from '@/store/projectStore';

export function useRepositoryDescription(projectId: string) {
  return useCallback(
    async (description: string) => {
      const updated = await updateProject(projectId, { metadata: { description } });
      const saved = updated.metadata?.description;
      if (typeof saved !== 'string')
        throw new Error('The server did not return the saved repository description.');
      const store = useProjectStore.getState();
      const current = store.details[projectId] ?? store.getProject(projectId);
      store.updateProject(projectId, {
        description: saved,
        metadata: { ...current?.metadata, description: saved },
      });
    },
    [projectId]
  );
}

export function useRepositoryProfile(projectId: string) {
  return useCallback(
    async (patch: RepositoryProfilePatch) => {
      const profile = RepositoryProfilePatchSchema.parse(patch);
      const updated = await updateProject(projectId, { repository_profile: profile });
      if (
        !updated.repository_profile ||
        (profile.icon !== undefined && updated.repository_profile.icon === undefined)
      )
        throw new Error('The server did not return saved repository information.');
      const store = useProjectStore.getState();
      const current = store.details[projectId] ?? store.getProject(projectId);
      // Apply only the fields written by this request, even if responses arrive out of order.
      store.updateProject(projectId, {
        repositoryProfile: {
          ...(current?.repositoryProfile ?? { readme: '', tags: [] }),
          ...(profile.readme !== undefined ? { readme: updated.repository_profile.readme } : {}),
          ...(profile.tags !== undefined ? { tags: updated.repository_profile.tags } : {}),
          ...(profile.icon !== undefined ? { icon: updated.repository_profile.icon } : {}),
        },
      });
    },
    [projectId]
  );
}
