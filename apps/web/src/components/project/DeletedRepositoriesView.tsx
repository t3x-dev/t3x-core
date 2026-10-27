'use client';

import { ArrowLeft, CheckCircle2, Info, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
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
import palette from '@/styles/management-palette.module.css';
import type { Project } from '@/types/api';
import { cn } from '@/utils/cn';
import styles from './DeletedRepositoriesView.module.css';
import management from './RepositoryManagement.module.css';

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
  const [notice, setNotice] = useState<{
    message: string;
    href?: string;
    uncertain?: boolean;
  } | null>(null);
  const identity = target ? `${target.project.namespace ?? namespace}/${target.project.name}` : '';

  function close() {
    if (list.pending) return;
    if (error?.refreshRequired) {
      setNotice({ message: error.message, uncertain: true });
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
    <div className={cn(palette.scope, management.scope, styles.page)}>
      <Link href={backHref} scroll={false} className={management.backLink}>
        <ArrowLeft aria-hidden="true" className="size-4" /> Back to repositories
      </Link>
      <header className={management.heading}>
        <p className={management.context}>{namespace}</p>
        <h1>Deleted repositories</h1>
        <p>
          Restore repositories you still need, or permanently delete them to release their names.
        </p>
      </header>
      <div className={cn(management.notice, styles.retentionNote)}>
        <Info aria-hidden="true" className="size-4" />
        <p>
          Data and all names stay reserved until permanent deletion. Only repositories you can
          manage are shown.
        </p>
      </div>
      <div className={styles.toolbar}>
        <div>
          <h2>Repositories</h2>
          <output className={styles.listStatus} aria-live="polite">
            {list.loading
              ? 'Loading deleted repositories…'
              : list.error
                ? 'List unavailable'
                : `${list.projects.length} on this page`}
          </output>
        </div>
        <Button
          aria-label="Refresh deleted repositories"
          title="Refresh deleted repositories"
          disabled={list.loading || list.pending}
          onClick={() => void list.refresh()}
          size="icon"
          variant="outline"
        >
          <RefreshCw
            aria-hidden="true"
            className={list.loading ? 'size-4 animate-spin motion-reduce:animate-none' : 'size-4'}
          />
        </Button>
      </div>
      {notice && (
        <div className={cn(management.notice, styles.notice)}>
          {notice.uncertain ? (
            <Info aria-hidden="true" className="size-4" />
          ) : (
            <CheckCircle2 aria-hidden="true" className={cn('size-4', management.successIcon)} />
          )}
          <output>
            {notice.message} {notice.href && <Link href={notice.href}>Open repository</Link>}
          </output>
        </div>
      )}
      {list.error && (
        <div role="alert" className={cn(management.notice, styles.errorState)}>
          <p>Couldn&apos;t load deleted repositories. {list.error}</p>
          <Button disabled={list.loading} onClick={() => void list.refresh()} variant="outline">
            Retry
          </Button>
        </div>
      )}
      <div className={styles.listFrame} aria-busy={list.loading}>
        <div className={styles.columnHeadings} aria-hidden="true">
          <span>Repository</span>
          <span>Deleted</span>
          <span>Actions</span>
        </div>
        {list.loading && list.projects.length === 0 ? (
          <output className={cn('block', styles.loading)}>Loading deleted repositories...</output>
        ) : !list.error && list.projects.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <Trash2 className="size-5" />
            </span>
            <h2>No deleted repositories</h2>
            <p>No deleted repositories to manage in this namespace.</p>
            <p>Repositories you delete will appear here while their data is kept.</p>
          </div>
        ) : list.projects.length > 0 ? (
          <ul aria-label="Deleted repositories">
            {list.projects.map((project) => (
              <li key={project.project_id} className={styles.repository}>
                <div className={styles.repositoryCopy}>
                  <h3>{project.name}</h3>
                  <p className={styles.path}>
                    {project.namespace ?? namespace}/{project.name}
                  </p>
                  <p className={styles.visibility}>Visibility: {project.visibility}</p>
                </div>
                <p className={styles.deletedAt}>
                  <span className="sr-only">Deleted </span>
                  <span className={styles.mobileLabel} aria-hidden="true">
                    Deleted{' '}
                  </span>
                  {project.deleted_at ? (
                    <time dateTime={project.deleted_at}>
                      {new Date(project.deleted_at).toLocaleString()}
                    </time>
                  ) : (
                    'at an unknown time'
                  )}
                </p>
                <div className={styles.actions}>
                  {project.can_restore && (
                    <Button
                      disabled={list.pending || list.loading || Boolean(list.error)}
                      variant="outline"
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
                      disabled={list.pending || list.loading || Boolean(list.error)}
                      className={styles.permanentDelete}
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
        ) : null}
      </div>
      {(list.page > 1 || list.hasNext) && (
        <nav aria-label="Deleted repositories pagination" className={styles.pagination}>
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
        <DialogContent
          className={cn(palette.scope, management.scope, management.dialog, 'sm:max-w-[480px]')}
          showCloseButton={!list.pending}
        >
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
                variant={target?.action === 'restore' ? 'default' : 'destructive'}
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
        contentClassName={cn(palette.scope, management.scope, management.dialog)}
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
