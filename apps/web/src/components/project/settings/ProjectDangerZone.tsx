'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
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
import { getDeletedRepositoriesPath } from '@/domain/project/repoPath';
import { repositoryMutationError } from '@/hooks/projects/useDeletedProjects';
import palette from '@/styles/management-palette.module.css';
import type { ProjectDetail } from '@/types/api';
import { SettingsSection } from './SettingsSection';

export function ProjectDangerZone({
  onDelete,
  project,
}: {
  onDelete: () => Promise<void>;
  project: ProjectDetail;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<ReturnType<typeof repositoryMutationError> | null>(null);
  const commits = project.commits_count ?? project.stats?.commits_count ?? 0;
  const branches = project.branches_count ?? 0;

  async function handleDelete() {
    if (deleting || error?.refreshRequired) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (cause) {
      setError(repositoryMutationError(cause));
      setDeleting(false);
    }
  }

  return (
    <SettingsSection
      description="Actions here affect everyone with access to this repository."
      icon={TriangleAlert}
      id="danger"
      title="Danger zone"
      tone="danger"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">
            Delete this repository
          </p>
          <p className="mt-0.5 max-w-[520px] text-xs leading-[17px] text-[var(--text-secondary)]">
            Removes {project.name} with {commits} commit{commits === 1 ? '' : 's'} across {branches}{' '}
            branch{branches === 1 ? '' : 'es'} from active lists. Its data and all names stay
            reserved. Restore it or permanently delete it and release its names from{' '}
            <Link
              href={getDeletedRepositoriesPath(project.namespace)}
              className="text-[var(--accent-commit)] underline"
            >
              Deleted repositories
            </Link>
            .
          </p>
        </div>
        <Button onClick={() => setOpen(true)} type="button" variant="destructive">
          Delete repository
        </Button>
      </div>

      <Dialog
        onOpenChange={(next) => {
          if (deleting) return;
          setOpen(next);
          if (!next) {
            setConfirmation('');
            setError(null);
          }
        }}
        open={open}
      >
        <DialogContent className={`${palette.scope} sm:max-w-[420px]`}>
          <DialogHeader>
            <DialogTitle>Delete {project.name}?</DialogTitle>
            <DialogDescription>
              Type the repository name to confirm. Collaborators lose access immediately. Data and
              names are kept. You can restore the repository from Deleted repositories.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Repository name confirmation"
            autoComplete="off"
            disabled={deleting}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={project.name}
            value={confirmation}
          />
          {error ? (
            <p className="text-xs text-[var(--status-error)]" role="alert">
              {error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              disabled={deleting}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            {error?.refreshRequired ? (
              <Button asChild variant="canvas-outline">
                <Link href={getDeletedRepositoriesPath(project.namespace)}>
                  Check deleted repositories
                </Link>
              </Button>
            ) : (
              <Button
                disabled={deleting || confirmation !== project.name}
                onClick={() => void handleDelete()}
                type="button"
                variant="destructive"
              >
                {deleting ? 'Deleting...' : 'Delete repository'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
