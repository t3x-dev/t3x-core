'use client';

import type { StudioSchemaEditCandidate } from '@t3x-dev/api-client';
import { dump } from 'js-yaml';
import { type ReactNode, useEffect, useState } from 'react';
import { SchemaDefinitionTree } from '@/components/schemas/SchemaDefinitionTree';
import { Button } from '@/components/ui/button';
import {
  useWorkspaceSchemaEditingRequests,
  type WorkspaceSchemaEditing,
} from '@/hooks/workspaces/useWorkspaceSchemaEditingRequests';
import { StudioChanges } from './SchemaDiagnosticsReportParts';
import { WorkspaceReviewCodeView } from './WorkspaceReviewCodeView';
import type { WorkspaceReviewPane } from './WorkspaceReviewWorkbench';

/** Read-only candidate preview; preparation still rechecks the live candidate. */
export function WorkspacePendingSchemaReview({
  projectId,
  workspaceId,
  revision,
  candidate,
  branch,
  pane,
  inspectedSchema,
}: {
  projectId: string;
  workspaceId: string;
  revision?: number;
  candidate: StudioSchemaEditCandidate;
  branch: string;
  pane: WorkspaceReviewPane;
  inspectedSchema?: ReactNode;
}) {
  const requests = useWorkspaceSchemaEditingRequests(projectId, workspaceId);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([
    projectId,
    workspaceId,
    revision,
    candidate.candidateId,
    candidate.revision,
    attempt,
  ]);
  const [state, setState] = useState<{
    key: string;
    data?: WorkspaceSchemaEditing;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    void requests.read().then(
      (data) => {
        if (!active) return;
        if (
          (revision !== undefined && data.workspace.revision !== revision) ||
          data.edit?.candidateId !== candidate.candidateId ||
          data.edit?.revision !== candidate.revision ||
          !data.unapplied ||
          !data.preview.workspace
        ) {
          setState({
            key,
            error: 'The Draft or saved Schema changed. Refresh the Workspace to review it.',
          });
          return;
        }
        setState({ key, data });
      },
      (cause) => {
        if (active)
          setState({
            key,
            error: cause instanceof Error ? cause.message : 'Could not load the saved Schema.',
          });
      }
    );
    return () => {
      active = false;
    };
  }, [requests, key, revision, candidate.candidateId, candidate.revision]);
  const current = state?.key === key ? state : undefined;
  const preview = current?.data?.preview;
  return (
    <section aria-label="Saved Schema review" className="space-y-4">
      {!preview && inspectedSchema}
      {preview || !inspectedSchema ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Saved Schema candidate r{candidate.revision} · awaiting preparation. Changes compare the
          currently applied Workspace Schema with this candidate. Prepare review to adapt Content
          and freeze the complete snapshot.
        </p>
      ) : null}
      {current?.error ? (
        <div>
          <p role="alert">{current.error}</p>
          <Button
            variant="canvas-outline"
            size="sm"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry preview
          </Button>
        </div>
      ) : !preview ? (
        <output>Loading saved Schema changes…</output>
      ) : pane === 'changes' ? (
        <StudioChanges changes={preview.workspace!.changes} />
      ) : pane === 'yaml' ? (
        <WorkspaceReviewCodeView
          branch={branch}
          rootKey="saved-schema"
          validationReady={false}
          statusLabel="Saved Schema candidate · awaiting preparation"
          yamlText={dump(preview.schema, { noRefs: true, sortKeys: true })}
        />
      ) : (
        <SchemaDefinitionTree schema={preview.schema} />
      )}
    </section>
  );
}
