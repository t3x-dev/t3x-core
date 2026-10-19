'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SchemaContentPreparationDialog } from '@/components/schemas/SchemaContentPreparationDialog';
import { Button } from '@/components/ui/button';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import { useWorkspaceSchemaPending } from '@/hooks/schemas/useWorkspaceSchemaPending';

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
  const params = new URLSearchParams({
    tab: 'schemas',
    schemaView: 'studio',
    workspace: workspaceId,
    branch,
  });
  if (pending.data?.pending?.source.kind === 'composition') params.set('mode', 'compose');
  const href = `${getProjectIdRepoPath(projectId)}?${params}`;
  return (
    <aside
      aria-label="Pending Schema preparation"
      className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-5 py-3 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">
            {pending.data?.status === 'pending_preparation'
              ? 'Schema change awaiting preparation'
              : 'Schema candidate needs a new preview'}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Current Schema and content are unchanged. The candidate is saved for preparation and
            full review.
          </p>
          {pending.data?.reason || pending.error ? (
            <p className="mt-1 text-xs text-[var(--status-warning)]">
              {pending.data?.reason ?? pending.error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending.data?.status !== 'pending_preparation' || !revision}
            onClick={() => setPreparing(true)}
          >
            Prepare content
          </Button>
          <Link
            className="rounded border border-[var(--stroke-divider)] px-3 py-2 text-xs"
            href={href}
          >
            Review saved candidate
          </Link>
        </div>
      </div>
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
    </aside>
  );
}
