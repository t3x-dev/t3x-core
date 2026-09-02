import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { changeProjectVisibility } from '@/commands/projects/changeProjectVisibility';
import { formatUserFacingError } from '@/domain/format/errors';
import { fetchProject } from '@/queries/projects';
import { useProjectStore } from '@/store/projectStore';
import type { ProjectVisibility } from '@/types/api';

function errorCode(error: unknown): string | null {
  let current = error;
  const seen = new Set<object>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export function useProjectVisibility(projectId: string) {
  const [currentVisibility, setCurrentVisibility] = useState<ProjectVisibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const project = await fetchProject(projectId);
      setCurrentVisibility(project.visibility);
      setError(null);
      useProjectStore.getState().updateProject(projectId, { visibility: project.visibility });
    } catch (loadError) {
      setError(formatUserFacingError(loadError, 'Failed to load project visibility.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (visibility: ProjectVisibility, publicationConfirmed: boolean) => {
      if (!currentVisibility || visibility === currentVisibility) return;
      setSaving(true);
      setError(null);
      try {
        const result = await changeProjectVisibility(projectId, {
          expected_visibility: currentVisibility,
          visibility,
          confirm_publication: visibility === 'public' ? publicationConfirmed : undefined,
        });
        setCurrentVisibility(result.project.visibility);
        useProjectStore.getState().updateProject(projectId, {
          visibility: result.project.visibility,
        });
        toast.success(
          result.changed ? 'Project visibility updated' : 'Project visibility is current'
        );
      } catch (saveError) {
        if (errorCode(saveError) === 'CONFLICT') {
          await load();
          setError('Project visibility changed elsewhere. The current value has been refreshed.');
        } else {
          setError(formatUserFacingError(saveError, 'Failed to update project visibility.'));
        }
      } finally {
        setSaving(false);
      }
    },
    [currentVisibility, load, projectId]
  );

  return {
    clearError: () => setError(null),
    currentVisibility,
    error,
    loading,
    save,
    saving,
  };
}
