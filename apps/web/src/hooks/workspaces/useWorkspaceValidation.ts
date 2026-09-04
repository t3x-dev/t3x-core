import { useCallback, useEffect, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import {
  getLatestWorkspaceValidationRun,
  runWorkspaceValidation,
  type WorkspaceValidationDetails,
  type WorkspaceValidationRun,
} from '@/infrastructure/workspaceValidation';

export interface WorkspaceValidationState {
  latest: WorkspaceValidationRun | null;
  details: WorkspaceValidationDetails | null;
  loadingLatest: boolean;
  running: boolean;
  error: string | null;
}

export interface UseWorkspaceValidationOptions {
  enabled?: boolean;
}

const emptyWorkspaceValidationState: WorkspaceValidationState = {
  latest: null,
  details: null,
  loadingLatest: false,
  running: false,
  error: null,
};

export function useWorkspaceValidation(
  projectId: string,
  workspaceId: string,
  options: UseWorkspaceValidationOptions = {}
) {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<WorkspaceValidationState>({
    ...emptyWorkspaceValidationState,
  });

  const loadLatest = useCallback(async () => {
    if (!enabled) {
      setState({ ...emptyWorkspaceValidationState });
      return;
    }
    setState((current) => ({ ...current, loadingLatest: true, error: null }));
    try {
      const latest = await getLatestWorkspaceValidationRun(projectId, workspaceId);
      setState((current) => ({ ...current, latest, loadingLatest: false }));
    } catch (err) {
      setState((current) => ({
        ...current,
        loadingLatest: false,
        error: formatUserFacingError(err, 'Failed to load workspace validation.'),
      }));
    }
  }, [enabled, projectId, workspaceId]);

  const run = useCallback(async () => {
    if (!enabled) {
      const message = 'Workspace validation is not required for this workspace.';
      setState((current) => ({ ...current, error: message }));
      throw new Error(message);
    }
    setState((current) => ({ ...current, running: true, error: null }));
    try {
      const details = await runWorkspaceValidation(projectId, workspaceId);
      setState((current) => ({
        ...current,
        latest: details.run,
        details,
        running: false,
      }));
      return details;
    } catch (err) {
      const message = formatUserFacingError(err, 'Workspace validation failed.');
      setState((current) => ({ ...current, running: false, error: message }));
      throw new Error(message);
    }
  }, [enabled, projectId, workspaceId]);

  useEffect(() => {
    if (!enabled) {
      setState({ ...emptyWorkspaceValidationState });
      return;
    }
    void loadLatest();
  }, [enabled, loadLatest]);

  return { ...state, loadLatest, run };
}
