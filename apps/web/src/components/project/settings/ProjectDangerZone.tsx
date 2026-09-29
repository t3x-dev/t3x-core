'use client';

import { TriangleAlert } from 'lucide-react';
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
import { formatUserFacingError } from '@/domain/format/errors';
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
  const [error, setError] = useState<string | null>(null);
  const commits = project.commits_count ?? project.stats?.commits_count ?? 0;
  const branches = project.branches_count ?? 0;

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (cause) {
      setError(formatUserFacingError(cause, 'Failed to delete repository.'));
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
            branch{branches === 1 ? '' : 'es'} from every list. This is a soft delete: the data is
            kept and can be restored through the API.
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
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete {project.name}?</DialogTitle>
            <DialogDescription>
              Type the repository name to confirm. Collaborators lose access immediately.
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
              {error}
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
            <Button
              disabled={deleting || confirmation !== project.name}
              onClick={() => void handleDelete()}
              type="button"
              variant="destructive"
            >
              {deleting ? 'Deleting...' : 'Delete repository'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
