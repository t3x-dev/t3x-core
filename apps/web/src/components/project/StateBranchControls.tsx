'use client';

import { Check, ChevronDown, GitBranch, GitFork, Plus, Search, X } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { commitHashLabel } from '@/domain/format/formatters';
import { cn } from '@/utils/cn';
import navigationStyles from './StateNavigationControls.module.css';

interface StateBranchControlsProps {
  appearance?: 'default' | 'subtle';
  branch: string;
  branchOptions: string[];
  canCreateFromSearch?: boolean;
  disabled?: boolean;
  headCommitHash: string | null;
  onBranchChange: (branch: string) => void;
  onCreateBranch: (name: string, fromBranch: string) => Promise<void>;
  showCreate?: boolean;
}

export function StateBranchControls({
  appearance = 'default',
  branch,
  branchOptions,
  canCreateFromSearch = true,
  disabled = false,
  headCommitHash,
  onBranchChange,
  onCreateBranch,
  showCreate = true,
}: StateBranchControlsProps) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [activeTab, setActiveTab] = useState<'branches' | 'tags'>('branches');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedName = normalizeBranchName(name);
  const validationError = getBranchNameError(normalizedName, branchOptions);
  const baseLabel = headCommitHash ? commitHashLabel(headCommitHash) : 'empty state';
  const filteredBranches = useMemo(() => {
    const search = query.trim().toLowerCase();
    const matches = branchOptions.filter((option) => option.toLowerCase().includes(search));
    return matches.includes(branch)
      ? [branch, ...matches.filter((option) => option !== branch)]
      : matches;
  }, [branch, branchOptions, query]);
  const createCandidate = normalizeBranchName(query);
  const canCreateFromQuery =
    canCreateFromSearch &&
    createCandidate.length > 0 &&
    getBranchNameError(createCandidate, branchOptions) === null;

  useEffect(() => {
    if (open) {
      window.requestAnimationFrame(() => searchRef.current?.focus());
      return;
    }
    setQuery('');
    setActiveTab('branches');
  }, [open]);

  useEffect(() => {
    if (dialogOpen) return;
    setName('');
    setSubmitError(null);
    setSubmitting(false);
  }, [dialogOpen]);

  function handleBranchChange(nextBranch: string) {
    if (nextBranch !== branch) onBranchChange(nextBranch);
    setOpen(false);
  }

  async function createNamedBranch(nextName: string) {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onCreateBranch(nextName, branch);
      setDialogOpen(false);
      setOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not create branch.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationError || !normalizedName) return;
    await createNamedBranch(normalizedName);
  }

  const menuRef = useRef<HTMLDivElement>(null);
  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || activeTab !== 'branches') return;
    const options = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []
    );
    if (!options.length) return;
    if (event.key === 'Enter' && event.target === searchRef.current) {
      event.preventDefault();
      options[0].click();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const index = options.indexOf(event.target as HTMLButtonElement);
    if (index < 0 && event.target !== searchRef.current) return;
    event.preventDefault();
    const next =
      index < 0
        ? event.key === 'ArrowDown'
          ? 0
          : options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next].focus();
  }

  const control = (
    <div className="flex min-w-0 items-center gap-2">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            aria-label={`Switch branches/tags, current branch ${branch}`}
            className={cn(
              navigationStyles.branch,
              appearance === 'subtle' && navigationStyles.subtle
            )}
            disabled={disabled}
            type="button"
          >
            <GitBranch
              aria-hidden="true"
              className="size-3.5 shrink-0 text-[var(--accent-branch)] opacity-90"
            />
            <span className="min-w-0 flex-1 truncate text-left font-mono">{branch}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-3.5 shrink-0 text-[var(--text-secondary)] transition-transform',
                open ? 'rotate-180' : undefined
              )}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          aria-label="Switch branch"
          collisionPadding={8}
          sideOffset={6}
          className={navigationStyles.switcher}
          onKeyDown={handleKeys}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className={navigationStyles.heading}>
            <span>
              <GitFork aria-hidden="true" />
            </span>
            <strong>Switch branch</strong>
            <button type="button" aria-label="Close branch switcher" onClick={() => setOpen(false)}>
              <X />
            </button>
          </div>
          {activeTab === 'branches' && (
            <label className={navigationStyles.search}>
              <Search aria-hidden="true" />
              <input
                aria-label={canCreateFromSearch ? 'Find or create branch' : 'Find a branch'}
                placeholder={canCreateFromSearch ? 'Find or create branch' : 'Find a branch'}
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSubmitError(null);
                }}
              />
            </label>
          )}
          <div role="tablist" aria-label="Branch switcher tabs" className={navigationStyles.tabs}>
            {(['branches', 'tags'] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                type="button"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'branches' ? 'Branches' : 'Tags'}
              </button>
            ))}
          </div>
          {activeTab === 'branches' ? (
            <>
              <div
                ref={menuRef}
                role="menu"
                aria-label="Switch branches/tags"
                className={navigationStyles.list}
              >
                {filteredBranches.map((option) => {
                  const match = query.trim(),
                    at = option.toLowerCase().indexOf(match.toLowerCase());
                  return (
                    <button
                      key={option}
                      type="button"
                      role="menuitemradio"
                      aria-checked={option === branch}
                      disabled={submitting}
                      onClick={() => handleBranchChange(option)}
                    >
                      <GitBranch aria-hidden="true" />
                      <code>
                        {match && at >= 0 ? (
                          <>
                            {option.slice(0, at)}
                            <mark>{option.slice(at, at + match.length)}</mark>
                            {option.slice(at + match.length)}
                          </>
                        ) : (
                          option
                        )}
                      </code>
                      {option === branch && (
                        <small>
                          <Check aria-hidden="true" /> Current
                        </small>
                      )}
                    </button>
                  );
                })}
                {canCreateFromQuery && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={submitting}
                    className={navigationStyles.create}
                    onClick={() => void createNamedBranch(createCandidate)}
                  >
                    <Plus aria-hidden="true" />
                    <span>
                      Create branch <b>{createCandidate}</b> from {branch}
                    </span>
                  </button>
                )}
                {!filteredBranches.length && !canCreateFromQuery && <p>No matching branches.</p>}
                {submitError && <p role="alert">{submitError}</p>}
              </div>
              <div className={navigationStyles.hint}>
                ↑ ↓ to browse · Enter to select · Esc to close
              </div>
            </>
          ) : (
            <p className={navigationStyles.hint}>No tags in this state project.</p>
          )}
        </PopoverContent>
      </Popover>
      {showCreate ? (
        <Button
          className="h-7 rounded-[5px] px-2.5 text-xs font-medium shadow-[var(--fx-shadow-sm)]"
          onClick={() => {
            setOpen(false);
            setDialogOpen(true);
          }}
          size="sm"
          type="button"
          variant="canvas-outline"
        >
          New branch
        </Button>
      ) : null}

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Create a new branch</DialogTitle>
              <DialogDescription>
                Start with the same committed content and Schema as {branch}. Future changes stay
                independent. Uncommitted Draft changes are not copied.
              </DialogDescription>
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
                <div className="text-xs font-semibold leading-4 text-[var(--text-tertiary)]">
                  Branch source
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="font-mono font-bold text-[var(--text-primary)]">{branch}</span>
                  <span>at</span>
                  <span className="font-mono text-xs">{baseLabel}</span>
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
                {submitting ? 'Creating...' : 'Create branch'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );

  return control;
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
