'use client';

import { Check, GitBranch, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { listBranches, createBranch } from '@/lib/api/branches';
import { listCommits } from '@/lib/api/commits';
import type { ApiCommit } from '@/lib/api/commits';
import { cn } from '@/lib/utils';

interface BranchSwitcherProps {
  projectId: string;
  activeBranch: string;
  onBranchChange: (branch: string) => void;
}

export function BranchSwitcher({ projectId, activeBranch, onBranchChange }: BranchSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch branches when dropdown opens (with request cancellation)
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    const controller = new AbortController();

    async function fetchBranches() {
      setLoading(true);
      try {
        // Get branches from branches table
        const branchData = await listBranches(projectId).catch(() => ({ branches: [] }));
        const branchNames = new Set<string>(
          (branchData.branches ?? []).map((b: { name: string }) => b.name)
        );

        // Also get unique branch names from commits
        const commits: ApiCommit[] = await listCommits(projectId, undefined, 100).catch(() => []);
        for (const c of commits) {
          if (c.branch) branchNames.add(c.branch);
        }

        // Always include main
        branchNames.add('main');

        if (!cancelled) {
          setBranches(Array.from(branchNames).sort((a, b) => {
            if (a === 'main') return -1;
            if (b === 'main') return 1;
            return a.localeCompare(b);
          }));
        }
      } catch {
        if (!cancelled) setBranches(['main']);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBranches();
    return () => { cancelled = true; controller.abort(); };
  }, [open, projectId]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setNewName('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus input when creating
  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [creating]);

  const handleSelect = useCallback((branch: string) => {
    onBranchChange(branch);
    setOpen(false);
    setCreating(false);
    setNewName('');
  }, [onBranchChange]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim().replace(/\s+/g, '-');
    if (!name || !projectId || !/^[\w\-/.]+$/.test(name)) return;

    try {
      await createBranch(projectId, name, activeBranch);
    } catch {
      // Branch not persisted to branches table — commit will still use this name.
      // The branch will appear in the list next time via commit branch labels.
    }
    handleSelect(name);
    setBranches((prev) => prev.includes(name) ? prev : [...prev, name]);
  }, [newName, projectId, activeBranch, handleSelect]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1 text-xs cursor-pointer',
          'text-[var(--accent-commit)] bg-[var(--accent-commit)]/10',
          'px-2 py-0.5 rounded-md',
          'hover:bg-[var(--accent-commit)]/20 transition-colors',
        )}
      >
        <GitBranch className="h-3 w-3 shrink-0" />
        <span className="truncate max-w-[80px]">{activeBranch}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className={cn(
          'absolute top-full mt-1 left-0 z-50 min-w-[180px]',
          'rounded-lg border border-[var(--stroke-divider)]',
          'bg-[var(--surface-panel)] shadow-lg',
          'py-1 text-xs',
        )}>
          {loading ? (
            <div className="px-3 py-2 text-[var(--text-tertiary)]">Loading...</div>
          ) : (
            <>
              {branches.map((branch) => (
                <button
                  key={branch}
                  type="button"
                  onClick={() => handleSelect(branch)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer',
                    'hover:bg-[var(--hover-bg)] transition-colors',
                    branch === activeBranch
                      ? 'text-[var(--accent-commit)] font-medium'
                      : 'text-[var(--text-secondary)]',
                  )}
                >
                  <GitBranch className="h-3 w-3 shrink-0 opacity-50" />
                  <span className="truncate flex-1">{branch}</span>
                  {branch === activeBranch && <Check className="h-3 w-3 shrink-0" />}
                </button>
              ))}

              <div className="border-t border-[var(--stroke-divider)] mt-1 pt-1">
                {creating ? (
                  <div className="px-3 py-1.5 flex items-center gap-1.5">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreate();
                        if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                      }}
                      placeholder="feature/..."
                      className={cn(
                        'flex-1 min-w-0 bg-transparent outline-none',
                        'text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
                      )}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer',
                      'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
                      'hover:bg-[var(--hover-bg)] transition-colors',
                    )}
                  >
                    <Plus className="h-3 w-3 shrink-0" />
                    <span>New branch</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
