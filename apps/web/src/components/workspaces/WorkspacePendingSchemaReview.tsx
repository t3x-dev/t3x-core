'use client';

import type { StudioPreview, StudioSchemaEditCandidateRead } from '@t3x-dev/api-client';
import { dump } from 'js-yaml';
import { type ReactNode, useEffect, useState } from 'react';
import { SchemaDefinitionTree } from '@/components/schemas/SchemaDefinitionTree';
import { Button } from '@/components/ui/button';
import { useWorkspaceSchemaEditingRequests } from '@/hooks/workspaces/useWorkspaceSchemaEditingRequests';
import { WorkspaceReviewCodeView } from './WorkspaceReviewCodeView';
import { WorkspaceReviewComparison } from './WorkspaceReviewComparison';
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
  candidate: StudioSchemaEditCandidateRead;
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
  const bundledPreview = candidate.draftPreview?.saved;
  const initialPreview =
    revision !== undefined &&
    bundledPreview?.workspace?.id === workspaceId &&
    bundledPreview.workspace.revision === revision &&
    bundledPreview.freshness.candidateId === candidate.candidateId &&
    bundledPreview.freshness.candidateRevision === candidate.revision
      ? bundledPreview
      : undefined;
  const [state, setState] = useState<{ key: string; preview?: StudioPreview; error?: string }>();
  useEffect(() => {
    if (initialPreview) return;
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
        setState({ key, preview: data.preview });
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
  }, [requests, initialPreview, key, revision, candidate.candidateId, candidate.revision]);
  const current = !initialPreview && state?.key === key ? state : undefined;
  const preview = initialPreview ?? current?.preview;
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
        <WorkspaceReviewComparison
          before={
            preview.workspace!.boundSchema ?? (preview.workspace!.binding === null ? {} : undefined)
          }
          after={preview.schema}
          subject="Schema"
          versionLabel={`Candidate r${candidate.revision}`}
        />
      ) : pane === 'yaml' ? (
        <WorkspaceReviewCodeView
          branch={branch}
          rootKey={`saved-schema-candidate-r${candidate.revision}`}
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
