import { Badge } from '@/components/ui/badge';
import { formatWorkspaceStatus, getWorkspaceStatusBadgeTone } from '@/domain/workspaces/selectors';
import type { WorkspaceStatus } from '@/types/workspaces';

export function WorkspaceStatusBadge({ status }: { status: WorkspaceStatus }) {
  return (
    <Badge variant={getWorkspaceStatusBadgeTone(status)}>{formatWorkspaceStatus(status)}</Badge>
  );
}
