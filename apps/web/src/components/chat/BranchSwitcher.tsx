'use client';

import { Check, GitBranch, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBranches } from '@/hooks/shared/useBranches';
import { cn } from '@/utils/cn';

interface BranchSwitcherProps {
  projectId: string;
  activeBranch: string;
  onBranchChange: (branch: string) => void;
}

export function BranchSwitcher({ projectId, activeBranch, onBranchChange }: BranchSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { branches, loading, create } = useBranches(projectId, open);

  // Compute dropdown position from trigger button
  const [dropdownPos, setDropdownPos] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

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
    await create(name, activeBranch);
    handleSelect(name);
  }, [newName, projectId, activeBranch, handleSelect, create]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
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

      {/* Dropdown — rendered via portal to escape stacking context */}
      {open && createPortal(
        <div
          ref={dropdownRef}
          className={cn(
            'fixed z-[9999] min-w-[180px]',
            'rounded-lg border border-[var(--stroke-divider)]',
            'bg-[var(--surface-panel)] shadow-lg',
            'py-1 text-xs',
          )}
          style={dropdownPos}
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}
