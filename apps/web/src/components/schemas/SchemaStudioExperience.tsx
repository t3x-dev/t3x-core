'use client';
import type { StudioPreview } from '@t3x-dev/api-client';
import {
  ArrowRight,
  Box,
  Check,
  GitCompareArrows,
  LockKeyhole,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { StateValueReader } from '@/components/project/StateValueReader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getProjectIdRepoPath, getProjectIdWorkspacePath } from '@/domain/project/repoPath';
import { useStudioCandidates } from '@/hooks/schemas/useStudioCandidates';
import { useApplyStudioSelection, useStudioPreview } from '@/hooks/schemas/useStudioPreview';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { cn } from '@/utils/cn';
import { StudioChanges, StudioDefinitionPreview } from './StudioDefinitionPreview';

const selectClass =
  'mt-2 w-full min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-2 text-sm';
export function SchemaStudioExperience({
  projectId,
  children,
}: {
  projectId: string;
  children?: ReactNode;
}) {
  const params = useSearchParams();
  const candidates = useStudioCandidates(projectId);
  const applySelection = useApplyStudioSelection(projectId);
  const workspaces = useProjectWorkspaces(projectId);
  const [selection, setSelection] = useState<string[]>([]);
  const [workspaceId, setWorkspaceId] = useState(params?.get('workspace') ?? '');
  const [compareId, setCompareId] = useState('');
  const [tab, setTab] = useState<'preview' | 'structure' | 'code'>('preview');
  const [xray, setXray] = useState(false);
  const [advanced, setAdvanced] = useState(
    params?.get('mode') === 'compose' || params?.get('mode') === 'versions'
  );
  const [review, setReview] = useState<StudioPreview>();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string>();
  const [applied, setApplied] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const requested = params?.get('candidate');
  useEffect(() => {
    if (requested) setSelection([requested]);
  }, [requested]);
  const selected = candidates.items.filter((item) => selection.includes(item.id));
  const target = workspaces.workspaces.find((item) => item.id === workspaceId);
  const preview = useStudioPreview(
    projectId,
    {
      candidateIds: selection,
      ...(workspaceId ? { workspaceId } : {}),
      ...(compareId ? { compareToCandidateIds: [compareId] } : {}),
    },
    target?.revision
  );
  const data = preview.data;
  const binding = target?.schemaBindings[0];
  const locked = new Set(
    data?.modules.filter((item) => item.requiredBy.length).map((item) => item.candidateId)
  );
  const candidateSelectionKey = JSON.stringify(selection);
  useEffect(() => {
    setReview(undefined);
    setError(undefined);
    setApplied(false);
  }, [candidateSelectionKey, workspaceId, compareId]);
  function choose(id: string, whole: boolean) {
    setSelection((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : whole
          ? [id]
          : [
              ...current.filter(
                (value) => candidates.items.find((item) => item.id === value)?.kind !== 'schema'
              ),
              id,
            ]
    );
  }
  async function apply() {
    if (!review?.workspace || applying) return;
    setApplying(true);
    setError(undefined);
    try {
      await applySelection({
        candidateIds: [...selection],
        workspaceId: review.workspace.id,
        ifRevision: review.workspace.revision,
        reviewHash: review.reviewHash,
      });
      if (!mounted.current) return;
      setReview(undefined);
      setApplied(true);
      await workspaces.refresh();
      if (mounted.current) preview.refresh();
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'Apply failed');
        setReview(undefined);
        preview.refresh();
      }
    } finally {
      if (mounted.current) setApplying(false);
    }
  }
  const workspaceLink = target
    ? `${getProjectIdWorkspacePath(projectId, { branch: target.targetBranch })}&workspace=${encodeURIComponent(target.id)}`
    : getProjectIdWorkspacePath(projectId);
  return (
    <div className="min-w-0 p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Schema Studio</h1>
          <span className="rounded border border-[var(--stroke-divider)] px-2 py-1 text-xs text-[var(--text-secondary)]">
            Draft selection
          </span>
        </div>
        <Link
          href={`${getProjectIdRepoPath(projectId)}?tab=schemas&schemaView=browse`}
          className="flex items-center gap-2 text-sm text-[var(--status-info)]"
        >
          Browse definitions <Plus className="size-4" />
        </Link>
      </header>
      <section aria-label="Saved Studio candidates" className="mb-5">
        {candidates.loading ? <output>Loading candidates…</output> : null}
        {candidates.error ? <p role="alert">{candidates.error}</p> : null}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {candidates.items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'relative flex w-64 shrink-0 items-start gap-3 rounded-lg border bg-[var(--surface-card)] p-4',
                selection.includes(item.id)
                  ? 'border-[var(--status-info)] ring-1 ring-[var(--status-info)]'
                  : 'border-[var(--stroke-divider)]'
              )}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 accent-[var(--status-info)]"
                  checked={selection.includes(item.id)}
                  disabled={!item.available || applying || preview.loading || locked.has(item.id)}
                  onChange={() => choose(item.id, item.kind === 'schema')}
                  aria-label={`Select ${item.title ?? 'unavailable source'} ${item.source?.version ?? ''}`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {item.title ?? 'Unavailable source'}
                  </span>
                  <span className="mt-1 block font-mono text-xs text-[var(--status-info)]">
                    {item.source?.version ?? 'Access unavailable'}
                  </span>
                  <span className="mt-2 block text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
                    {locked.has(item.id)
                      ? 'Required · included'
                      : item.kind === 'schema'
                        ? 'Whole definition'
                        : (item.kind ?? 'Source unavailable')}
                  </span>
                  {item.reason ? <span className="mt-1 block text-xs">{item.reason}</span> : null}
                </span>
              </label>
              <button
                type="button"
                aria-label={`Remove ${item.title ?? 'unavailable candidate'}`}
                disabled={candidates.pending || applying || preview.loading || locked.has(item.id)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                onClick={() => {
                  setSelection((current) => current.filter((id) => id !== item.id));
                  void candidates.remove(item.id).catch((cause) => setError(cause.message));
                }}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        {!candidates.loading && !candidates.items.length ? (
          <p className="rounded-lg border border-dashed border-[var(--stroke-divider)] p-6 text-sm text-[var(--text-secondary)]">
            Add definitions from Discover or Browse to explore them here.
          </p>
        ) : null}
      </section>
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] p-3 text-sm text-[var(--status-error)]"
        >
          {error} Review the refreshed selection before trying again.
        </p>
      ) : null}
      {applied ? (
        <output className="mb-4 flex items-center gap-2 rounded-md bg-[var(--status-success-muted)] p-3 text-sm text-[var(--status-success)]">
          <Check className="size-4" />
          Exact definition applied. Workspace checks need review.
        </output>
      ) : null}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[210px_minmax(0,1fr)_270px]">
        <aside className="min-w-0 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4">
          <h2 className="text-sm font-semibold">
            Selection{' '}
            <span className="float-right text-xs font-normal text-[var(--text-tertiary)]">
              {selected.length}
            </span>
          </h2>
          <div className="mt-3 divide-y divide-[var(--stroke-divider)]">
            {selected.map((item) => (
              <div key={item.id} className="py-3">
                <p className="flex items-center gap-2 text-xs font-medium">
                  <Box className="size-3.5 shrink-0 text-[var(--status-info)]" />
                  {item.title}
                </p>
                <p className="mt-2 break-all font-mono text-[10px] text-[var(--text-secondary)]">
                  {item.source?.canonicalName}
                </p>
                <p className="mt-1 text-xs text-[var(--status-info)]">{item.source?.version}</p>
                {item.kind === 'schema' ? (
                  <p className="mt-2 flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                    <LockKeyhole className="size-3" />
                    Published structure included
                  </p>
                ) : null}
                <details className="mt-2 text-[10px] text-[var(--text-tertiary)]">
                  <summary className="cursor-pointer">Exact source</summary>
                  <p className="mt-2 break-all font-mono">{item.source?.hash}</p>
                </details>
              </div>
            ))}
          </div>
          {!selection.length ? (
            <p className="mt-3 text-xs text-[var(--text-secondary)]">
              Select a definition or combine declared Modules.
            </p>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={applying || !selection.length}
            onClick={() => setSelection([])}
          >
            Clear selection
          </Button>
          <div className="mt-4 border-t border-[var(--stroke-divider)] pt-4">
            <label className="text-xs font-medium" htmlFor="studio-compare">
              <GitCompareArrows className="mr-1 inline size-3.5" />
              Compare with
            </label>
            <select
              id="studio-compare"
              value={compareId}
              disabled={applying}
              className={selectClass}
              onChange={(event) => setCompareId(event.target.value)}
            >
              <option value="">No comparison</option>
              {candidates.items
                .filter((item) => item.available)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {item.source?.version}
                  </option>
                ))}
            </select>
          </div>
        </aside>
        <main className="min-w-0 overflow-hidden rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] p-3">
            <nav aria-label="Studio definition views" className="flex gap-1">
              {(['preview', 'structure', 'code'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setTab(value)}
                  aria-pressed={tab === value}
                  className={cn(
                    'rounded px-3 py-2 text-xs capitalize',
                    tab === value
                      ? 'bg-[var(--status-info-muted)] text-[var(--status-info)]  '
                      : 'text-[var(--text-secondary)]'
                  )}
                >
                  {value}
                </button>
              ))}
            </nav>
            {tab === 'preview' ? (
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={xray}
                  onChange={(event) => setXray(event.target.checked)}
                />
                X-ray
              </label>
            ) : null}
          </div>
          <div className="max-h-[70vh] overflow-auto p-4 sm:p-5">
            {preview.loading ? (
              <output className="text-sm text-[var(--text-secondary)]">
                Resolving exact definitions…
              </output>
            ) : null}
            {preview.error ? (
              <div role="alert">
                <p className="text-sm text-[var(--status-error)]">{preview.error}</p>
                <Button variant="ghost" size="sm" onClick={preview.refresh}>
                  Retry resolution
                </Button>
              </div>
            ) : null}
            {!selection.length ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
                <Box className="size-8 text-[var(--status-info)]" />
                <h3 className="text-lg font-medium">Shape your next piece of work</h3>
                <p className="max-w-xs text-sm text-[var(--text-secondary)]">
                  Choose a candidate to see its real definition.
                </p>
              </div>
            ) : null}
            {data ? (
              tab === 'preview' ? (
                <StudioDefinitionPreview preview={data} xray={xray} />
              ) : tab === 'structure' ? (
                <StateValueReader value={data.schema} />
              ) : (
                <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6">
                  {JSON.stringify(data.schema, null, 2)}
                </pre>
              )
            ) : null}
            {data?.comparison ? (
              <details open className="mt-6 border-t border-[var(--stroke-divider)] pt-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Comparison · {data.comparison.changes.length} changes
                </summary>
                <StudioChanges changes={data.comparison.changes} />
              </details>
            ) : null}
          </div>
        </main>
        <aside className="min-w-0 space-y-4">
          <section className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4">
            <label className="text-sm font-semibold" htmlFor="studio-workspace">
              Target Workspace
            </label>
            <select
              id="studio-workspace"
              value={workspaceId}
              disabled={applying}
              className={selectClass}
              onChange={(event) => setWorkspaceId(event.target.value)}
            >
              <option value="">Choose Workspace</option>
              {workspaces.workspaces
                .filter((item) => item.status !== 'committed')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
            {workspaces.error ? (
              <p role="alert" className="mt-2 text-xs">
                {workspaces.error}
              </p>
            ) : null}
            {binding ? (
              <div className="mt-4 border-t border-[var(--stroke-divider)] pt-3">
                <p className="text-xs font-semibold">
                  Active definition <LockKeyhole className="ml-1 inline size-3" />
                </p>
                <p className="mt-2 break-words text-sm">{binding.schemaName}</p>
                <p className="mt-1 font-mono text-xs text-[var(--status-info)]">
                  {binding.version}
                </p>
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-[var(--text-secondary)]">
                    Pinned hash
                  </summary>
                  <p className="mt-2 break-all font-mono text-[10px]">
                    {binding.schemaHash ?? 'Not recorded'}
                  </p>
                </details>
                <p className="mt-3 text-xs text-[var(--text-secondary)]">
                  Revision {target?.revision} ·{' '}
                  {target?.schemaReview.verdict === 'ready'
                    ? 'Schema review ready'
                    : 'Needs review'}
                </p>
                <Link
                  href={workspaceLink}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--status-info)]"
                >
                  Review in Workspace <ArrowRight className="size-3" />
                </Link>
              </div>
            ) : target ? (
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                No definition bound · revision {target.revision}
              </p>
            ) : null}
          </section>
          <section className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Checks</h2>
              <button
                type="button"
                aria-label="Refresh checks"
                onClick={() => {
                  preview.refresh();
                  void workspaces.refresh();
                }}
                disabled={applying}
                className="text-[var(--text-secondary)]"
              >
                <RefreshCw className="size-3.5" />
              </button>
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt>Definition</dt>
                <dd>{!data ? 'Not run' : data.report.valid ? 'Passed' : 'Needs review'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Execution</dt>
                <dd className="text-[var(--text-tertiary)]">Not run</dd>
              </div>
            </dl>
            {data?.report.issues.map((issue, index) => (
              <p
                key={`${issue.code}:${index}`}
                className="mt-3 text-xs text-[var(--status-warning)]"
              >
                {issue.message}
              </p>
            ))}
            {data && !data.adoption.allowed ? (
              <p role="alert" className="mt-3 text-xs text-[var(--status-warning)]">
                {data.adoption.reason}
              </p>
            ) : null}
            <Button
              className="mt-5 w-full"
              disabled={
                !data?.workspace ||
                !data.report.valid ||
                !data.adoption.allowed ||
                applying ||
                preview.loading
              }
              onClick={() => setReview(data)}
            >
              Review & apply <ArrowRight className="ml-2 size-4" />
            </Button>
            <p className="mt-2 text-[10px] leading-4 text-[var(--text-tertiary)]">
              Review the exact changes before updating your Workspace.
            </p>
          </section>
        </aside>
      </div>
      <div className="mt-6 border-t border-[var(--stroke-divider)] pt-4">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={advanced}
          onClick={() => setAdvanced((value) => !value)}
        >
          Advanced definition workbench
        </Button>
        {advanced ? <div className="mt-4">{children}</div> : null}
      </div>
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !applying) setReview(undefined);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apply exact definition</DialogTitle>
            <DialogDescription>
              {target?.title} · revision {review?.workspace?.revision}. Previous checks and proposed
              operations will be invalidated.
            </DialogDescription>
          </DialogHeader>
          {review ? (
            <>
              <div className="space-y-1 text-xs">
                {review.sources.map((source) => (
                  <p key={source.artifactVersionId} className="font-mono">
                    {source.canonicalName} · {source.version}
                  </p>
                ))}
              </div>
              <StudioChanges changes={review.workspace?.changes ?? []} />
              <details className="text-xs">
                <summary className="cursor-pointer">Reviewed definition hash</summary>
                <p className="mt-2 break-all font-mono">{review.schemaHash}</p>
              </details>
              {review.reviewHash !== data?.reviewHash ? (
                <div
                  role="alert"
                  className="rounded-md bg-[var(--status-warning-muted)] p-3 text-xs text-[var(--status-warning)]"
                >
                  The Workspace or selection changed. Review the updated changes before applying.
                  <Button
                    className="mt-2"
                    variant="outline"
                    size="sm"
                    disabled={!data || preview.loading || applying}
                    onClick={() => setReview(data)}
                  >
                    Refresh review
                  </Button>
                </div>
              ) : null}
              <div className="flex justify-end gap-3">
                <Button variant="outline" disabled={applying} onClick={() => setReview(undefined)}>
                  Cancel
                </Button>
                <Button
                  disabled={applying || review.reviewHash !== data?.reviewHash}
                  onClick={() => void apply()}
                >
                  {applying ? 'Applying…' : 'Confirm & apply'}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
