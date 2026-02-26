'use client';

import { ArrowLeft, GitCompare } from 'lucide-react';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { Button } from '@/components/ui/button';

interface CommitInfo {
  hash: string;
  message?: string | null;
  branch?: string | null;
}

interface DiffHeaderProps {
  baseCommit: CommitInfo;
  targetCommit: CommitInfo;
  onClose: () => void;
  /** 'dialog' for backward-compat modal usage, 'page' for full-screen page */
  mode?: 'dialog' | 'page';
  /** Project name for breadcrumb (page mode only) */
  projectName?: string;
}

/**
 * CommitBadge — displays label + branch + hash-pill + message
 *
 * Layout priority (when space is tight):
 *   Always visible:  label (BASE/TARGET), hash pill (8-char mono)
 *   Truncates first:  message, then branch name
 *
 * The hash is inside its own shrink-0 bg-muted pill so it never
 * overflows or merges with adjacent text.
 */
function CommitBadge({ label, commit }: { label: string; commit: CommitInfo }) {
  const shortHash = commit.hash.replace('sha256:', '').slice(0, 8);

  return (
    <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
      <span className="text-xs text-muted-foreground uppercase tracking-wide shrink-0">
        {label}
      </span>
      {commit.branch && (
        <span className="text-xs font-medium text-foreground truncate">{commit.branch}</span>
      )}
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
        {shortHash}
      </span>
      {commit.message && (
        <span className="text-xs text-muted-foreground truncate">{commit.message}</span>
      )}
    </div>
  );
}

export function DiffHeader({
  baseCommit,
  targetCommit,
  onClose,
  mode = 'dialog',
  projectName,
}: DiffHeaderProps) {
  return (
    <div className="flex items-center gap-3 pl-6 pr-12 py-3 border-b border-[var(--stroke-divider)] bg-background shrink-0">
      {mode === 'page' ? (
        <>
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Breadcrumb
            segments={[{ label: projectName || 'Project', href: '#' }, { label: 'Compare' }]}
            className="shrink-0"
          />
          <div className="w-px h-5 bg-[var(--stroke-divider)] shrink-0" />
        </>
      ) : (
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5 shrink-0">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      )}
      <div className="min-w-0 flex-1">
        <CommitBadge label="Base" commit={baseCommit} />
      </div>
      <GitCompare className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <CommitBadge label="Target" commit={targetCommit} />
      </div>
    </div>
  );
}
