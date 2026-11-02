'use client';

import type { SchemaPreparationTarget } from '@t3x-dev/api-client';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { SchemaContentPreparationDialog } from '@/components/schemas/SchemaContentPreparationDialog';
import { SchemaDataEditor } from '@/components/schemas/SchemaDataEditor';
import type { SchemaEditorNavigation } from '@/components/schemas/useSchemaNavigationGuard';
import { Button } from '@/components/ui/button';
import { pruneSchemaMappings } from '@/domain/schemas/schemaSourceMappings';
import { useStudioSchemaEditCandidate } from '@/hooks/schemas/useStudioSchemaEditCandidate';
import {
  useWorkspaceSchemaEditingRequests,
  type WorkspaceSchemaEditing,
} from '@/hooks/workspaces/useWorkspaceSchemaEditingRequests';
import type { WorkspaceCandidate } from '@/types/workspaces';

/** Workspace host for the existing editor and preparation flow. No separate Schema draft. */
export function WorkspaceSchemaEditor({
  candidate,
  navigationRef,
  blocked,
  onChanged,
  onDirtyChange,
  onBusyChange,
  focusSemanticPath,
}: {
  candidate: WorkspaceCandidate;
  focusSemanticPath?: string;
  navigationRef: RefObject<SchemaEditorNavigation | null>;
  blocked?: string;
  onChanged: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const requests = useWorkspaceSchemaEditingRequests(candidate.projectId, candidate.id);
  const [session, setSession] = useState<WorkspaceSchemaEditing>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [preparation, setPreparation] = useState<{
    revision: number;
    target: SchemaPreparationTarget;
  }>();
  const epoch = useRef(0);
  const edits = useStudioSchemaEditCandidate(candidate.projectId, candidate.id, candidate.revision);
  const refresh = useCallback(async () => {
    const token = ++epoch.current;
    setLoading(true);
    setError(undefined);
    try {
      const next = await requests.read();
      if (token === epoch.current) setSession(next);
      return true;
    } catch (cause) {
      if (token === epoch.current)
        setError(cause instanceof Error ? cause.message : 'Could not load Schema.');
      return false;
    } finally {
      if (token === epoch.current) setLoading(false);
    }
  }, [requests]);
  useEffect(() => {
    void refresh();
    const reload = () => void refresh();
    window.addEventListener('focus', reload);
    window.addEventListener('t3x-schema-candidate-updated', reload);
    return () => {
      ++epoch.current;
      window.removeEventListener('focus', reload);
      window.removeEventListener('t3x-schema-candidate-updated', reload);
    };
  }, [refresh, candidate.revision, edits.candidate?.revision]);
  const revisionKey = JSON.stringify([
    candidate.id,
    session?.workspace.revision,
    session?.edit?.revision,
    session?.preview.schemaHash,
  ]);
  return (
    <section className="flex h-full min-h-0 flex-col gap-3" aria-label="Edit Workspace Schema">
      {error && session ? (
        <div role="alert">
          {error}{' '}
          <Button variant="outline" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : null}
      {session?.unapplied ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
          <span>Saved Schema candidate · not applied to the Workspace Draft.</span>
          <Button
            variant="outline"
            disabled={loading || edits.pending || Boolean(blocked)}
            onClick={() =>
              navigationRef.current?.requestNavigation(() => {
                void requests
                  .read()
                  .then((latest) => {
                    setSession(latest);
                    if (!latest.unapplied || !latest.edit || !latest.preview.workspace) return;
                    setPreparation({
                      revision: latest.preview.workspace.revision,
                      target: {
                        kind: 'studio',
                        candidateIds: latest.candidateIds,
                        reviewHash: latest.preview.reviewHash,
                        schemaEditCandidate: {
                          candidateId: latest.edit.candidateId,
                          revision: latest.edit.revision,
                        },
                      },
                    });
                  })
                  .catch((cause) =>
                    setError(cause instanceof Error ? cause.message : 'Could not prepare Schema.')
                  );
              })
            }
          >
            Prepare and save to Draft
          </Button>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">
          Edit the Schema used by this Workspace. Saving a candidate does not commit it.
        </p>
      )}
      {blocked ? <output className="text-sm">{blocked}</output> : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <SchemaDataEditor
          navigationRef={navigationRef}
          focusSemanticPath={focusSemanticPath}
          layoutKey={`workspace-schema:${candidate.id}`}
          initialDefinition={session?.preview.schema}
          baseDefinition={
            session?.unapplied ? session.edit?.baseDefinition : session?.preview.schema
          }
          initialSourceMappings={
            session?.unapplied ? session.edit?.authoringDraft?.sourceMappings : []
          }
          provenance={session?.preview}
          revisionKey={revisionKey}
          loading={loading && !session}
          pending={loading || edits.pending || Boolean(preparation)}
          previewError={session ? undefined : error}
          disabledReason={blocked ?? (error ? 'Refresh Schema before saving.' : undefined)}
          onRetry={() => void refresh()}
          onDirtyChange={onDirtyChange}
          onPreview={() => {}}
          onDiscard={() => void refresh()}
          onSave={async (definition, intent, mappings = []) => {
            onBusyChange(true);
            try {
              if (!session) throw new Error('Load the current Schema before saving.');
              const latest = await requests.read();
              if (
                latest.workspace.revision !== session.workspace.revision ||
                latest.edit?.revision !== session.edit?.revision
              )
                throw new Error(
                  'Schema or content changed. Your edits are retained; refresh and reconcile before saving.'
                );
              await edits.save({
                workspaceId: candidate.id,
                candidateIds: session.candidateIds,
                ifRevision: session.edit?.revision ?? 0,
                retryKey: `workspace-schema:${crypto.randomUUID()}`,
                intent,
                origin: 'studio',
                localContribution: {},
                schemaDefinition: definition,
                sourceMappings: pruneSchemaMappings(mappings, definition),
                baseSchemaHash: session.unapplied
                  ? String(
                      session.edit?.authoringDraft?.base.schemaHash ?? session.preview.schemaHash
                    )
                  : session.preview.schemaHash,
                ...(!session.unapplied && session.edit ? { rebase: true } : {}),
              });
              if (!(await refresh()))
                setError(
                  'Schema candidate was saved. Refresh to load its latest state before applying it.'
                );
              try {
                await onChanged();
              } catch {
                setError(
                  'Schema candidate was saved. Refresh the Workspace to load its latest state.'
                );
              }
            } finally {
              onBusyChange(false);
            }
          }}
        />
      </div>
      {preparation ? (
        <SchemaContentPreparationDialog
          projectId={candidate.projectId}
          workspaceId={candidate.id}
          revision={preparation.revision}
          target={preparation.target}
          open
          onOpenChange={(open) => {
            if (!open) setPreparation(undefined);
          }}
          onPrepared={async () => {
            if (!(await refresh()))
              setError('Schema was applied to the Draft. Refresh to load the updated state.');
            try {
              await onChanged();
            } catch {
              setError(
                'Schema was applied to the Draft. Refresh the Workspace to load the updated state.'
              );
            }
          }}
        />
      ) : null}
    </section>
  );
}
