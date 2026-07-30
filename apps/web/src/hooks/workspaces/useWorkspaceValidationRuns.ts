import { useEffect, useState } from 'react';
import {
  fetchLatestWorkspaceValidationRun,
  fetchWorkspaceValidationRunDetails,
  runWorkspaceValidation,
} from '@/queries/workspaces';
import type { WorkspaceValidationRunDetails, WorkspaceValidationStaleReason } from '@/types/api';
import { ApiError } from '@/types/api';
import type { WorkspaceCandidate } from '@/types/workspaces';

export interface WorkspaceValidationErrorState {
  code: string | null;
  message: string;
}

export interface WorkspaceValidationFeedbackState {
  message: string;
  tone: 'pending' | 'success' | 'warning';
}

const WORKSPACE_VALIDATION_FEEDBACK: Record<
  WorkspaceValidationRunDetails['run']['status'],
  WorkspaceValidationFeedbackState
> = {
  environment_required: {
    message: 'Extra checks finished: Docker is not available.',
    tone: 'warning',
  },
  failed: { message: 'Extra checks finished: ESPHome config failed.', tone: 'warning' },
  passed: { message: 'Extra checks finished: ESPHome config passed.', tone: 'success' },
  pending: { message: 'Extra checks are still running.', tone: 'pending' },
  running: { message: 'Extra checks are still running.', tone: 'pending' },
  stale: { message: 'Extra checks finished: validation result is stale.', tone: 'warning' },
  timed_out: { message: 'Extra checks finished: ESPHome config timed out.', tone: 'warning' },
};

export function useWorkspaceValidationRuns(candidate: WorkspaceCandidate) {
  const [details, setDetails] = useState<WorkspaceValidationRunDetails | null>(null);
  const [freshness, setFreshness] = useState<{
    fresh: boolean;
    staleReason: WorkspaceValidationStaleReason | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<WorkspaceValidationErrorState | null>(null);
  const [feedback, setFeedback] = useState<WorkspaceValidationFeedbackState | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetails(null);
    setFreshness(null);
    setError(null);
    setFeedback(null);
    setLoading(true);

    fetchLatestWorkspaceValidationRun(candidate.projectId, candidate.id)
      .then(async (latest) => {
        if (!latest.run) {
          return {
            details: null,
            fresh: latest.fresh,
            staleReason: latest.stale_reason,
          };
        }
        const latestDetails = await fetchWorkspaceValidationRunDetails(latest.run.id);
        return {
          details: latestDetails,
          fresh: latest.fresh,
          staleReason: latest.stale_reason,
        };
      })
      .then((result) => {
        if (cancelled) return;
        setDetails(result.details);
        setFreshness({
          fresh: result.fresh,
          staleReason: result.staleReason,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setDetails(null);
          setFreshness(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [candidate.id, candidate.projectId, candidate.updatedAt]);

  async function runExtraChecks() {
    if (running) return;
    setRunning(true);
    setError(null);
    setFeedback({
      message: 'Extra checks are running against the current workspace.',
      tone: 'pending',
    });
    try {
      const runDetails = await runWorkspaceValidation(candidate.projectId, candidate.id);
      setDetails(runDetails);
      setFreshness({ fresh: true, staleReason: null });
      setFeedback(formatWorkspaceValidationFeedback(runDetails));
    } catch (runError) {
      const formattedError = formatWorkspaceValidationError(runError);
      setDetails(null);
      setFreshness(null);
      setError(formattedError);
      setFeedback({
        message: formatWorkspaceValidationErrorFeedback(formattedError),
        tone: 'warning',
      });
    } finally {
      setRunning(false);
      setLoading(false);
    }
  }

  function blockExtraChecks(message: string) {
    setError(null);
    setFeedback({
      message,
      tone: 'warning',
    });
  }

  return {
    blockExtraChecks,
    details,
    error,
    feedback,
    fresh: freshness?.fresh ?? null,
    loading,
    runExtraChecks,
    running,
    staleReason: freshness?.staleReason ?? null,
  };
}

function formatWorkspaceValidationFeedback(
  details: WorkspaceValidationRunDetails
): WorkspaceValidationFeedbackState {
  const fallback = WORKSPACE_VALIDATION_FEEDBACK[details.run.status];
  return { ...fallback, message: details.run.summary ?? fallback.message };
}

function formatWorkspaceValidationErrorFeedback(error: WorkspaceValidationErrorState): string {
  if (error.code === 'VALIDATION_INPUT_NOT_SUPPORTED') {
    return 'Extra checks finished: ESPHome device state was not found.';
  }
  return error.message;
}

function formatWorkspaceValidationError(error: unknown): WorkspaceValidationErrorState {
  if (error instanceof ApiError) {
    const message =
      error.code === 'VALIDATION_INPUT_NOT_SUPPORTED'
        ? error.message || 'ESPHome device state was not found.'
        : error.code === 'TIMEOUT'
          ? 'Extra checks timed out before the backend returned a result.'
          : error.message || 'Extra checks failed.';
    return { code: error.code, message };
  }
  if (error instanceof Error) return { code: null, message: error.message };
  return { code: null, message: 'Extra checks failed.' };
}
