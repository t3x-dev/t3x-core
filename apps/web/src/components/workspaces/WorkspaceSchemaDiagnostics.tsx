'use client';

import type { SchemaReviewDiagnostics, WorkspaceFullSchemaReview } from '@t3x-dev/api-client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  StudioChanges,
  StudioChecks,
  StudioImpactPreview,
} from '@/components/schemas/StudioDefinitionPreview';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWorkspaceSchemaEditingRequests } from '@/hooks/workspaces/useWorkspaceSchemaEditingRequests';

/** Diagnostics are advisory. Only the fixed Review checks authorize a decision. */
export function WorkspaceSchemaDiagnostics({
  projectId,
  workspaceId,
  revision,
  frozen = false,
  review,
}: {
  projectId: string;
  workspaceId: string;
  revision?: number;
  frozen?: boolean;
  review?: WorkspaceFullSchemaReview | null;
}) {
  const requests = useWorkspaceSchemaEditingRequests(projectId, workspaceId);
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get('schemaDiagnostics') === '1');
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{
    data?: SchemaReviewDiagnostics;
    revision?: number;
    error?: string;
    loading: boolean;
  }>({ loading: false });
  const sequence = useRef(0);
  useEffect(() => {
    if (!open || frozen) return;
    let active = true;
    const token = ++sequence.current;
    setState({ loading: true });
    void requests.read().then(
      (value) => {
        if (!active || token !== sequence.current) return;
        if (revision !== undefined && value.workspace.revision !== revision) {
          setState({
            loading: false,
            error: 'The Draft changed. Refresh the current Workspace before inspecting its Schema.',
          });
          return;
        }
        setState({ loading: false, data: value.preview, revision: value.workspace.revision });
      },
      (cause) => {
        if (active && token === sequence.current)
          setState({
            loading: false,
            error: cause instanceof Error ? cause.message : 'Could not load Schema diagnostics.',
          });
      }
    );
    const onFocus = () => setRefresh((value) => value + 1);
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [open, frozen, requests, revision, refresh]);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Schema checks & impact
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Schema checks & impact</DialogTitle>
            <DialogDescription>
              {frozen
                ? 'Recorded before content adaptation. These reports explain the Schema changes; the Review checks determine whether the final snapshot can be committed.'
                : 'Read-only checks for the current saved Schema candidate and Draft content. Preparing Review may require content adjustments.'}
            </DialogDescription>
          </DialogHeader>
          {frozen ? (
            review?.preparationDiagnostics?.length ? (
              review.preparationDiagnostics.map((entry, index) => (
                <section
                  key={`${entry.workspaceRevision}:${index}`}
                  className="space-y-4 border-t border-[var(--stroke-divider)] pt-4"
                >
                  <h3 className="text-sm font-medium">
                    Before content adaptation · Draft r{entry.workspaceRevision}
                  </h3>
                  <SchemaDiagnosticsReport diagnostics={entry.diagnostics} />
                </section>
              ))
            ) : (
              <p>
                No Schema preparation diagnostics were recorded with this snapshot. Historical
                reports are never reconstructed from the current Draft.
              </p>
            )
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRefresh((value) => value + 1)}
                disabled={state.loading}
              >
                Refresh checks
              </Button>
              {state.loading ? (
                <output>Loading Schema diagnostics…</output>
              ) : state.error ? (
                <p role="alert">{state.error}</p>
              ) : state.data ? (
                <>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Current saved candidate · Draft r{state.revision}
                  </p>
                  <SchemaDiagnosticsReport diagnostics={state.data} />
                </>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SchemaDiagnosticsReport({ diagnostics }: { diagnostics: SchemaReviewDiagnostics }) {
  return (
    <div className="space-y-4">
      {diagnostics.sources.length ? (
        <ul className="text-xs">
          {diagnostics.sources.map((source) => (
            <li key={source.artifactVersionId}>
              {source.canonicalName} · {source.version}
            </li>
          ))}
        </ul>
      ) : null}
      <StudioChecks preview={diagnostics} />
      <section aria-label="Schema definition changes">
        <h3 className="text-sm font-medium">Definition changes</h3>
        <StudioChanges changes={diagnostics.impact?.changes ?? []} />
      </section>
      <StudioImpactPreview impact={diagnostics.impact} />
      <details className="text-xs">
        <summary>Checked definition identifiers</summary>
        <p className="break-all">Schema: {diagnostics.schemaHash}</p>
        <p className="break-all">Check: {diagnostics.reviewHash}</p>
      </details>
    </div>
  );
}
