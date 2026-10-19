'use client';

import { ArrowLeft, RefreshCw, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AlertDialog } from '@/components/ui/alert-dialog';
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
import { getProjectRepoPath } from '@/domain/project/repoPath';
import { repositoryMutationError, useDeletedProjects } from '@/hooks/projects/useDeletedProjects';
import type { Project } from '@/types/api';

export function DeletedRepositoriesView({
  namespace,
  backHref,
}: {
  namespace: string;
  backHref: string;
}) {
  const list = useDeletedProjects(namespace);
  const [target, setTarget] = useState<{ project: Project; action: 'restore' | 'delete' } | null>(
    null
  );
  const [confirmation, setConfirmation] = useState('');
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [error, setError] = useState<ReturnType<typeof repositoryMutationError> | null>(null);
  const [notice, setNotice] = useState<{ message: string; href?: string } | null>(null);
  const identity = target ? `${target.project.namespace ?? namespace}/${target.project.name}` : '';

  function close() {
    if (list.pending) return;
    if (error?.refreshRequired) {
      setNotice({ message: error.message });
      void list.refresh();
    }
    setTarget(null);
    setConfirmation('');
    setDeleteConfirmationOpen(false);
    setError(null);
  }

  async function confirm() {
    if (!target || list.pending || error?.refreshRequired) return;
    if (target.action === 'delete' && (confirmation !== identity || !deleteConfirmationOpen))
      return;
    setError(null);
    try {
      const result = await list.mutate(target.project, target.action);
      if (!result) return;
      setNotice(
        result.restored
          ? {
              message: `${target.project.name} was restored.`,
              href: getProjectRepoPath(result.restored),
            }
          : {
              message: `${target.project.name} was permanently deleted. Its current and historical names are now available.`,
            }
      );
      setTarget(null);
      setConfirmation('');
      setDeleteConfirmationOpen(false);
    } catch (cause) {
      setDeleteConfirmationOpen(false);
      setError(repositoryMutationError(cause));
    }
  }

  return (
    <div className="space-y-5">
      <Link
        href={backHref}
        scroll={false}
        className="inline-flex items-center gap-2 text-sm text-[var(--accent-commit)] hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Back to repositories
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2>Deleted repositories</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Data and all names stay reserved until permanent deletion. Only repositories you can
            manage are shown.
          </p>
        </div>
        <Button
          aria-label="Refresh deleted repositories"
          disabled={list.loading || list.pending}
          onClick={() => void list.refresh()}
          size="icon"
          variant="canvas-outline"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {notice && (
        <div role="status" className="rounded-md border border-[var(--stroke-divider)] p-3 text-sm">
          {notice.message}{' '}
          {notice.href && (
            <Link href={notice.href} className="text-[var(--accent-commit)] underline">
              Open repository
            </Link>
          )}
        </div>
      )}
      {list.error ? (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-[var(--stroke-divider)] p-4"
        >
          <p>Couldn&apos;t load deleted repositories. {list.error}</p>
          <Button
            disabled={list.loading}
            onClick={() => void list.refresh()}
            variant="canvas-outline"
          >
            Retry
          </Button>
        </div>
      ) : list.loading ? (
        <p role="status" className="py-5 text-sm text-[var(--text-secondary)]">
          Loading deleted repositories...
        </p>
      ) : list.projects.length === 0 ? (
        <p className="py-5 text-sm text-[var(--text-secondary)]">
          No deleted repositories to manage in this namespace.
        </p>
      ) : (
        <ul
          aria-label="Deleted repositories"
          className="divide-y divide-[var(--stroke-divider)] rounded-md border border-[var(--stroke-divider)]"
        >
          {list.projects.map((project) => (
            <li
              key={project.project_id}
              className="flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0 flex-1 basis-48">
                <p className="break-words text-sm font-semibold">{project.name}</p>
                <p className="mt-1 break-all text-xs text-[var(--text-secondary)]">
                  {project.namespace ?? namespace}/{project.name}
                </p>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  Visibility: {project.visibility} · Deleted{' '}
                  {project.deleted_at ? (
                    <time dateTime={project.deleted_at}>
                      {new Date(project.deleted_at).toLocaleString()}
                    </time>
                  ) : (
                    'at an unknown time'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {project.can_restore && (
                  <Button
                    disabled={list.pending}
                    variant="canvas-outline"
                    onClick={() => {
                      setTarget({ project, action: 'restore' });
                      setError(null);
                      setConfirmation('');
                    }}
                  >
                    <RotateCcw aria-hidden="true" className="size-4" /> Restore
                  </Button>
                )}
                {project.can_permanently_delete && (
                  <Button
                    disabled={list.pending}
                    className="text-[var(--status-error)]"
                    variant="ghost"
                    onClick={() => {
                      setTarget({ project, action: 'delete' });
                      setError(null);
                      setConfirmation('');
                    }}
                  >
                    Permanently delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {(list.page > 1 || list.hasNext) && (
        <nav
          aria-label="Deleted repositories pagination"
          className="flex items-center justify-end gap-3"
        >
          <Button
            disabled={list.loading || list.pending || list.page === 1}
            variant="canvas-outline"
            onClick={() => void list.previous()}
          >
            Previous
          </Button>
          <span className="text-sm">Page {list.page}</span>
          <Button
            disabled={list.loading || list.pending || !list.hasNext || Boolean(list.error)}
            variant="canvas-outline"
            onClick={() => void list.next()}
          >
            Next
          </Button>
        </nav>
      )}
      <Dialog
        open={Boolean(target) && !deleteConfirmationOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {target?.action === 'restore'
                ? 'Restore repository?'
                : 'Permanently delete repository?'}
            </DialogTitle>
            <DialogDescription className="break-words">
              {target?.action === 'restore'
                ? `Restore ${identity} with its original data, addresses and ${target.project.visibility} visibility.`
                : `Permanently delete ${identity} and its data? This cannot be undone. All of its current and historical names will be released. Old addresses may later point to a different repository.`}
            </DialogDescription>
          </DialogHeader>
          {target?.action === 'restore' ? (
            <p className="text-sm text-[var(--text-secondary)]">
              {target.project.visibility === 'public'
                ? 'Anyone will be able to access this public repository again.'
                : target.project.visibility === 'unlisted'
                  ? 'Anyone with its address will be able to access this unlisted repository again.'
                  : 'Access will resume for people who currently have permission to this private repository.'}
            </p>
          ) : (
            <div className="space-y-2">
              <label htmlFor="permanent-delete-confirmation" className="block break-all text-sm">
                Type {identity} to confirm.
              </label>
              <Input
                id="permanent-delete-confirmation"
                autoComplete="off"
                disabled={list.pending || error?.refreshRequired}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-[var(--status-error)]">
              {error.message}
            </p>
          )}
          <DialogFooter>
            <Button disabled={list.pending} onClick={close} variant="outline">
              Cancel
            </Button>
            {error?.refreshRequired ? (
              <Button
                onClick={() => {
                  close();
                }}
                variant="canvas-outline"
              >
                Refresh list
              </Button>
            ) : (
              <Button
                disabled={
                  list.pending || (target?.action === 'delete' && confirmation !== identity)
                }
                onClick={() => {
                  if (target?.action === 'delete') setDeleteConfirmationOpen(true);
                  else void confirm();
                }}
                variant={target?.action === 'restore' ? 'commit' : 'destructive'}
              >
                {list.pending
                  ? 'Working...'
                  : target?.action === 'restore'
                    ? 'Restore repository'
                    : 'Permanently delete repository'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deleteConfirmationOpen && target?.action === 'delete'}
        onOpenChange={(open) => {
          if (!list.pending) setDeleteConfirmationOpen(open);
        }}
        title="Confirm permanent deletion"
        description={`You are about to permanently delete ${identity} and all of its data. This cannot be undone or restored. Its current and historical names will become available for reuse.`}
        confirmLabel="Confirm permanent deletion"
        variant="destructive"
        loading={list.pending}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}
