'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SchemaContentPreparationDialog } from '@/components/schemas/SchemaContentPreparationDialog';
import { Button } from '@/components/ui/button';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import { useWorkspaceSchemaPending } from '@/hooks/schemas/useWorkspaceSchemaPending';
import { WorkspaceNotice } from './WorkspaceNotice';

export function WorkspaceSchemaPendingNotice({
  projectId,
  workspaceId,
  revision,
  branch,
  onPrepared,
}: {
  projectId: string;
  workspaceId: string;
  revision?: number;
  branch: string;
  onPrepared?: () => void | Promise<void>;
}) {
  const [preparing, setPreparing] = useState(false);
  const pending = useWorkspaceSchemaPending(projectId, workspaceId, revision);
  if (pending.loading || pending.data?.status === 'none') return null;
  if (pending.error) {
    return (
      <WorkspaceNotice
        label="Schema preparation status"
        title="Schema preparation status unavailable"
        tone="error"
        actions={
          <Button size="sm" variant="outline" onClick={pending.refresh}>
            Retry
          </Button>
        }
      >
        <p>{pending.error}</p>
      </WorkspaceNotice>
    );
  }
  const awaitingPreparation = pending.data?.status === 'pending_preparation';
  const params = new URLSearchParams({
    tab: 'schemas',
    schemaView: 'studio',
    workspace: workspaceId,
    branch,
  });
  if (pending.data?.pending?.source.kind === 'composition') params.set('mode', 'compose');
  const href = `${getProjectIdRepoPath(projectId)}?${params}`;
  return (
    <>
      <WorkspaceNotice
        label="Pending Schema preparation"
        title={
          awaitingPreparation
            ? 'Schema change awaiting preparation'
            : 'Schema candidate needs a new preview'
        }
        tone={awaitingPreparation ? 'info' : 'warning'}
        actions={
          <>
            {awaitingPreparation ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!revision}
                onClick={() => setPreparing(true)}
              >
                Prepare content
              </Button>
            ) : null}
            <Button size="sm" variant={awaitingPreparation ? 'ghost' : 'outline'} asChild>
              <Link href={href}>Review saved candidate</Link>
            </Button>
          </>
        }
      >
        <p>
          {pending.data?.reason ?? 'The candidate is saved for preparation and full review.'}{' '}
          Current Schema and content are unchanged.
        </p>
      </WorkspaceNotice>
      {preparing && pending.data?.pending && revision ? (
        <SchemaContentPreparationDialog
          projectId={projectId}
          workspaceId={workspaceId}
          revision={revision}
          target={{ kind: 'pending', pendingId: pending.data.pending.pendingId }}
          open={preparing}
          onOpenChange={setPreparing}
          onPrepared={async () => {
            await onPrepared?.();
            setPreparing(false);
            pending.refresh();
          }}
        />
      ) : null}
    </>
  );
}
