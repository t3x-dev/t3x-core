import { YOpsReplayError } from '@/commands/yops/errors';

export function formatWorkspaceError(err: unknown): string {
  if (err instanceof YOpsReplayError) {
    return `Workspace data is structurally invalid at op[${err.opIndex}]: ${err.opError}`;
  }
  return err instanceof Error ? err.message : String(err);
}
