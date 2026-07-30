'use client';

import {
  CheckCircle2,
  FileOutput,
  GitCommitHorizontal,
  Loader2,
  Plus,
  Search,
  Trash2,
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
  ProjectLeafCreateCandidate,
  ProjectOutputArtifact,
  ProjectOutputStatus,
} from '@/domain/outputs/projectOutputs';
import type { ApiCommit, LeafType } from '@/types/api';
import { cn } from '@/utils/cn';

interface ProjectLeafManagerProps {
  artifacts: ProjectOutputArtifact[];
  createCandidates: ProjectLeafCreateCandidate[];
  createError: string | null;
  creatingTargetId: string | null;
  deleteError: string | null;
  deletingLeafId: string | null;
  onCreate: (commit: ApiCommit, leafType: LeafType, title: string) => Promise<void>;
  onDelete: (artifact: ProjectOutputArtifact) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onSelect: (leafId: string) => void;
  open: boolean;
  selectedLeafId: string | null;
}

const DEFAULT_LEAF_TYPE: LeafType = 'article';

const LEAF_TYPE_OPTIONS: Array<{ label: string; type: LeafType }> = [
  { type: 'article', label: 'Blog post' },
  { type: 'tweet', label: 'X / Twitter' },
  { type: 'linkedin', label: 'LinkedIn' },
  { type: 'reddit', label: 'Reddit' },
  { type: 'threads', label: 'Threads' },
  { type: 'email', label: 'Email' },
  { type: 'slack', label: 'Slack' },
  { type: 'deploy_agent', label: 'Deploy Agent' },
];

