'use client';

import { GitBranch } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
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
import { commitHashLabel } from '@/domain/format/formatters';

interface StateBranchControlsProps {
  branch: string;
  branchOptions: string[];
  headCommitHash: string | null;
  onBranchChange: (branch: string) => void;
  onCreateBranch: (name: string) => Promise<void>;
}

export function StateBranchControls({
  branch,
  branchOptions,
  headCommitHash,
  onBranchChange,
  onCreateBranch,
}: StateBranchControlsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const normalizedName = normalizeBranchName(name);
  const validationError = getBranchNameError(normalizedName, branchOptions);

  useEffect(() => {
    if (dialogOpen) return;
    setName('');
    setSubmitError(null);
    setSubmitting(false);
  }, [dialogOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationError || !normalizedName || submitting) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      await onCreateBranch(normalizedName);
      setDialogOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not create branch.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label className="inline-flex h-7.5 min-w-0 items-center gap-2 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--stroke-strong)]">
        <GitBranch aria-hidden="true" className="size-3.5 text-[var(--accent-branch)] opacity-90" />
        <span className="sr-only">Branch</span>
        <select
          aria-label="Branch focus"
          className="min-w-0 cursor-pointer bg-transparent font-mono text-xs font-medium text-[var(--text-primary)] outline-none"
          onChange={(event) => onBranchChange(event.target.value)}
          value={branch}
        >
          {branchOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <Button
        className="h-7.5 text-xs font-medium px-2.5"
        onClick={() => setDialogOpen(true)}
        size="sm"
        type="button"
        variant="canvas-outline"
      >
        New branch
      </Button>

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Create a new branch</DialogTitle>
              <DialogDescription>Start a new line of structured state from main.</DialogDescription>
            </DialogHeader>

            <div className="mt-5 grid gap-4">
              <label
                className="grid gap-1.5 text-sm font-semibold text-[var(--text-primary)]"
                htmlFor="new-branch-name"
              >
                Branch name
                <Input
                  aria-describedby="new-branch-help"
                  autoFocus
                  id="new-branch-name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="feature/checkout-retry"
                  value={name}
                />
              </label>
              <div
                className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-2.5"
                id="new-branch-help"
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                  Branch source
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="font-mono font-bold text-[var(--text-primary)]">main</span>
                  <span>at</span>
                  <span className="font-mono text-xs">
                    {headCommitHash ? commitHashLabel(headCommitHash) : 'empty state'}
                  </span>
                </div>
              </div>
              {name && validationError ? (
                <p className="text-xs font-semibold text-[var(--status-warning)]" role="alert">
                  {validationError}
                </p>
              ) : submitError ? (
                <p className="text-xs font-semibold text-[var(--status-warning)]" role="alert">
                  {submitError}
                </p>
              ) : (
                <p className="text-xs text-[var(--text-tertiary)]">
                  Use letters, numbers, dots, slashes, underscores, or hyphens.
                </p>
              )}
            </div>

            <DialogFooter className="mt-6">
              <Button onClick={() => setDialogOpen(false)} type="button" variant="canvas-outline">
                Cancel
              </Button>
              <Button
                disabled={!normalizedName || Boolean(validationError) || submitting}
                type="submit"
              >
                {submitting ? 'Creating…' : 'Create branch'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function normalizeBranchName(value: string): string {
  return value.trim().replace(/\s+/g, '-');
}

function getBranchNameError(name: string, existingBranches: string[]): string | null {
  if (!name) return null;
  if (!/^[\w./-]+$/.test(name) || name.startsWith('/') || name.endsWith('/')) {
    return 'Enter a valid branch name without leading or trailing slashes.';
  }
  if (existingBranches.includes(name)) return `Branch “${name}” already exists.`;
  return null;
}
