'use client';

import { ArrowLeft, CheckCircle2, Info, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
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
import { RepositoryMark, RepositoryVisibility } from './RepositoryIdentity';
import management from './RepositoryManagement.module.css';
import { RepositorySelect } from './RepositorySelect';

export function DeletedRepositoriesView({
  namespace,
  backHref,
}: {
  namespace: string;
  backHref: string;
}) {
  const list = useDeletedProjects(namespace, true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('deleted');
  const [page, setPage] = useState(1);
  const matching = list.projects.filter((project) =>
    `${project.name} ${project.metadata?.description ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );
  matching.sort((a, b) =>
    sort === 'name'
      ? a.name.localeCompare(b.name)
      : Date.parse(b.deleted_at ?? '') - Date.parse(a.deleted_at ?? '')
  );
  const totalPages = Math.max(1, Math.ceil(matching.length / 4));
  const currentPage = Math.min(page, totalPages);
  const displayed = matching.slice((currentPage - 1) * 4, currentPage * 4);
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
        <label className={styles.search} htmlFor="deleted-repository-search">
          <Search aria-hidden="true" size={16} />
          <Input
            id="deleted-repository-search"
            type="search"
            aria-label="Search deleted repositories"
            placeholder="Find a deleted repository…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <RepositorySelect
          label="Sort deleted repositories"
          value={sort}
          onValueChange={(value) => {
            setSort(value);
            setPage(1);
          }}
          options={[
            { value: 'deleted', label: 'Recently deleted' },
            { value: 'name', label: 'Name A–Z' },
          ]}
        />
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
      <output className={styles.listStatus} aria-live="polite">
        {list.loading
          ? 'Loading deleted repositories…'
          : list.error
            ? 'List unavailable'
            : `${matching.length} ${query.trim() ? 'matching ' : ''}repositories`}
      </output>
      {notice && (
        <div
          className={cn(
            management.notice,
            !notice.uncertain && management.successNotice,
            styles.notice
          )}
        >
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
          <ul aria-label="Deleted repositories" className={styles.cards}>
            {displayed.map((project) => (
              <li key={project.project_id} className={styles.repository}>
                <div className={styles.cardBody}>
                  <RepositoryMark id={project.project_id} />
                  <div className={styles.repositoryCopy}>
                    <h3 title={`${project.namespace ?? namespace}/${project.name}`}>
                      {project.name}
                    </h3>
                    {typeof project.metadata?.description === 'string' &&
                      project.metadata.description.trim() && (
                        <p className={styles.description}>{project.metadata.description}</p>
                      )}
                    <div className={styles.metadata}>
                      <RepositoryVisibility value={project.visibility} />
                      <p className={styles.deletedAt}>
                        Deleted{' '}
                        {project.deleted_at ? (
                          <time
                            dateTime={project.deleted_at}
                            title={new Date(project.deleted_at).toLocaleString()}
                          >
                            {new Date(project.deleted_at).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </time>
                        ) : (
                          'at an unknown time'
                        )}
                      </p>
                    </div>
                  </div>
                </div>
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
      {!list.loading && !list.error && list.projects.length > 0 && matching.length === 0 && (
        <div className={styles.emptyState}>
          <Search aria-hidden="true" size={20} />
          <h2>No repositories found</h2>
          <p>Try another name or description.</p>
          <Button
            variant="outline"
            onClick={() => {
              setQuery('');
              setPage(1);
            }}
          >
            Clear search
          </Button>
        </div>
      )}
      {!list.error && (
        <footer className={styles.pagination}>
          <span>
            {matching.length ? (currentPage - 1) * 4 + 1 : 0}–
            {Math.min(currentPage * 4, matching.length)} of {matching.length} repositories
          </span>
          <nav aria-label="Deleted repositories pagination">
            <Button
              disabled={list.loading || list.pending || currentPage === 1}
              variant="outline"
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <Button
              disabled={list.loading || list.pending || currentPage >= totalPages}
              variant="outline"
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </nav>
        </footer>
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
                variant={target?.action === 'restore' ? 'outline' : 'destructive'}
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
