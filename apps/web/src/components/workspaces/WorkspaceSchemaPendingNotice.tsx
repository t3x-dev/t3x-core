'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SchemaContentPreparationDialog } from '@/components/schemas/SchemaContentPreparationDialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import { useWorkspaceSchemaPending } from '@/hooks/schemas/useWorkspaceSchemaPending';

export function WorkspaceSchemaPendingNotice({
  projectId,
  workspaceId,
  revision,
  confirmedEmpty,
  branch,
  onPrepared,
}: {
  projectId: string;
  workspaceId: string;
  revision?: number;
  confirmedEmpty?: boolean;
  branch: string;
  onPrepared?: () => void | Promise<void>;
}) {
  const [preparing, setPreparing] = useState(false);
  const pending = useWorkspaceSchemaPending(projectId, workspaceId, revision, confirmedEmpty);
  if (pending.loading || pending.data?.status === 'none' || (!pending.data && !pending.error))
    return null;
  if (pending.error) {
    return (
      <Alert
        label="Schema preparation status"
        layout="banner"
        title="Schema preparation status unavailable"
        tone="error"
        actions={
          <Button size="sm" variant="outline" onClick={pending.refresh}>
            Retry
          </Button>
        }
      >
        <p>{pending.error}</p>
      </Alert>
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
      <Alert
        label="Pending Schema preparation"
        layout="banner"
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
      </Alert>
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
