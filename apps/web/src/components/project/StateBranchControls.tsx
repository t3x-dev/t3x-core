'use client';

import { Check, ChevronDown, GitBranch, Search, X } from 'lucide-react';
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
    if (!search) return branchOptions;
    return branchOptions.filter((option) => option.toLowerCase().includes(search));
  }, [branchOptions, query]);

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

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') setOpen(false);
  }

  const control = (
    <div className="flex min-w-0 items-center gap-2">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            aria-label={`Switch branches/tags, current branch ${branch}`}
            className="inline-flex h-7 min-w-[164px] max-w-[260px] items-center gap-2 rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2.5 text-xs font-medium text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)] transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)] focus-visible:border-[var(--accent-commit)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/20"
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
          className="flex h-[320px] max-h-[var(--radix-popover-content-available-height)] w-[276px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-[6px] border border-[var(--stroke-default)] bg-[var(--surface-elevated)] p-0 text-xs text-[var(--text-primary)] shadow-[var(--fx-shadow-lg)]"
          onOpenAutoFocus={(event) => event.preventDefault()}
          sideOffset={6}
        >
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] px-3">
            <div className="min-w-0 truncate pr-2 text-[13px] font-semibold">
              Switch branches/tags
            </div>
            <button
              aria-label="Close branch switcher"
              className="inline-flex size-6 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/25"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </div>

          <div className="shrink-0 border-b border-[var(--stroke-divider)] p-2">
            <label className="group relative block h-8 rounded-[6px] bg-[var(--surface-app)] p-[2px] transition-colors focus-within:bg-[var(--accent-commit)]/10">
              <span className="sr-only">Find or create branch</span>
              <span className="pointer-events-none absolute left-[9px] top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-[4px] text-[var(--text-tertiary)] transition-colors group-focus-within:text-[var(--accent-commit)]">
                <Search aria-hidden="true" className="size-3.5" />
              </span>
              <input
                className="h-full w-full rounded-[5px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] pl-8 pr-3 text-xs text-[var(--text-primary)] outline-none shadow-[var(--fx-shadow-sm)] transition-[border-color,box-shadow,color] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-commit)]"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSubmitError(null);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Find or create branch"
                ref={searchRef}
                value={query}
              />
            </label>
          </div>

          <div
            aria-label="Branch switcher tabs"
            className="flex shrink-0 border-b border-[var(--stroke-divider)] px-2"
            role="tablist"
          >
            <button
              aria-selected={activeTab === 'branches'}
              className={cn(
                '-mb-px h-8 border-b-2 px-3 text-xs font-medium transition-colors',
                activeTab === 'branches'
                  ? 'border-[var(--accent-commit)] text-[var(--accent-commit)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
              onClick={() => setActiveTab('branches')}
              role="tab"
              type="button"
            >
              Branches
            </button>
            <button
              aria-selected={activeTab === 'tags'}
              className={cn(
                '-mb-px h-8 border-b-2 px-3 text-xs font-medium transition-colors',
                activeTab === 'tags'
                  ? 'border-[var(--accent-commit)] text-[var(--accent-commit)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
              onClick={() => setActiveTab('tags')}
              role="tab"
              type="button"
            >
              Tags
            </button>
          </div>

          {activeTab === 'branches' ? (
            <>
              <div
                aria-label="Switch branches/tags"
                className="chat-scrollbar min-h-0 flex-1 overflow-y-auto py-1"
                role="menu"
              >
                {filteredBranches.map((option) => {
                  const selected = option === branch;
                  return (
                    <button
                      aria-checked={selected}
                      className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-bg)] focus-visible:bg-[var(--hover-bg)] focus-visible:outline-none"
                      key={option}
                      onClick={() => handleBranchChange(option)}
                      role="menuitemradio"
                      type="button"
                    >
                      <span className="flex size-3.5 shrink-0 items-center justify-center">
                        {selected ? (
                          <Check
                            aria-hidden="true"
                            className="size-3.5 text-[var(--accent-commit)]"
                            strokeWidth={2.5}
                          />
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate',
                          selected && 'font-medium text-[var(--text-primary)]'
                        )}
                      >
                        {option}
                      </span>
                      {option === 'main' ? (
                        <span className="rounded-full border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-1.5 py-0.5 text-xs font-medium leading-4 text-[var(--text-secondary)]">
                          default
                        </span>
                      ) : null}
                    </button>
                  );
                })}

                {filteredBranches.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-[var(--text-tertiary)]">
                    No matching branches.
                  </div>
                ) : null}
              </div>

              <button
                className="flex h-10 w-full shrink-0 items-center justify-center border-t border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-3 text-center text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:bg-[var(--hover-bg)] focus-visible:outline-none"
                onClick={() => {
                  setQuery('');
                  setActiveTab('branches');
                  window.requestAnimationFrame(() => searchRef.current?.focus());
                }}
                type="button"
              >
                View all branches
              </button>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-6 text-center text-xs text-[var(--text-tertiary)]">
              No tags in this state project.
            </div>
          )}
        </PopoverContent>
      </Popover>
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
                <div className="text-xs font-semibold leading-4 text-[var(--text-tertiary)]">
                  Branch source
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="font-mono font-bold text-[var(--text-primary)]">main</span>
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
