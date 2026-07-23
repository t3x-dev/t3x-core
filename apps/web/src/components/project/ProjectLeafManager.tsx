'use client';

import {
  CheckCircle2,
  FileOutput,
  GitCommitHorizontal,
  Layers3,
  Loader2,
  Plus,
  Search,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { commitHashLabel } from '@/domain/format/formatters';
import type {
  ProjectOutputArtifact,
  ProjectOutputStatus,
  ProjectOutputTargetCandidate,
} from '@/domain/outputs/projectOutputs';
import type { WorkspaceCandidate, WorkspaceOutputTarget } from '@/types/workspaces';
import { cn } from '@/utils/cn';

interface ProjectLeafManagerProps {
  artifacts: ProjectOutputArtifact[];
  availableTargets: ProjectOutputTargetCandidate[];
  createError: string | null;
  creatingTargetId: string | null;
  onCreate: (
    workspace: WorkspaceCandidate,
    target: WorkspaceOutputTarget,
    title: string
  ) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onSelect: (leafId: string) => void;
  open: boolean;
  selectedLeafId: string | null;
}

export function ProjectLeafManager({
  artifacts,
  availableTargets,
  createError,
  creatingTargetId,
  onCreate,
  onOpenChange,
  onSelect,
  open,
  selectedLeafId,
}: ProjectLeafManagerProps) {
  const [query, setQuery] = useState('');
  const [createCandidate, setCreateCandidate] = useState<ProjectOutputTargetCandidate | null>(null);
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!createCandidate) return;
    setTitle(createCandidate.target.title);
  }, [createCandidate]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredArtifacts = useMemo(
    () =>
      artifacts.filter((artifact) => {
        if (!normalizedQuery) return true;
        return [
          artifact.leaf.title,
          artifact.leaf.type,
          artifact.workspace?.title,
          artifact.leaf.commit_hash,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
      }),
    [artifacts, normalizedQuery]
  );
  const filteredTargets = useMemo(
    () =>
      availableTargets.filter((candidate) => {
        if (!normalizedQuery) return true;
        return [
          candidate.target.title,
          candidate.target.type,
          candidate.target.format,
          candidate.workspace.title,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      }),
    [availableTargets, normalizedQuery]
  );

  const handleCreate = async () => {
    if (!createCandidate || creatingTargetId) return;
    try {
      await onCreate(createCandidate.workspace, createCandidate.target, title.trim());
      setCreateCandidate(null);
      onOpenChange(false);
    } catch {
      // The parent owns the user-facing error state so the dialog can stay open for retry.
    }
  };

  return (
    <>
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent
          aria-label="Leaf manager"
          className="w-[min(420px,92vw)] gap-0 border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-0 sm:max-w-[420px]"
          side="left"
        >
          <SheetHeader className="border-b border-[var(--stroke-divider)] px-5 py-5 pr-12 text-left">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent-leaf)]">
              Outputs
            </span>
            <SheetTitle className="text-xl text-[var(--text-primary)]">Manage Leaves</SheetTitle>
            <SheetDescription className="leading-5 text-[var(--text-secondary)]">
              Open an existing Leaf or create one from an eligible committed output target.
            </SheetDescription>
          </SheetHeader>

          <div className="border-b border-[var(--stroke-divider)] p-4">
            <label className="relative block" htmlFor="leaf-manager-search">
              <span className="sr-only">Search Leaves</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]"
              />
              <Input
                className="h-9 border-[var(--stroke-default)] bg-[var(--surface-card)] pl-9 text-xs"
                id="leaf-manager-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Leaves"
                value={query}
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            <ManagerSection count={filteredArtifacts.length} title="Existing Leaves">
              {filteredArtifacts.length > 0 ? (
                <div className="grid gap-2">
                  {filteredArtifacts.map((artifact) => {
                    const name = artifact.leaf.title?.trim() || `${artifact.leaf.type} Leaf`;
                    const selected = artifact.leaf.id === selectedLeafId;
                    return (
                      <button
                        aria-current={selected ? 'page' : undefined}
                        className={cn(
                          'grid min-w-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
                          selected
                            ? 'border-[var(--accent-leaf)]/45 bg-[var(--accent-leaf-soft)]'
                            : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)]'
                        )}
                        key={artifact.id}
                        onClick={() => {
                          onSelect(artifact.leaf.id);
                          onOpenChange(false);
                        }}
                        type="button"
                      >
                        <span className="flex size-9 items-center justify-center rounded-md border border-[var(--accent-leaf)]/20 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]">
                          <FileOutput aria-hidden="true" className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                            {name}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-[var(--text-secondary)]">
                            {formatValue(artifact.leaf.type)} ·{' '}
                            {artifact.workspace?.title ?? 'Unlinked Leaf'}
                          </span>
                          <span className="mt-1 block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                            {commitHashLabel(artifact.leaf.commit_hash)}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-2">
                          <ArtifactStatusBadge status={artifact.status} />
                          {selected ? (
                            <CheckCircle2
                              aria-label="Currently open"
                              className="size-4 text-[var(--accent-leaf)]"
                            />
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <ManagerEmptyState>No existing Leaves match this search.</ManagerEmptyState>
              )}
            </ManagerSection>

            <ManagerSection count={filteredTargets.length} title="Available to create">
              <p className="mb-3 text-xs leading-5 text-[var(--text-secondary)]">
                Committed Workspace output targets that do not have a Leaf yet.
              </p>
              {filteredTargets.length > 0 ? (
                <div className="grid gap-2">
                  {filteredTargets.map((candidate) => (
                    <article
                      className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-dashed border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 py-3"
                      key={candidate.id}
                    >
                      <span className="flex size-9 items-center justify-center rounded-md border border-[var(--accent-leaf)]/20 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]">
                        <Layers3 aria-hidden="true" className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                          {candidate.target.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-[var(--text-secondary)]">
                          {formatValue(candidate.target.type)} /{' '}
                          {candidate.target.format.toUpperCase()}
                          {' · '}
                          {candidate.workspace.title}
                        </span>
                        <span className="mt-1 block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                          {commitHashLabel(candidate.workspace.lastCommitHash ?? '')}
                        </span>
                      </span>
                      <Button
                        aria-label={`Create Leaf: ${candidate.target.title}`}
                        onClick={() => setCreateCandidate(candidate)}
                        size="sm"
                        type="button"
                        variant="canvas-outline"
                      >
                        <Plus aria-hidden="true" className="size-3.5" />
                        Create
                      </Button>
                    </article>
                  ))}
                </div>
              ) : (
                <ManagerEmptyState>
                  No committed output targets are ready to create.
                </ManagerEmptyState>
              )}
            </ManagerSection>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !creatingTargetId) setCreateCandidate(null);
        }}
        open={Boolean(createCandidate)}
      >
        <DialogContent className="border-[var(--stroke-divider)] bg-[var(--surface-card)] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create Leaf</DialogTitle>
            <DialogDescription>
              Create a working output from the selected committed Workspace target.
            </DialogDescription>
          </DialogHeader>

          {createCandidate ? (
            <div className="grid gap-4 py-1">
              <div className="grid gap-2">
                <Label htmlFor="output-leaf-title">Leaf title</Label>
                <Input
                  disabled={Boolean(creatingTargetId)}
                  id="output-leaf-title"
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
              </div>

              <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-subtle)] p-3">
                <span className="flex size-9 items-center justify-center rounded-md border border-[var(--accent-leaf)]/20 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]">
                  <GitCommitHorizontal aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                    {createCandidate.target.title}
                  </span>
                  <span className="mt-1 block truncate text-xs text-[var(--text-secondary)]">
                    {createCandidate.workspace.title} ·{' '}
                    {commitHashLabel(createCandidate.workspace.lastCommitHash ?? '')}
                  </span>
                </span>
                <CheckCircle2
                  aria-label="Committed target"
                  className="size-5 text-[var(--status-success)]"
                />
              </div>

              {createError ? (
                <p
                  className="rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] px-3 py-2 text-sm text-[var(--status-error)]"
                  role="alert"
                >
                  {createError}
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              disabled={Boolean(creatingTargetId)}
              onClick={() => setCreateCandidate(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={Boolean(creatingTargetId) || title.trim().length === 0}
              onClick={() => void handleCreate()}
              type="button"
              variant="leaf"
            >
              {creatingTargetId ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Plus aria-hidden="true" className="size-4" />
              )}
              {creatingTargetId ? 'Creating Leaf' : 'Create Leaf'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ManagerSection({
  children,
  count,
  title,
}: {
  children: ReactNode;
  count: number;
  title: string;
}) {
  return (
    <section className="border-b border-[var(--stroke-divider)] py-5 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
          {title}
        </h3>
        <Badge variant="outline">{count}</Badge>
      </div>
      {children}
    </section>
  );
}

function ManagerEmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-subtle)] px-3 py-5 text-center text-xs leading-5 text-[var(--text-secondary)]">
      {children}
    </p>
  );
}

function ArtifactStatusBadge({ status }: { status: ProjectOutputStatus }) {
  const presentation: Record<
    ProjectOutputStatus,
    { label: string; variant: 'leaf' | 'pending' | 'warning' | 'outline' }
  > = {
    fresh: { label: 'Fresh', variant: 'leaf' },
    ready: { label: 'Ready', variant: 'pending' },
    stale: { label: 'Stale', variant: 'warning' },
    unknown: { label: 'Unknown', variant: 'outline' },
  };
  const item = presentation[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

function formatValue(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
