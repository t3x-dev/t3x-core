import { YOpsReplayError } from '@/commands/yops/errors';

/**
 * Render a user-facing message for a workspace error. Initial-load
 * partial-replay failures no longer reach this path — they're handled
 * by `replayWarning` in the store and rendered as a banner with a
 * delete affordance. This formatter is for hard errors only:
 * network/persistence failures, and the optimistic-append throw from
 * `replayAppended` (which still uses YOpsReplayError to roll back).
 */
export function formatWorkspaceError(err: unknown): string {
  if (err instanceof YOpsReplayError) {
    return `Workspace data is structurally invalid at op[${err.opIndex}]: ${err.opError}`;
  }
  return err instanceof Error ? err.message : String(err);
}