export function ProjectLeafManager({
  artifacts,
  createCandidates,
  createError,
  creatingTargetId,
  deleteError,
  deletingLeafId,
  onCreate,
  onDelete,
  onOpenChange,
  onSelect,
  open,
  selectedLeafId,
}: ProjectLeafManagerProps) {
  const [query, setQuery] = useState('');
  const [createCandidate, setCreateCandidate] = useState<ProjectLeafCreateCandidate | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<ProjectOutputArtifact | null>(null);
  const [leafType, setLeafType] = useState<LeafType>(DEFAULT_LEAF_TYPE);
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!createCandidate) return;
    setLeafType(DEFAULT_LEAF_TYPE);
    setTitle(defaultLeafTitle(DEFAULT_LEAF_TYPE));
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
  const filteredCreateCandidates = useMemo(
    () =>
      createCandidates.filter((candidate) => {
        if (!normalizedQuery) return true;
        return [
          candidate.commit.message,
          candidate.commit.branch,
          candidate.commit.hash,
          ...candidate.workspaces.map((workspace) => workspace.title),
          ...candidate.existingLeaves.map((leaf) => leaf.title),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
      }),
    [createCandidates, normalizedQuery]
  );

  const handleCreate = async () => {
    if (!createCandidate || creatingTargetId) return;
    try {
      await onCreate(createCandidate.commit, leafType, title.trim());
      setCreateCandidate(null);
      onOpenChange(false);
    } catch {
      // The parent owns the user-facing error state so the dialog can stay open for retry.
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate || deletingLeafId) return;
    try {
      await onDelete(deleteCandidate);
      setDeleteCandidate(null);
    } catch {
      // The parent owns the user-facing error state so the dialog can stay open for retry.
    }
  };

  const handleLeafTypeChange = (nextLeafType: LeafType) => {
    if (createCandidate && title === defaultLeafTitle(leafType)) {
      setTitle(defaultLeafTitle(nextLeafType));
    }
    setLeafType(nextLeafType);
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
                      <article
                        aria-current={selected ? 'page' : undefined}
                        className={cn(
                          'grid min-w-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
                          selected
                            ? 'border-[var(--accent-leaf)]/45 bg-[var(--accent-leaf-soft)]'
                            : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)]'
                        )}
                        key={artifact.id}
                      >
                        <span className="flex size-9 items-center justify-center rounded-md border border-[var(--accent-leaf)]/20 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]">
                          <FileOutput aria-hidden="true" className="size-4" />
                        </span>
                        <button
                          aria-label={`Open Leaf: ${name}`}
                          className="min-w-0 text-left outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-[var(--accent-leaf)]/35"
                          onClick={() => {
                            onSelect(artifact.leaf.id);
                            onOpenChange(false);
                          }}
                          type="button"
                        >
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
                        </button>
                        <span className="flex flex-col items-end gap-2">
                          <span className="flex items-center gap-1.5">
                            <ArtifactStatusBadge status={artifact.status} />
                            <Button
                              aria-label={`Delete Leaf: ${name}`}
                              className="size-7 text-[var(--status-error)] hover:text-[var(--status-error)]"
                              disabled={Boolean(deletingLeafId)}
                              onClick={() => setDeleteCandidate(artifact)}
                              size="icon-sm"
                              type="button"
                              variant="canvas-ghost"
                            >
                              {deletingLeafId === artifact.leaf.id ? (
                                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 aria-hidden="true" className="size-3.5" />
                              )}
                            </Button>
                          </span>
                          {selected ? (
                            <CheckCircle2
                              aria-label="Currently open"
                              className="size-4 text-[var(--accent-leaf)]"
                            />
                          ) : null}
                        </span>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <ManagerEmptyState>No existing Leaves match this search.</ManagerEmptyState>
              )}
            </ManagerSection>

            <ManagerSection count={filteredCreateCandidates.length} title="Available to create">
              <p className="mb-3 text-xs leading-5 text-[var(--text-secondary)]">
                Committed versions across branches. Existing Leaves do not remove a version from
                this list.
              </p>
              {filteredCreateCandidates.length > 0 ? (
                <div className="grid gap-2">
                  {filteredCreateCandidates.map((candidate) => (
                    <article
                      className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-dashed border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 py-3"
                      key={candidate.id}
                    >
                      <span className="flex size-9 items-center justify-center rounded-md border border-[var(--accent-leaf)]/20 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]">
                        <GitCommitHorizontal aria-hidden="true" className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                          {commitTitle(candidate.commit)}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-[var(--text-secondary)]">
                          {candidate.commit.branch || 'main'} · {candidate.existingLeaves.length}{' '}
                          {candidate.existingLeaves.length === 1
                            ? 'existing Leaf'
                            : 'existing Leaves'}
                          {candidate.workspaces.length > 0
                            ? ` · ${candidate.workspaces.map((workspace) => workspace.title).join(', ')}`
                            : ''}
                        </span>
                        <span className="mt-1 block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                          {commitHashLabel(candidate.commit.hash)}
                        </span>
                      </span>
                      <Button
                        aria-label={`Create Leaf: ${candidate.commit.hash}`}
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
                <ManagerEmptyState>No committed versions are ready to create.</ManagerEmptyState>
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
              Create a working output from the selected committed version.
            </DialogDescription>
          </DialogHeader>

          {createCandidate ? (
            <div className="grid gap-4 py-1">
              <div className="grid gap-2">
                <Label htmlFor="output-leaf-type">Leaf type</Label>
                <select
                  className="h-9 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-leaf)]"
                  disabled={Boolean(creatingTargetId)}
                  id="output-leaf-type"
                  onChange={(event) => handleLeafTypeChange(event.target.value as LeafType)}
                  value={leafType}
                >
                  {LEAF_TYPE_OPTIONS.map((option) => (
                    <option key={option.type} value={option.type}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

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
                    {commitTitle(createCandidate.commit)}
                  </span>
                  <span className="mt-1 block truncate text-xs text-[var(--text-secondary)]">
                    {createCandidate.commit.branch || 'main'} ·{' '}
                    {commitHashLabel(createCandidate.commit.hash)} ·{' '}
                    {createCandidate.existingLeaves.length}{' '}
                    {createCandidate.existingLeaves.length === 1
                      ? 'existing Leaf'
                      : 'existing Leaves'}
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

      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deletingLeafId) setDeleteCandidate(null);
        }}
        open={Boolean(deleteCandidate)}
      >
        <DialogContent
          className="border-[var(--stroke-divider)] bg-[var(--surface-card)] sm:max-w-[440px]"
          showCloseButton={!deletingLeafId}
        >
          <DialogHeader>
            <DialogTitle>Delete Leaf</DialogTitle>
            <DialogDescription>
              Delete this persisted Leaf. The committed version will remain available for new
              Leaves.
            </DialogDescription>
          </DialogHeader>

          {deleteCandidate ? (
            <div className="grid gap-4 py-1">
              <div className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-subtle)] p-3">
                <span className="flex size-9 items-center justify-center rounded-md border border-[var(--accent-leaf)]/20 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]">
                  <FileOutput aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                    {deleteCandidate.leaf.title?.trim() ||
                      `${formatValue(deleteCandidate.leaf.type)} Leaf`}
                  </span>
                  <span className="mt-1 block truncate text-xs text-[var(--text-secondary)]">
                    {formatValue(deleteCandidate.leaf.type)} ·{' '}
                    {commitHashLabel(deleteCandidate.leaf.commit_hash)}
                  </span>
                </span>
              </div>

              {deleteError ? (
                <p
                  className="rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] px-3 py-2 text-sm text-[var(--status-error)]"
                  role="alert"
                >
                  {deleteError}
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              disabled={Boolean(deletingLeafId)}
              onClick={() => setDeleteCandidate(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={Boolean(deletingLeafId)}
              onClick={() => void handleDelete()}
              type="button"
              variant="destructive"
            >
              {deletingLeafId ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" className="size-4" />
              )}
              {deletingLeafId ? 'Deleting Leaf' : 'Delete Leaf'}
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

function commitTitle(commit: ApiCommit): string {
  const message = commit.message?.trim();
  return message || `Commit ${commitHashLabel(commit.hash)}`;
}

function defaultLeafTitle(leafType: LeafType): string {
  const leafLabel =
    LEAF_TYPE_OPTIONS.find((option) => option.type === leafType)?.label ?? formatValue(leafType);
  return leafLabel;
}
